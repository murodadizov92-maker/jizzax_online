"""MeatCity Jizzax — Online zakas (3D Mini App) backend.

aiohttp + SQLite. Telegram bilan faqat HTTP orqali ishlaydi (aiogram shart emas).
Mahsulot / narx / rasmlar mavjud zakas bot'dan (PRODUCTS_URL) olinadi, shuning uchun
u yerda o'zgartirsangiz bu yerda ham avtomatik yangilanadi.
"""
import asyncio
import hashlib
import hmac
import io
import json
import logging
import os
import re
import sqlite3
import time
from difflib import SequenceMatcher
from pathlib import Path
from urllib.parse import parse_qsl, urljoin

import aiohttp
from aiohttp import web

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("online")

BASE = Path(__file__).parent
BOT_TOKEN = os.getenv("BOT_TOKEN", "")
ADMIN_IDS = {int(x) for x in os.getenv("ADMIN_IDS", "").replace(" ", "").split(",") if x}
CHAT_ID = os.getenv("CHAT_ID", "")            # zakas guruhi ID (masalan -1001234567890)
TOPIC_ID = os.getenv("TOPIC_ID", "")          # "Жиззах онлайн закас" topik ID
APP_LINK = os.getenv("APP_LINK", "")          # https://t.me/<bot>/<app>  (guruhdagi tugma uchun)
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()  # zakas bot bilan BIR XIL Supabase bazasi (faqat o'qiladi)
PRODUCTS_URL = os.getenv("PRODUCTS_URL", "")  # zakas bot'ning mahsulot API manzili
PRODUCTS_TOKEN = os.getenv("PRODUCTS_TOKEN", "")  # kerak bo'lsa (Bearer)
DB_PATH = os.getenv("DB_PATH", str(BASE / "data" / "online.db"))
DEV = os.getenv("DEV") == "1"                 # faqat lokal sinov uchun
SELF_URL = os.getenv("RENDER_EXTERNAL_URL", os.getenv("SELF_URL", ""))
# Sales Doctor (sklad qoldig'i): login/parol faqat Render env'ga yoziladi, kodda yo'q
SD_DOMAIN = os.getenv("SD_DOMAIN", "aslbarakadzk.salesdoc.io").strip("/ ")
SD_URL = (SD_DOMAIN if SD_DOMAIN.startswith("http") else f"https://{SD_DOMAIN}") + "/api/v2"
SD_LOGIN = os.getenv("SD_LOGIN", "")
SD_PASSWORD = os.getenv("SD_PASSWORD", "")
SD_WAREHOUSE = os.getenv("SD_WAREHOUSE", "").strip()        # ixtiyoriy: faqat shu sklad nomi
SD_INTERVAL = int(os.getenv("SD_INTERVAL", "600"))          # soniya
STATUSES = ["new", "collecting", "on_way", "delivered"]
STATUS_TEXT = {
    "new": "🆕 Qabul qilindi",
    "collecting": "📦 Yig'ilmoqda",
    "on_way": "🚚 Yo'lda",
    "delivered": "✅ Yetkazildi",
}

# ---------------------------------------------------------------- DB
Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
db = sqlite3.connect(DB_PATH, check_same_thread=False)
db.row_factory = sqlite3.Row
db.executescript(
    """
CREATE TABLE IF NOT EXISTS users(
  tg_id INTEGER PRIMARY KEY, name TEXT, username TEXT, region TEXT,
  created INTEGER, last_seen INTEGER);
CREATE TABLE IF NOT EXISTS clients(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ext_id TEXT UNIQUE, name TEXT, phone TEXT, region TEXT,
  address TEXT, agent TEXT DEFAULT '', search TEXT);
CREATE INDEX IF NOT EXISTS idx_clients_region ON clients(region);
CREATE TABLE IF NOT EXISTS orders(
  id INTEGER PRIMARY KEY AUTOINCREMENT, tg_id INTEGER, user_name TEXT,
  client_id INTEGER, client_name TEXT, region TEXT, items TEXT, total REAL,
  status TEXT DEFAULT 'new', comment TEXT, created INTEGER, updated INTEGER);
CREATE TABLE IF NOT EXISTS stock(
  key TEXT PRIMARY KEY, name TEXT, qty REAL, unit TEXT DEFAULT '', src TEXT, updated INTEGER);
CREATE TABLE IF NOT EXISTS pmeta(pid TEXT PRIMARY KEY, unit TEXT);
CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT);
"""
)
db.commit()


# ---------------------------------------------------------------- SKLAD (ostatka)
_stock = {"t": 0, "src": "", "rows": 0, "error": "", "ver": 0}
_match_cache: dict = {}


def pkey(name: str):
    """Mahsulot nomini taqqoslash uchun: (harf skeleti, raqamlar to'plami). Kirill/lotin farqsiz."""
    s = re.sub(r"\s*\*[^*]*\*\s*$", "", name or "")
    s = re.sub(r"(?<=\d),(?=\d)", ".", s.lower())
    nums = frozenset(re.findall(r"\d+(?:\.\d+)?", s))
    return re.sub(r"[^a-z0-9]", "", translit(s)), nums


def stock_index():
    idx = {}
    for r in db.execute("SELECT key,name,qty,unit FROM stock").fetchall():
        k, nums = pkey(r["name"])
        idx[r["key"]] = (k, nums, dict(r))
    return idx


def assign_stock(items: list, idx: dict) -> dict:
    """Har bir sklad qatori faqat BITTA mahsulotga biriktiriladi (eng o'xshashiga); raqamlar (0,5 / 0,9 kg) bir xil bo'lishi shart."""
    ck = (_stock["ver"], hash(tuple((p["id"], p["name"]) for p in items)))
    if _match_cache.get("ck") == ck:
        return _match_cache["map"]
    by_nums: dict = {}
    for key, (k2, n2, row) in idx.items():
        by_nums.setdefault(n2, []).append((key, k2, row))
    pairs = []
    for p in items:
        k, nums = pkey(p["name"])
        if not k:
            continue
        for key, k2, row in by_nums.get(nums, []):
            r = 1.0 if k == k2 else SequenceMatcher(None, k, k2).ratio()
            if r >= 0.9:
                pairs.append((r, p["id"], key, row))
    pairs.sort(key=lambda x: -x[0])
    used_p, used_s, res = set(), set(), {}
    for r, pid, key, row in pairs:
        if pid in used_p or key in used_s:
            continue
        used_p.add(pid)
        used_s.add(key)
        res[pid] = row
    _match_cache.clear()
    _match_cache.update(ck=ck, map=res)
    return res


def guess_unit(p: dict, stock_unit: str = "") -> str:
    if re.match(r"\s*(кг|kg|килограмм)", (stock_unit or "").lower()):
        return "kg"
    return "kg" if re.search(r"\b(вес|весов|ves|vesovoy)", (p.get("name") or "").lower()) else "dona"


def annotate(items: list) -> list:
    idx = stock_index()
    meta = {r["pid"]: r["unit"] for r in db.execute("SELECT pid,unit FROM pmeta").fetchall()}
    out = []
    amap = assign_stock(items, idx) if idx else {}
    for p in items:
        q = dict(p)
        row = amap.get(p["id"])
        q["stock"] = row["qty"] if row else None
        q["stock_unit"] = (row["unit"] if row else "") or ""
        q["unit"] = meta.get(p["id"]) or guess_unit(p, q["stock_unit"])
        q["unit_set"] = p["id"] in meta
        out.append(q)
    return out


def save_stock(rows: list, src: str):
    """rows: [(name, qty, unit)] — bir xil nomlar yig'iladi (bir nechta sklad bo'lsa)."""
    agg: dict = {}
    for name, qty, unit in rows:
        name = (name or "").strip()
        if not name:
            continue
        k = re.sub(r"[^a-z0-9]", "", translit(name)) + "|" + "_".join(sorted(pkey(name)[1]))
        if k in agg:
            agg[k][1] += qty
        else:
            agg[k] = [name, qty, unit or ""]
    db.execute("DELETE FROM stock")
    t = now()
    for k, (name, qty, unit) in agg.items():
        db.execute("INSERT OR REPLACE INTO stock(key,name,qty,unit,src,updated) VALUES(?,?,?,?,?,?)", (k, name, qty, unit, src, t))
    db.commit()
    _stock.update(t=t, src=src, rows=len(agg), error="", ver=_stock["ver"] + 1)
    _match_cache.clear()
    return len(agg)


# Sales Doctor API v2 (https://github.com/Clever91/salesdoc-api-doc): POST https://{domain}/api/v2
#   1) {"method":"login","auth":{"login","password"}} -> result.userId, result.token
#   2) {"method":"getStock","auth":{"userId","token"},"params":{...}} -> result: sklad -> products[].name / quantity
_sd = {"auth": None, "block": 0, "url": None}


def kv_get(k):
    r = db.execute("SELECT v FROM kv WHERE k=?", (k,)).fetchone()
    return r["v"] if r else None


def kv_set(k, v):
    db.execute("INSERT OR REPLACE INTO kv(k,v) VALUES(?,?)", (k, v))
    db.commit()


SD_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "application/json", "Content-Type": "application/json",
}


async def sd_post(body: dict):
    """nginx ba'zan oddiy Python User-Agent'ni 403 bilan to'xtatadi — brauzer sarlavhalari bilan yuboramiz.
    Ishlagan manzil eslab qolinadi; keraksiz qayta so'rovlar yo'q (Sales Doctor 429 limiti bor)."""
    urls = [_sd["url"]] if _sd["url"] else [SD_URL, SD_URL + "/"]
    last = (0, None, "")
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=90), headers=SD_HEADERS) as s:
        for url in urls:
            async with s.post(url, json=body) as r:
                txt = await r.text()
                try:
                    data = json.loads(txt)
                except Exception:
                    data = None
                last = (r.status, data, txt)
                if r.status == 429:
                    _sd["block"] = now() + 900
                if r.status not in (403, 404):
                    _sd["url"] = url
                    return last
    return last


async def sd_login():
    st, data, txt = await sd_post({"method": "login", "auth": {"login": SD_LOGIN, "password": SD_PASSWORD}})
    res = (data or {}).get("result") or {}
    if not res.get("token"):
        if st == 429:
            raise RuntimeError("Sales Doctor so'rovlar limitini to'ldirdi (429). 15 daqiqa kuting, tugmani qayta-qayta bosmang.")
        raise RuntimeError(f"Sales Doctor login xato (HTTP {st}): {(txt or '')[:300]}")
    _sd["auth"] = {"userId": res.get("userId"), "token": res["token"]}
    kv_set("sd_auth", json.dumps(_sd["auth"]))


def parse_stock(node, wh="", out=None):
    """getStock javobidan [(nom, miqdor)] — sklad nomi SD_WAREHOUSE berilgan bo'lsa shunga mos kelganlari."""
    out = [] if out is None else out
    if isinstance(node, dict):
        name = node.get("name") if isinstance(node.get("name"), str) else wh
        if "quantity" in node and isinstance(node.get("name"), str) and "products" not in node:
            if not SD_WAREHOUSE or SD_WAREHOUSE.lower() in (wh or "").lower():
                out.append((node["name"], _num(node["quantity"]), ""))
            return out
        for v in node.values():
            parse_stock(v, name if "products" in node else wh, out)
    elif isinstance(node, list):
        for v in node:
            parse_stock(v, wh, out)
    return out


async def sd_get_all(method: str, params=None):
    """GET usuli: sahifalab (limit/page) hammasini oladi. Token eskirsa qayta login qiladi."""
    rows, last = [], None
    for page in range(1, 40):
        for attempt in range(2):
            if not _sd["auth"]:
                try:
                    _sd["auth"] = json.loads(kv_get("sd_auth") or "null")     # restartdan keyin ham eski token ishlatiladi (qayta login qilmaymiz)
                except Exception:
                    _sd["auth"] = None
            if not _sd["auth"]:
                await sd_login()
            st, data, txt = await sd_post({"method": method, "auth": _sd["auth"], "params": {**(params or {}), "limit": 1000, "page": page}})
            err = ((data or {}).get("error") or {}) if isinstance(data, dict) else {}
            if err.get("code") == 401 and attempt == 0:
                _sd["auth"] = None
                kv_set("sd_auth", "null")
                await sd_login()
                continue
            break
        last = (st, txt)
        if not data or not data.get("status"):
            raise RuntimeError(f"{method}: HTTP {st}: {(txt or '')[:300]}")
        part = parse_stock((data or {}).get("result"))
        rows += part
        pg = data.get("pagination") or {}
        total_pages = pg.get("pages") or pg.get("pageCount") or pg.get("totalPages")
        if total_pages is not None:
            if page >= int(total_pages):
                break
        elif len(part) < 1000:
            break
    return rows, last


async def sync_stock(debug=False):
    if not (SD_LOGIN and SD_PASSWORD):
        _stock["error"] = "SD_LOGIN / SD_PASSWORD kiritilmagan"
        return {"ok": False, "error": _stock["error"]}
    if now() < _sd["block"]:
        _stock["error"] = f"Sales Doctor limiti: {max(1, (_sd['block'] - now()) // 60)} daqiqadan keyin urinib ko'ring"
        return {"ok": False, "error": _stock["error"]}
    try:
        rows, last = await sd_get_all("getStock")
    except Exception as e:
        _sd["auth"] = None
        _stock["error"] = str(e)[:300]
        return {"ok": False, "error": _stock["error"]}
    if not rows:
        _stock["error"] = "getStock javobida mahsulot topilmadi"
        return {"ok": False, "error": _stock["error"], "tried": [{"http": last[0], "sample": (last[1] or "")[:700]}] if last else []}
    n = save_stock(rows, "sd")
    return {"ok": True, "method": "getStock", "rows": n}


async def stock_loop():
    if not (SD_LOGIN and SD_PASSWORD):
        return
    if _stock["t"] and now() - _stock["t"] < SD_INTERVAL:
        await asyncio.sleep(SD_INTERVAL - (now() - _stock["t"]))
    while True:
        wait = max(120, SD_INTERVAL)
        try:
            r = await sync_stock()
            log.info("stock sync: %s", {k: v for k, v in r.items() if k != "tried"})
            if not r.get("ok"):
                wait = max(wait, 1800)          # xato bo'lsa 30 daqiqa kutamiz (limitga urilmaslik uchun)
        except Exception as e:
            _stock["error"] = str(e)[:200]
            log.warning("stock sync failed: %s", e)
            wait = max(wait, 1800)
        await asyncio.sleep(wait)


def read_stock_xlsx(data: bytes) -> list:
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    ws = wb.active
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    hdr_i, cn, cq, cu = None, None, None, None
    for i, r in enumerate(rows[:15]):
        low = [str(c or "").strip().lower() for c in r]
        n = next((j for j, c in enumerate(low) if any(k in c for k in ("наимен", "товар", "nom", "mahsulot", "name", "продукт"))), None)
        q = next((j for j, c in enumerate(low) if any(k in c for k in ("остат", "qoldiq", "ostatok", "кол", "qty", "balance", "stock", "сумма кол"))), None)
        if n is not None and q is not None:
            hdr_i, cn, cq = i, n, q
            cu = next((j for j, c in enumerate(low) if c.startswith(("ед", "birlik", "unit", "o'lchov"))), None)
            break
    out = []
    if hdr_i is None:                       # sarlavha topilmasa: birinchi matn ustuni + oxirgi son ustuni
        for r in rows:
            txt = [c for c in r if isinstance(c, str) and c.strip()]
            nums = [c for c in r if isinstance(c, (int, float))]
            if txt and nums:
                out.append((txt[0], float(nums[-1]), ""))
        return out
    for r in rows[hdr_i + 1:]:
        if cn >= len(r) or cq >= len(r) or not r[cn]:
            continue
        v = r[cq]
        if isinstance(v, str):
            v = _num(v)
        if not isinstance(v, (int, float)):
            continue
        out.append((str(r[cn]), float(v), str(r[cu] or "") if cu is not None and cu < len(r) else ""))
    return out


# ---------------------------------------------------------------- yordamchilar
_CYR = dict(zip(
    "абвгдеёжзийклмнопрстуфхцчшщъыьэюяўқғҳ",
    ["a", "b", "v", "g", "d", "e", "yo", "j", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r",
     "s", "t", "u", "f", "x", "ts", "ch", "sh", "sh", "", "i", "", "e", "yu", "ya", "o", "q", "g", "x"],
))


def translit(text: str) -> str:
    """Kirill/lotin va turli yozilishlarni bitta 'skelet' ko'rinishiga keltiradi (faqat qidiruv uchun)."""
    t = (text or "").lower()
    for ch in "’`ʻʼ‘'":
        t = t.replace(ch, "")
    t = "".join(_CYR.get(ch, ch) for ch in t)
    for a, b in (("sh", "s"), ("ch", "c"), ("ts", "s"), ("kh", "h"), ("zh", "j"), ("yo", "o"), ("yu", "u"),
                 ("ya", "a"), ("ye", "e"), ("gh", "g"), ("x", "h"), ("q", "k"), ("w", "v"), ("y", "i"),
                 ("u", "o"), ("e", "i")):
        t = t.replace(a, b)
    out = []
    for ch in t:  # qo'sh harflar (kk, ll) bitta bo'lsin
        if not out or out[-1] != ch:
            out.append(ch)
    return "".join(out)


def norm(text: str) -> str:
    """Asl (kichik harf) + skelet ko'rinishi."""
    return f"{(text or '').lower()} {translit(text)}"


def reindex_clients():
    for r in db.execute("SELECT id,name,phone,region,address,agent FROM clients").fetchall():
        db.execute("UPDATE clients SET search=? WHERE id=?",
                   (norm(f"{r['name']} {r['phone']} {r['region']} {r['address']} {r['agent']}"), r["id"]))
    db.commit()


def now() -> int:
    return int(time.time())


def verify_init(init: str):
    if not init or not BOT_TOKEN:
        return None
    data = dict(parse_qsl(init, keep_blank_values=True))
    got = data.pop("hash", None)
    check = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
    secret = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
    calc = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    if not got or not hmac.compare_digest(calc, got):
        return None
    if now() - int(data.get("auth_date", 0)) > 7 * 86400:
        return None
    try:
        return json.loads(data["user"])
    except Exception:
        return None


@web.middleware
async def auth_mw(request: web.Request, handler):
    if request.path.startswith("/api/"):
        user = verify_init(request.headers.get("X-Init-Data", ""))
        if not user and DEV and request.headers.get("X-Dev-User"):
            uid = int(request.headers["X-Dev-User"])
            user = {"id": uid, "first_name": f"Dev{uid}", "username": f"dev{uid}"}
        if not user:
            return web.json_response({"error": "auth"}, status=401)
        name = " ".join(x for x in [user.get("first_name"), user.get("last_name")] if x) or "Foydalanuvchi"
        db.execute(
            "INSERT INTO users(tg_id,name,username,created,last_seen) VALUES(?,?,?,?,?) "
            "ON CONFLICT(tg_id) DO UPDATE SET name=excluded.name, username=excluded.username, last_seen=excluded.last_seen",
            (user["id"], name, user.get("username"), now(), now()),
        )
        db.commit()
        request["uid"] = user["id"]
        request["uname"] = name
        request["admin"] = user["id"] in ADMIN_IDS
    return await handler(request)


def need_admin(request):
    if not request["admin"]:
        raise web.HTTPForbidden(text=json.dumps({"error": "admin only"}), content_type="application/json")


# ---------------------------------------------------------------- mahsulotlar (zakas bot bilan sinxron)
_cache = {"t": 0, "items": []}


def _pick(d: dict, *keys, default=None):
    for k in keys:
        if k in d and d[k] not in (None, ""):
            return d[k]
    return default


def _num(v):
    try:
        return float(str(v).replace(" ", "").replace(",", "."))
    except Exception:
        return 0.0


def map_products(raw) -> list:
    if isinstance(raw, dict):
        for key in ("products", "items", "data", "catalog", "result"):
            if isinstance(raw.get(key), (list, dict)):
                raw = raw[key]
                break
    if isinstance(raw, dict):  # {kategoriya: [mahsulotlar]} yoki {id: mahsulot}
        flat = []
        for k, v in raw.items():
            if isinstance(v, list):
                for p in v:
                    if isinstance(p, dict):
                        p.setdefault("category", k)
                        flat.append(p)
            elif isinstance(v, dict):
                v.setdefault("id", k)
                flat.append(v)
        raw = flat
    out = []
    for i, p in enumerate(raw or []):
        if not isinstance(p, dict):
            continue
        name = _pick(p, "name", "title", "nom", "product_name", "название")
        if not name:
            continue
        img = _pick(p, "image_url", "image", "img", "photo", "photo_url", "picture", default="")
        if img and PRODUCTS_URL and not str(img).startswith(("http", "data:")):
            img = urljoin(PRODUCTS_URL, str(img))
        out.append({
            "id": str(_pick(p, "id", "product_id", "code", "sku", default=i)),
            "name": re.sub(r"\s*\*[^*]*\*\s*$", "", re.sub(r"\s{2,}", " ", str(name))).strip() or str(name),
            "price": _num(_pick(p, "price", "narx", "cost", "цена", default=0)),
            "image": img or "",
            "category": str(_pick(p, "category", "kategoriya", "cat", "group", default="Boshqa")),
            "unit": str(_pick(p, "unit", "birlik", default="")),
            "active": bool(_pick(p, "active", "enabled", "available", default=True)),
        })
    return [p for p in out if p["active"]]


_pg = {"pool": None}


async def fetch_db_products() -> list:
    """Zakas bot bazasidagi products jadvalidan (narx, rasm, kategoriya) to'g'ridan-to'g'ri o'qiydi."""
    import asyncpg
    if _pg["pool"] is None:
        _pg["pool"] = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=2, statement_cache_size=0, command_timeout=15)
    async with _pg["pool"].acquire() as c:
        rows = await c.fetch("select id,name,price,category,image_url from products where active order by sort,id")
    return map_products([{"id": r["id"], "name": r["name"], "price": r["price"], "category": r["category"],
                          "image": r["image_url"] or ""} for r in rows])


async def get_products(force=False) -> list:
    if not force and _cache["items"] and now() - _cache["t"] < 45:
        return _cache["items"]
    items = []
    if DATABASE_URL:                       # 1) asosiy manba: zakas bot bazasi
        try:
            items = await fetch_db_products()
        except Exception as e:
            log.warning("DB products sync failed: %s", e)
    if not items and PRODUCTS_URL:         # 2) zaxira: HTTP manzil
        try:
            headers = {"Authorization": f"Bearer {PRODUCTS_TOKEN}"} if PRODUCTS_TOKEN else {}
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as s:
                async with s.get(PRODUCTS_URL, headers=headers) as r:
                    r.raise_for_status()
                    items = map_products(await r.json(content_type=None))
        except Exception as e:
            log.warning("products sync failed: %s", e)
    if not items:                          # 3) oxirgi zaxira: fayl
        f = BASE / "data" / "products.json"
        if f.exists():
            items = map_products(json.loads(f.read_text("utf-8")))
    if items:
        _cache.update(t=now(), items=items)
    return _cache["items"] or items


# ---------------------------------------------------------------- Telegram (oddiy HTTP)
async def tg(method: str, **params):
    if not BOT_TOKEN:
        return None
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=40)) as s:
            async with s.post(f"https://api.telegram.org/bot{BOT_TOKEN}/{method}", json=params) as r:
                return await r.json()
    except Exception as e:
        log.warning("tg %s failed: %s", method, e)


def topic_params():
    p = {"chat_id": CHAT_ID}
    if TOPIC_ID:
        p["message_thread_id"] = int(TOPIC_ID)
    return p


def money(v) -> str:
    return f"{int(round(v)):,}".replace(",", " ")


async def notify_order(o: dict):
    if not CHAT_ID:
        return
    lines = [f"🆕 <b>Zakas #{o['id']}</b>", f"👤 {o['client_name']}" + (f" ({o['region']})" if o["region"] else ""),
             f"🧑‍💼 {o['user_name']}", ""]
    for it in o["items"]:
        lines.append(f"• {it['name']} × {it['qty']:g} {it.get('unit', '')} = {money(it['price'] * it['qty'])}" + (" ⚠️" if it.get("short") else ""))
    lines += ["", f"💰 <b>Jami: {money(o['total'])} so'm</b>"]
    short = [i for i in o["items"] if i.get("short")]
    if short:
        lines += ["", "⚠️ <b>Skladda yetmaydi:</b>"]
        for i in short:
            have = i.get("stock") or 0
            lines.append(f"• {i['name']}: so'ralgan {i['qty']:g}, skladda {have:g} (yetmaydi {i['short']:g})" + (f"\n   ✍️ {i['note']}" if i.get("note") else ""))
    if o.get("comment"):
        lines.append(f"💬 {o['comment']}")
    await tg("sendMessage", text="\n".join(lines), parse_mode="HTML", **topic_params())


async def poll_bot():
    """/start (shaxsiy) va /panel (topik) buyruqlari uchun oddiy long-polling."""
    if not BOT_TOKEN:
        return
    await tg("deleteWebhook")
    offset = 0
    while True:
        res = await tg("getUpdates", offset=offset, timeout=25, allowed_updates=["message"])
        if not res or not res.get("ok"):
            await asyncio.sleep(5)
            continue
        for u in res["result"]:
            offset = u["update_id"] + 1
            m = u.get("message") or {}
            text = (m.get("text") or "").split("@")[0].strip()
            chat = m.get("chat", {})
            if text in ("/start", "/panel") and APP_LINK:
                kb = {"inline_keyboard": [[{"text": "🥩 Online zakas'ni ochish", "url": APP_LINK}]]}
                if chat.get("type") == "private":
                    kb = {"inline_keyboard": [[{"text": "🥩 Online zakas'ni ochish", "web_app": {"url": f"{SELF_URL}/"}}]]} if SELF_URL else kb
                p = {"chat_id": chat["id"], "text": "🥩 MeatCity Jizzax — online zakas\nZakas berish uchun tugmani bosing 👇", "reply_markup": kb}
                if m.get("message_thread_id"):
                    p["message_thread_id"] = m["message_thread_id"]
                sent = await tg("sendMessage", **p)
                if chat.get("type") != "private":
                    # faqat admin /panel yozsa: xabarni pin qilamiz va buyruq xabarini o'chiramiz (topik toza qolsin)
                    if (m.get("from") or {}).get("id") in ADMIN_IDS and sent and sent.get("ok"):
                        await tg("pinChatMessage", chat_id=chat["id"], message_id=sent["result"]["message_id"], disable_notification=True)
                        await tg("deleteMessage", chat_id=chat["id"], message_id=m["message_id"])


async def keepalive():
    """Render uxlab qolmasligi uchun o'zini har 10 daqiqada chaqiradi (UptimeRobot ham qo'yish tavsiya etiladi)."""
    if not SELF_URL:
        return
    while True:
        await asyncio.sleep(600)
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=20)) as s:
                await s.get(f"{SELF_URL}/health")
        except Exception:
            pass


# ---------------------------------------------------------------- API
def row_order(r) -> dict:
    d = dict(r)
    d["items"] = json.loads(d["items"] or "[]")
    return d


async def h_health(request):
    return web.json_response({"ok": True, "t": now()})


async def h_me(request):
    u = db.execute("SELECT * FROM users WHERE tg_id=?", (request["uid"],)).fetchone()
    return web.json_response({
        "id": u["tg_id"], "name": u["name"], "region": u["region"] or "", "admin": request["admin"],
        "clients": db.execute("SELECT COUNT(*) c FROM clients").fetchone()["c"],
    })


async def h_me_put(request):
    body = await request.json()
    db.execute("UPDATE users SET region=? WHERE tg_id=?", (str(body.get("region", ""))[:80], request["uid"]))
    db.commit()
    return web.json_response({"ok": True})


async def h_products(request):
    items = await get_products(force=request.query.get("force") == "1" and request["admin"])
    return web.json_response({"items": annotate(items), "t": _cache["t"], "stock_t": _stock["t"]})


async def h_unit(request):
    need_admin(request)
    u = (await request.json()).get("unit")
    if u not in ("kg", "dona"):
        return web.json_response({"error": "unit"}, status=400)
    db.execute("INSERT OR REPLACE INTO pmeta(pid,unit) VALUES(?,?)", (request.match_info["id"], u))
    db.commit()
    return web.json_response({"ok": True})


async def h_stock_status(request):
    need_admin(request)
    items = await get_products()
    ann = annotate(items)
    matched = sum(1 for p in ann if p["stock"] is not None)
    return web.json_response({**_stock, "sd": bool(SD_LOGIN and SD_PASSWORD), "products": len(ann), "matched": matched,
                              "unit_unset": sum(1 for p in ann if not p["unit_set"]),
                              "unmatched": [p["name"] for p in ann if p["stock"] is None][:15]})


async def h_stock_sync(request):
    need_admin(request)
    return web.json_response(await sync_stock(debug=request.query.get("debug") == "1"))


async def h_stock_import(request):
    need_admin(request)
    r = await request.multipart()
    f = await r.next()
    data = await f.read(decode=False)
    try:
        rows = read_stock_xlsx(data)
    except Exception as e:
        return web.json_response({"error": f"Excel o'qilmadi: {e}"}, status=400)
    if not rows:
        return web.json_response({"error": "Fayldan qoldiq topilmadi (ustunlar: Наименование, Остаток)"}, status=400)
    return web.json_response({"ok": True, "rows": save_stock(rows, "excel")})


async def h_regions(request):
    # filtr endi AGENT bo'yicha (kalit nomi "region" frontend bilan mos qolishi uchun saqlandi)
    rows = db.execute("SELECT agent, COUNT(*) c FROM clients WHERE agent!='' GROUP BY agent ORDER BY c DESC").fetchall()
    return web.json_response({"items": [{"region": r["agent"], "count": r["c"]} for r in rows]})


async def h_clients(request):
    region = request.query.get("region", "").strip()
    sql, args = "SELECT id,name,phone,region,address,agent FROM clients WHERE 1=1", []
    if region:
        sql += " AND agent=?"
        args.append(region)
    term = request.query.get("q", "").strip()
    for w in term.split():  # har bir so'z topilishi kerak (tartibi ahamiyatsiz)
        sql += " AND (search LIKE ? OR search LIKE ?)"
        args += [f"%{w.lower()}%", f"%{translit(w)}%"]
    sql += " ORDER BY name LIMIT 60"
    rows = db.execute(sql, args).fetchall()
    return web.json_response({"items": [dict(r) for r in rows]})


async def h_clients_import(request):
    need_admin(request)
    reader = await request.multipart()
    field = await reader.next()
    content = bytes(await field.read())
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return web.json_response({"error": "fayl bo'sh"}, status=400)
    head = [str(c or "").strip().lower() for c in rows[0]]

    def col(keys, skip=("ид", "id", "код")):
        for i, h in enumerate(head):
            if any(k in h for k in keys) and not any(h == x or h.startswith(x + " ") for x in skip):
                return i
        return None

    i_ext = next((i for i, h in enumerate(head) if h in ("ид клиента", "id клиента", "id", "ид", "код клиента")), None)
    i_name = col(("название", "наименование", "name", "nom", "mijoz", "клиент", "контрагент"))
    i_phone = col(("phone", "tel", "тел", "raqam"))
    i_reg = col(("территор", "region", "hudud", "shahar", "tuman", "район", "город", "регион"))
    i_addr = col(("address", "manzil", "адрес"))
    i_agent = col(("агент", "agent"))
    if i_name is None:
        return web.json_response({"error": "Ustun topilmadi: 'Название клиента' (yoki Nom) ustuni kerak"}, status=400)

    def clean_agent(v):  # "Жабборов Самариддин (Пахтакор)(Вс)" -> "Жабборов Самариддин"
        return str(v or "").split("(")[0].strip()

    def cell(r, i):
        return str(r[i] or "").strip() if i is not None and i < len(r) else ""

    added = 0
    for r in rows[1:]:
        name = cell(r, i_name)
        if not name:
            continue
        ext = cell(r, i_ext) or name
        phone, region, addr = cell(r, i_phone), cell(r, i_reg), cell(r, i_addr)
        agent = clean_agent(cell(r, i_agent))
        search = norm(f"{name} {phone} {region} {addr} {agent}")
        db.execute(
            "INSERT INTO clients(ext_id,name,phone,region,address,agent,search) VALUES(?,?,?,?,?,?,?) "
            "ON CONFLICT(ext_id) DO UPDATE SET name=excluded.name,phone=excluded.phone,region=excluded.region,"
            "address=excluded.address,agent=excluded.agent,search=excluded.search",
            (ext, name, phone, region, addr, agent, search),
        )
        added += 1
    db.commit()
    return web.json_response({"ok": True, "rows": added})


async def h_client_add(request):
    need_admin(request)
    b = await request.json()
    name = str(b.get("name", "")).strip()
    if not name:
        return web.json_response({"error": "nom kerak"}, status=400)
    phone, region, addr = (str(b.get(k, "")).strip() for k in ("phone", "region", "address"))
    db.execute(
        "INSERT OR REPLACE INTO clients(ext_id,name,phone,region,address,search) VALUES(?,?,?,?,?,?)",
        (f"manual:{name}", name, phone, region, addr, norm(f"{name} {phone} {region} {addr}")),
    )
    db.commit()
    return web.json_response({"ok": True})


async def h_orders(request):
    scope = request.query.get("scope", "all")
    sql, args = "SELECT * FROM orders", []
    if scope == "mine":
        sql += " WHERE tg_id=?"
        args.append(request["uid"])
    sql += " ORDER BY id DESC LIMIT 200"
    return web.json_response({"items": [row_order(r) for r in db.execute(sql, args).fetchall()]})


async def h_order_create(request):
    b = await request.json()
    client = db.execute("SELECT * FROM clients WHERE id=?", (b.get("client_id"),)).fetchone()
    if not client:
        return web.json_response({"error": "Mijoz tanlanmagan"}, status=400)
    catalog = {p["id"]: p for p in annotate(await get_products())}
    items, total = [], 0.0
    for it in b.get("items", []):
        p = catalog.get(str(it.get("id")))
        qty = _num(it.get("qty"))
        if not p or qty <= 0:
            continue
        stk = p["stock"]
        items.append({"id": p["id"], "name": p["name"], "price": p["price"], "qty": qty, "unit": p["unit"],
                      "stock": stk, "stock_unit": p["stock_unit"],
                      "short": round(max(0.0, qty - stk), 3) if stk is not None else 0,
                      "note": str(it.get("note", ""))[:200]})  # narx va qoldiq serverdan — doim yangi
        total += p["price"] * qty
    if not items:
        return web.json_response({"error": "Savat bo'sh"}, status=400)
    comment = str(b.get("comment", ""))[:300]
    cur = db.execute(
        "INSERT INTO orders(tg_id,user_name,client_id,client_name,region,items,total,comment,created,updated) "
        "VALUES(?,?,?,?,?,?,?,?,?,?)",
        (request["uid"], request["uname"], client["id"], client["name"], client["region"],
         json.dumps(items, ensure_ascii=False), total, comment, now(), now()),
    )
    db.commit()
    o = row_order(db.execute("SELECT * FROM orders WHERE id=?", (cur.lastrowid,)).fetchone())
    asyncio.create_task(notify_order(o))
    return web.json_response({"ok": True, "order": o})


async def h_order_status(request):
    need_admin(request)
    oid = int(request.match_info["id"])
    st = (await request.json()).get("status")
    if st not in STATUSES:
        return web.json_response({"error": "status"}, status=400)
    db.execute("UPDATE orders SET status=?, updated=? WHERE id=?", (st, now(), oid))
    db.commit()
    o = db.execute("SELECT * FROM orders WHERE id=?", (oid,)).fetchone()
    if o and CHAT_ID:
        asyncio.create_task(tg("sendMessage", text=f"Zakas #{oid} ({o['client_name']}): {STATUS_TEXT[st]}", **topic_params()))
    return web.json_response({"ok": True})


async def h_order_delete(request):
    need_admin(request)
    db.execute("DELETE FROM orders WHERE id=?", (int(request.match_info["id"]),))
    db.commit()
    return web.json_response({"ok": True})


BOOT_V = str(int(time.time()))


async def h_index(request):
    # style/app manzillariga versiya qo'shamiz: har deploy'da Telegram yangi faylni oladi (kesh muammosi yo'q)
    html = (BASE / "webapp" / "index.html").read_text("utf-8")
    html = re.sub(r'(/static/[\w.]+\.(?:js|css))', rf'\1?v={BOOT_V}', html)
    return web.Response(text=html, content_type="text/html", headers={"Cache-Control": "no-store"})


@web.middleware
async def nocache_mw(request: web.Request, handler):
    resp = await handler(request)
    if request.path.startswith("/static/") or request.path == "/":
        resp.headers["Cache-Control"] = "no-store"
    return resp


async def on_start(app):
    reindex_clients()
    app["tasks"] = [asyncio.create_task(poll_bot()), asyncio.create_task(keepalive()), asyncio.create_task(stock_loop())]
    r = db.execute("SELECT COUNT(*) c, MAX(updated) t FROM stock").fetchone()
    if r["c"]:
        _stock.update(rows=r["c"], t=r["t"] or 0, src="saqlangan")


def make_app():
    app = web.Application(middlewares=[nocache_mw, auth_mw], client_max_size=20 * 1024 * 1024)
    app.add_routes([
        web.get("/", h_index),
        web.get("/health", h_health),
        web.get("/api/me", h_me),
        web.put("/api/me", h_me_put),
        web.get("/api/products", h_products),
        web.put("/api/products/{id}/unit", h_unit),
        web.get("/api/stock/status", h_stock_status),
        web.post("/api/stock/sync", h_stock_sync),
        web.post("/api/stock/import", h_stock_import),
        web.get("/api/regions", h_regions),
        web.get("/api/clients", h_clients),
        web.post("/api/clients/import", h_clients_import),
        web.post("/api/clients", h_client_add),
        web.get("/api/orders", h_orders),
        web.post("/api/orders", h_order_create),
        web.post("/api/orders/{id}/status", h_order_status),
        web.delete("/api/orders/{id}", h_order_delete),
        web.static("/static", BASE / "webapp"),
    ])
    app.on_startup.append(on_start)
    return app


if __name__ == "__main__":
    web.run_app(make_app(), host="0.0.0.0", port=int(os.getenv("PORT", "8080")))
