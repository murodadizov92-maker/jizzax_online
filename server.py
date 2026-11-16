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
from datetime import datetime, timedelta
from difflib import SequenceMatcher
from pathlib import Path
from urllib.parse import parse_qsl, urljoin

import aiohttp
from aiohttp import web

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("online")

BASE = Path(__file__).parent
BOT_TOKEN = os.getenv("BOT_TOKEN", "")
PUSH_PRIVATE = os.getenv("PUSH_PRIVATE", "1") != "0"   # bildirishnomani botdan shaxsiy xabar qilib ham yuborish
JARVIS_KEY = os.getenv("JARVIS_KEY", "").strip()   # Jarvis (kompyuter) ilovasi uchun maxfiy kalit
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
SD_AGENTS = [x.strip() for x in os.getenv("SD_AGENTS", "Хусанов Самандар,Жабборов Самариддин,Усмонов Ғолибжон").split(",") if x.strip()]  # mijozlari olinadigan agentlar
SD_INTERVAL = int(os.getenv("SD_INTERVAL", "600"))          # soniya
ADMIN_ROLE = "@admin"                                       # access.agent: Jarvis'dan berilgan admin roli
SKLAD = "@sklad"                                            # access.agent qiymati: skladchi roli (vozvrat kiritadi)
EKSP = "@eksp"                                              # access.agent qiymati: ekspeditor (otkaz + qarzdorlar)
STATUSES = ["new", "collecting", "on_way", "delivered"]
STATUS_TEXT = {
    "new": "🆕 Qabul qilindi",
    "collecting": "📦 Yig'ilmoqda",
    "on_way": "🚚 Yo'lda",
    "delivered": "✅ Yetkazildi",
}

# ---------------------------------------------------------------- DB
Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
import persist
PERSIST = persist.restore(DATABASE_URL, DB_PATH)   # deploydan keyin baza bo'sh bo'lsa — Postgres nusxasidan tiklanadi
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
CREATE TABLE IF NOT EXISTS app_tokens(th TEXT PRIMARY KEY, tg_id INTEGER, created INTEGER, last_used INTEGER, device TEXT);
CREATE TABLE IF NOT EXISTS app_logins(login TEXT PRIMARY KEY, pw TEXT, tg_id INTEGER UNIQUE, created INTEGER);
CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY AUTOINCREMENT, tg_id INTEGER, kind TEXT, title TEXT, body TEXT, order_id INTEGER, created INTEGER, read INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(tg_id, id);
CREATE TABLE IF NOT EXISTS access(tg_id INTEGER PRIMARY KEY, agent TEXT NOT NULL, added INTEGER);
CREATE TABLE IF NOT EXISTS mc_sections(login TEXT PRIMARY KEY, secs TEXT);
CREATE TABLE IF NOT EXISTS returns(
  id INTEGER PRIMARY KEY AUTOINCREMENT, tg_id INTEGER, user_name TEXT, agent TEXT, ptype TEXT DEFAULT '',
  client_id INTEGER DEFAULT 0, client_name TEXT, client_typed TEXT, items TEXT, total REAL, photos TEXT DEFAULT '[]',
  comment TEXT DEFAULT '', status TEXT DEFAULT 'pending', reason TEXT DEFAULT '', approved_by TEXT DEFAULT '',
  created INTEGER, updated INTEGER, approved_at INTEGER DEFAULT 0, printed_at INTEGER DEFAULT 0, req_id TEXT DEFAULT '');
CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(status, id);
CREATE TABLE IF NOT EXISTS otkaz(
  id INTEGER PRIMARY KEY AUTOINCREMENT, tg_id INTEGER, user_name TEXT, client_name TEXT, order_no TEXT,
  photos TEXT DEFAULT '[]', comment TEXT DEFAULT '', created INTEGER, seen_at INTEGER DEFAULT 0, sent INTEGER DEFAULT 0, req_id TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS agent_prices(agent TEXT PRIMARY KEY, ptype TEXT, prices TEXT, updated INTEGER);
"""
)
for _sql in ("ALTER TABLE orders ADD COLUMN ddate TEXT DEFAULT ''",
             "ALTER TABLE clients ADD COLUMN added_by INTEGER DEFAULT 0",   # ilovada qo'lda qo'shilgan mijoz (kim qo'shgan)
             "ALTER TABLE clients ADD COLUMN added_at INTEGER DEFAULT 0",
             "ALTER TABLE orders ADD COLUMN printed_at INTEGER DEFAULT 0",
             "ALTER TABLE returns ADD COLUMN paid_at INTEGER DEFAULT 0",        # SD'da balansdan ayirildi (Возврат с полки)
             "ALTER TABLE orders ADD COLUMN req_id TEXT DEFAULT ''",
             "ALTER TABLE clients ADD COLUMN balance REAL",                   # Jarvis'dan: mijoz balansi (manfiy = qarz)
             "ALTER TABLE clients ADD COLUMN bal_t INTEGER DEFAULT 0"):        # takroriy yuborishdan himoya   # Jarvis'da chop etilgan vaqt
    try:
        db.execute(_sql)
    except sqlite3.OperationalError:
        pass
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


async def sd_get_all(method: str, params=None, parser=None):
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
        part = (parser or parse_stock)((data or {}).get("result"))
        rows += part
        pg = data.get("pagination") or {}
        total_pages = pg.get("pages") or pg.get("pageCount") or pg.get("totalPages")
        if total_pages is not None:
            if page >= int(total_pages):
                break
        elif len(part) < 1000:
            break
    return rows, last


# ---------------------------------------------------------------- MIJOZLAR (Sales Doctor)
def _first(d, keys):
    for k in keys:
        v = d.get(k)
        if v not in (None, "", [], {}):
            return v
    return ""


def _agent_name(v):
    if isinstance(v, dict):
        v = _first(v, ("name", "fio", "NAME", "agentName", "title"))
    elif isinstance(v, list):
        v = _agent_name(v[0]) if v else ""
    return str(v or "").split("(")[0].strip()


def _scan_agent(d: dict) -> str:
    """Kalit nomida 'agent' bor har qanday maydondan ism qidiradi (matnli, nomsiz ID emas)."""
    for k, v in d.items():
        if "agent" in str(k).lower() and "id" not in str(k).lower().replace("agent", ""):
            n = _agent_name(v)
            if n and not re.fullmatch(r"[\w-]{1,12}", n) or (n and " " in n):
                return n
    return ""


def _agent_id(d: dict) -> str:
    for k, v in d.items():
        kl = str(k).lower()
        if "agent" in kl and isinstance(v, (str, int)) and str(v):
            return str(v)
        if "agent" in kl and isinstance(v, dict):
            x = _first(v, ("SD_id", "id", "ID", "agent_id"))
            if x:
                return str(x)
    return ""


def parse_named(node, out=None):
    """getAgent kabi javoblardan {id: ism}."""
    out = {} if out is None else out
    if isinstance(node, list):
        for v in node:
            if isinstance(v, dict) and (v.get("name") or v.get("fio") or v.get("NAME")):
                for k in ("SD_id", "id", "ID", "agent_id", "CS_id", "code"):
                    if v.get(k) not in (None, ""):
                        out[str(v[k])] = _agent_name(_first(v, ("name", "fio", "NAME")))
            else:
                parse_named(v, out)
    elif isinstance(node, dict):
        for v in node.values():
            parse_named(v, out)
    return out


def client_fields(d: dict) -> dict:
    name = _first(d, ("name", "CS_name", "clientName", "client_name", "title", "NAME"))
    return {
        "ext": str(_first(d, ("CS_id", "client_id", "clientId", "SD_id", "id", "code", "ID")) or ""),
        "name": str(name or "").strip(),
        "agent": _agent_name(_first(d, ("agent", "agents", "agentName", "agent_name", "AGENT", "agent_id_name"))) or _scan_agent(d),
        "agent_id": _agent_id(d),
        "region": str(_agent_name(_first(d, ("territory", "region", "city", "TERRITORY"))) or ""),
        "phone": str(_first(d, ("phone", "tel", "phoneNumber", "mobile", "PHONE")) or ""),
        "address": str(_first(d, ("address", "ADDRESS", "adress")) or ""),
    }


def parse_clients(node, out=None):
    out = [] if out is None else out
    if isinstance(node, list):
        for v in node:
            if isinstance(v, dict) and client_fields(v)["name"] and ("agent" in v or "CS_id" in v or "id" in v or "client_id" in v or "clientId" in v):
                out.append(v)
            else:
                parse_clients(v, out)
    elif isinstance(node, dict):
        for v in node.values():
            parse_clients(v, out)
    return out


async def sync_clients():
    """Sales Doctor'dan mijozlarni oladi (SD_AGENTS ro'yxatidagi agentlarniki): yangilaydi yoki qo'shadi. Excel shart emas."""
    if not (SD_LOGIN and SD_PASSWORD):
        return {"ok": False, "error": "SD_LOGIN / SD_PASSWORD kiritilmagan"}
    if now() < _sd["block"]:
        return {"ok": False, "error": f"Sales Doctor limiti: {max(1, (_sd['block'] - now()) // 60)} daqiqadan keyin urinib ko'ring"}
    try:
        raw, last = await sd_get_all("getClient", parser=parse_clients)
    except Exception as e:
        _sd["auth"] = None
        return {"ok": False, "error": str(e)[:300]}
    if not raw:
        return {"ok": False, "error": "getClient javobida mijoz topilmadi", "sample": (last[1] or "")[:600] if last else ""}
    amap = {}
    if any(not client_fields(d)["agent"] and client_fields(d)["agent_id"] for d in raw):
        for m in ("getAgent", "getAgents"):                      # agent faqat ID bilan kelsa — nomini alohida olamiz
            try:
                rows_a, _ = await sd_get_all(m, parser=lambda n: [parse_named(n)])
                for dct in rows_a:
                    amap.update(dct)
                if amap:
                    break
            except Exception as e:
                log.info("%s: %s", m, e)
    known = {r["agent"] for r in db.execute("SELECT DISTINCT agent FROM clients WHERE agent!=''").fetchall()}
    want = [norm(a) for a in SD_AGENTS]
    if want:
        known = None          # SD_AGENTS berilgan — shu agentlar bo'yicha filtr (kirill/lotin, Ғ/Г farqsiz)
    added = upd = skipped = noagent = 0
    for d in raw:
        f = client_fields(d)
        if not f["name"]:
            continue
        if not f["agent"] and f["agent_id"]:
            f["agent"] = amap.get(f["agent_id"], "")
        if not f["agent"]:
            noagent += 1
        if want and not any(w in norm(f["agent"]) or (norm(f["agent"]) and norm(f["agent"]) in w) for w in want):
            skipped += 1
            continue
        if known and f["agent"] not in known:
            skipped += 1
            continue
        row = None
        if f["ext"]:
            row = db.execute("SELECT id FROM clients WHERE ext_id=?", (f["ext"],)).fetchone()
        if not row:
            row = db.execute("SELECT id FROM clients WHERE name=? AND agent=?", (f["name"], f["agent"])).fetchone()
        search = norm(f"{f['name']} {f['phone']} {f['region']} {f['address']} {f['agent']}")
        if row:
            db.execute("UPDATE clients SET ext_id=?,name=?,phone=?,region=?,address=?,agent=?,search=? WHERE id=?",
                       (f["ext"] or f["name"], f["name"], f["phone"], f["region"], f["address"], f["agent"], search, row["id"]))
            upd += 1
        else:
            db.execute("INSERT INTO clients(ext_id,name,phone,region,address,agent,search) VALUES(?,?,?,?,?,?,?)",
                       (f["ext"] or f["name"], f["name"], f["phone"], f["region"], f["address"], f["agent"], search))
            added += 1
    purged = 0
    if want and (added + upd) > 0:        # eski versiyada agentsiz/begona kirib qolgan mijozlarni tozalaymiz
        purged = db.execute("DELETE FROM clients WHERE agent=''").rowcount
    db.commit()
    kv_set("cl_sync", str(now()))
    res = {"ok": True, "total": len(raw), "added": added, "updated": upd, "skipped_other_agents": skipped, "no_agent": noagent, "purged": purged}
    if noagent or (skipped == len(raw)):        # agent aniqlanmadi — javob shaklini ko'rsatamiz (sozlash uchun)
        res["sample"] = json.dumps(raw[0], ensure_ascii=False)[:700]
    return res


async def client_loop():
    """Qo'lda bir marta muvaffaqiyatli olingandan keyin har 6 soatda o'zi yangilaydi."""
    if not (SD_LOGIN and SD_PASSWORD):
        return
    await asyncio.sleep(90)
    while True:
        wait = 6 * 3600
        try:
            r = await sync_clients()
            log.info("client sync: %s", {k: v for k, v in r.items() if k != "sample"})
            if not r.get("ok"):
                wait = 1800
        except Exception as e:
            log.warning("client sync failed: %s", e)
            wait = 1800
        await asyncio.sleep(wait)


async def h_clients_sync(request):
    need_admin(request)
    return web.json_response(await sync_clients())


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
        if not user and request.headers.get("X-App-Token"):          # telefon ilovasi (APK) — bot kodi bilan olingan token
            th = hashlib.sha256(request.headers["X-App-Token"].encode()).hexdigest()
            row = db.execute("SELECT t.tg_id, u.name, u.username FROM app_tokens t LEFT JOIN users u ON u.tg_id=t.tg_id WHERE t.th=?", (th,)).fetchone()
            if row:
                db.execute("UPDATE app_tokens SET last_used=? WHERE th=?", (now(), th))
                parts = (row["name"] or "Foydalanuvchi").split(" ", 1)
                user = {"id": row["tg_id"], "first_name": parts[0], "last_name": parts[1] if len(parts) > 1 else "", "username": row["username"]}
                request["app_th"] = th
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
        acc = db.execute("SELECT agent FROM access WHERE tg_id=?", (user["id"],)).fetchone()
        request["admin"] = user["id"] in ADMIN_IDS or bool(acc and acc["agent"] == ADMIN_ROLE)   # Jarvis'da "admin" roli berilgan xodim ham
        request["agent"] = acc["agent"] if acc and acc["agent"] != ADMIN_ROLE else ""
        request["allowed"] = request["admin"] or bool(acc)
        request["role"] = "admin" if request["admin"] else ("sklad" if request["agent"] == SKLAD else ("eksp" if request["agent"] == EKSP else ("agent" if acc else "")))
        if request["agent"] in (SKLAD, EKSP):              # skladchi: agent emas — mijoz bazasi va zakaslar unga yopiq
            request["agent"] = ""
        # zakas guruhida va ilovada ko'rinadigan ism: agent bo'lsa — Sales Doctor'dagi agent nomi
        request["uname"] = request["agent"] or name
        if not request["allowed"] and request.path != "/api/me":
            return web.json_response({"error": "Sizga ruxsat berilmagan", "code": "noaccess"}, status=403)
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


NOTE_ICON = {"order": "🆕", "status": "📦", "printed": "🖨", "delivered": "✅", "client": "👤", "info": "🔔"}


def add_note(uids, kind, title, body="", order_id=None, push=True):
    """Ilova ichidagi bildirishnoma + (mumkin bo'lsa) bot orqali shaxsiy Telegram xabar."""
    uids = sorted({int(u) for u in uids if u})
    for u in uids:
        db.execute("INSERT INTO notes(tg_id,kind,title,body,order_id,created) VALUES(?,?,?,?,?,?)", (u, kind, title, body, order_id, now()))
    db.execute("DELETE FROM notes WHERE created<?", (now() - 60 * 86400,))
    db.commit()
    if push and PUSH_PRIVATE:
        for u in uids:          # foydalanuvchi botga /start bosmagan bo'lsa Telegram rad etadi — e'tiborsiz qoldiramiz
            asyncio.create_task(tg("sendMessage", chat_id=u, text=f"{NOTE_ICON.get(kind, '🔔')} {title}" + (f"\n{body}" if body else ""), disable_notification=False))


def topic_params():
    p = {"chat_id": CHAT_ID}
    if TOPIC_ID:
        p["message_thread_id"] = int(TOPIC_ID)
    return p


def fmt_ddate(d) -> str:
    try:
        dt = datetime.strptime(d, "%Y-%m-%d")
    except (TypeError, ValueError):
        return "—"
    today = (datetime.utcnow() + timedelta(hours=5)).date()
    diff = (dt.date() - today).days
    tag = {0: "bugun", 1: "ertaga", 2: "indinga"}.get(diff, "")
    return dt.strftime("%d.%m.%Y") + (f" ({tag})" if tag else "")


def money(v) -> str:
    return f"{int(round(v)):,}".replace(",", " ")


async def notify_order(o: dict):
    if not CHAT_ID:
        return
    lines = [f"🆕 <b>Zakas #{o['id']}</b>", f"👤 {o['client_name']}" + (f" ({o['region']})" if o["region"] else ""),
             f"🧑‍💼 {o['user_name']}", f"🚚 <b>Yetkazish: {fmt_ddate(o.get('ddate'))}</b>", ""]
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
    sent = False                                   # guruhga faqat накладная rasmi; rasm chiqmasa — zaxira sifatida matn
    try:                                           # накладная (JPG) — xuddi chop etiladigan ko'rinishda
        from invoice import make_invoice
        cl = db.execute("SELECT agent, phone, address, ext_id FROM clients WHERE id=?", (o.get("client_id"),)).fetchone()
        o = {**o, "agent": (cl["agent"] if cl else "") or "", "phone": (cl["phone"] if cl else "") or "", "address": (cl["address"] if cl else "") or "", "ext_id": (cl["ext_id"] if cl else "") or ""}
        jpg = await asyncio.get_running_loop().run_in_executor(None, make_invoice, o)
        form = aiohttp.FormData()
        for k, v in topic_params().items():
            form.add_field(k, str(v))
        form.add_field("caption", f"📄 Накладная — Zakas #{o['id']}")
        form.add_field("photo", jpg, filename=f"nakladnoy_{o['id']}.jpg", content_type="image/jpeg")
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=60)) as s:
            async with s.post(f"https://api.telegram.org/bot{BOT_TOKEN}/sendPhoto", data=form) as r:
                res = await r.json()
                if not res.get("ok"):
                    log.warning("sendPhoto: %s", res)
                else:
                    sent = True
    except Exception as e:
        log.warning("nakladnoy failed: %s", e)
    if not sent:
        await tg("sendMessage", text="\n".join(lines), parse_mode="HTML", **topic_params())


_login_fail = {}


def pw_hash(pw: str, salt: bytes = None) -> str:
    salt = salt or os.urandom(16)
    return salt.hex() + "$" + hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 200_000).hex()


def pw_check(pw: str, stored: str) -> bool:
    try:
        salt, _ = stored.split("$", 1)
        return hmac.compare_digest(pw_hash(pw, bytes.fromhex(salt)), stored)
    except Exception:
        return False


async def h_app_login(request):
    """Telefon ilovasi: admin bergan login + parol -> token."""
    import secrets
    ip = request.headers.get("X-Forwarded-For", request.remote or "").split(",")[0].strip()
    f = [t for t in _login_fail.get(ip, []) if t > now() - 600]
    if len(f) >= 8:
        return web.json_response({"error": "Ko'p noto'g'ri urinish. 10 daqiqadan keyin qayta urining"}, status=429)
    b = await request.json()
    login = str(b.get("login", "")).strip().lower()
    row = db.execute("SELECT pw, tg_id FROM app_logins WHERE login=?", (login,)).fetchone()
    if not row or not pw_check(str(b.get("password", "")), row["pw"]):
        _login_fail[ip] = f + [now()]
        return web.json_response({"error": "Login yoki parol noto'g'ri"}, status=400)
    uid = row["tg_id"]
    if not (uid in ADMIN_IDS or db.execute("SELECT 1 FROM access WHERE tg_id=?", (uid,)).fetchone()):
        return web.json_response({"error": "Sizga ruxsat berilmagan"}, status=403)
    token = secrets.token_urlsafe(32)
    db.execute("INSERT INTO app_tokens(th,tg_id,created,last_used,device) VALUES(?,?,?,?,?)",
               (hashlib.sha256(token.encode()).hexdigest(), uid, now(), now(), str(b.get("device", ""))[:80]))
    db.commit()
    return web.json_response({"ok": True, "token": token})


async def h_user_login(request):
    """Admin: foydalanuvchiga ilova uchun login/parol berish (bo'sh login — o'chirish)."""
    need_admin(request)
    tid = int(request.match_info["id"])
    b = await request.json()
    login = str(b.get("login", "")).strip().lower()
    pw = str(b.get("password", ""))
    if not login:
        db.execute("DELETE FROM app_logins WHERE tg_id=?", (tid,))
        db.execute("DELETE FROM app_tokens WHERE tg_id=?", (tid,))
        db.commit()
        return web.json_response({"ok": True})
    if not re.fullmatch(r"[a-z0-9_.-]{3,32}", login):
        return web.json_response({"error": "Login: 3-32 ta lotin harf yoki raqam"}, status=400)
    if len(pw) < 6:
        return web.json_response({"error": "Parol kamida 6 ta belgi"}, status=400)
    other = db.execute("SELECT tg_id FROM app_logins WHERE login=?", (login,)).fetchone()
    if other and other["tg_id"] != tid:
        return web.json_response({"error": "Bu login band"}, status=400)
    db.execute("DELETE FROM app_logins WHERE tg_id=?", (tid,))
    db.execute("INSERT INTO app_logins(login,pw,tg_id,created) VALUES(?,?,?,?)", (login, pw_hash(pw), tid, now()))
    db.execute("DELETE FROM app_tokens WHERE tg_id=?", (tid,))      # parol almashsa — eski kirishlar bekor
    db.commit()
    return web.json_response({"ok": True})


async def h_app_logout(request):
    if request.get("app_th"):
        db.execute("DELETE FROM app_tokens WHERE th=?", (request["app_th"],))
        db.commit()
    return web.json_response({"ok": True})


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
            if text in ("/vozvrat", "/otkaz") and chat.get("type") != "private" and (m.get("from") or {}).get("id") in ADMIN_IDS:
                pre = "ret" if text == "/vozvrat" else "otk"               # vozvrat / otkaz shu topikka tushadi
                kv_set(pre + "_chat", str(chat["id"]))
                kv_set(pre + "_topic", str(m.get("message_thread_id") or ""))
                p = {"chat_id": chat["id"], "text": "✅ " + ("Vozvrat nakladnoylari" if pre == "ret" else "Otkaz zakaslar") + " endi shu topikka tushadi"}
                if m.get("message_thread_id"):
                    p["message_thread_id"] = m["message_thread_id"]
                await tg("sendMessage", **p)
                await tg("deleteMessage", chat_id=chat["id"], message_id=m["message_id"])
                continue
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
    try:
        db.execute("SELECT 1").fetchone()
        return web.json_response({"ok": True, "t": now(), "db": True})
    except Exception as e:
        return web.json_response({"ok": False, "db": False, "error": str(e)[:100]}, status=503)


def _sections_of(uid):
    r = db.execute("SELECT m.secs FROM mc_sections m JOIN app_logins l ON l.login=m.login WHERE l.tg_id=?", (uid,)).fetchone()
    try:
        return json.loads(r["secs"]) if r else []
    except Exception:
        return []


async def h_me(request):
    u = db.execute("SELECT * FROM users WHERE tg_id=?", (request["uid"],)).fetchone()
    return web.json_response({
        "sections": _sections_of(request["uid"]),
        "id": u["tg_id"], "name": request["uname"], "tg_name": u["name"], "region": u["region"] or "", "admin": request["admin"],
        "allowed": request["allowed"], "agent": request["agent"], "role": request["role"],
        "clients": db.execute("SELECT COUNT(*) c FROM clients").fetchone()["c"],
    })


async def h_me_put(request):
    body = await request.json()
    db.execute("UPDATE users SET region=? WHERE tg_id=?", (str(body.get("region", ""))[:80], request["uid"]))
    db.commit()
    return web.json_response({"ok": True})


async def h_products(request):
    items = await get_products(force=request.query.get("force") == "1" and request["admin"])
    ag = request.query.get("agent", "").strip()
    if request["role"] == "agent":                           # agent: doim o'z narx turi (Jarvis'da biriktirilgan)
        ag = request["agent"]
    if ag and request["role"] in ("admin", "sklad", "agent"):   # agent narx turi bo'yicha narxlar (zakas va vozvrat)
        ptype, prices = agent_price_map(ag)
        items = [{**p, "price": prices.get(p["id"], p["price"])} for p in items]
        return web.json_response({"items": annotate(items), "ptype": ptype, "t": _cache["t"]})
    return web.json_response({"items": annotate(items), "t": _cache["t"], "stock_t": _stock["t"]})


async def h_backup(request):
    need_admin(request)
    return web.json_response({"enabled": bool(DATABASE_URL), "boot": PERSIST, **persist.status()})


# ---------------------------------------------------------------- JARVIS (kompyuterdagi ilova: zakaslarni chop etish)
def _jarvis_ok(request):
    import hmac
    k = request.headers.get("X-Jarvis-Key") or request.query.get("key", "")
    if not JARVIS_KEY or not hmac.compare_digest(k, JARVIS_KEY):
        raise web.HTTPUnauthorized(text="JARVIS_KEY noto'g'ri yoki serverda o'rnatilmagan")


def _order_full(row):
    o = dict(row)
    o["items"] = json.loads(o["items"] or "[]")
    cl = db.execute("SELECT agent, phone, address, ext_id FROM clients WHERE id=?", (o.get("client_id"),)).fetchone()
    o.update(agent=(cl["agent"] if cl else "") or "", phone=(cl["phone"] if cl else "") or "", address=(cl["address"] if cl else "") or "", ext_id=(cl["ext_id"] if cl else "") or "")
    return o


async def h_jarvis_orders(request):
    _jarvis_ok(request)
    days = max(1, min(60, int(request.query.get("days", "7") or 7)))
    rows = db.execute("SELECT * FROM orders WHERE created>? ORDER BY id DESC LIMIT 300", (now() - days * 86400,)).fetchall()
    out = []
    for r in rows:
        o = _order_full(r)
        out.append({k: o.get(k) for k in ("id", "client_name", "region", "agent", "user_name", "total", "ddate", "created", "printed_at", "comment")} | {"n": len(o["items"])})
    return web.json_response({"items": out})


async def h_jarvis_invoice(request):
    _jarvis_ok(request)
    row = db.execute("SELECT * FROM orders WHERE id=?", (int(request.match_info["id"]),)).fetchone()
    if not row:
        raise web.HTTPNotFound()
    from invoice import make_invoice
    jpg = await asyncio.get_running_loop().run_in_executor(None, make_invoice, _order_full(row))
    return web.Response(body=jpg, content_type="image/jpeg")


async def h_jarvis_printed(request):
    _jarvis_ok(request)
    b = await request.json()
    ids = [int(x) for x in b.get("ids", [])][:300]
    val = 0 if b.get("undo") else now()
    db.executemany("UPDATE orders SET printed_at=? WHERE id=?", [(val, i) for i in ids])
    if not b.get("undo"):
        db.executemany("UPDATE orders SET status='collecting', updated=? WHERE id=? AND status='new'", [(now(), i) for i in ids])
        for i in ids:
            o = db.execute("SELECT tg_id, client_name FROM orders WHERE id=?", (i,)).fetchone()
            if o:
                add_note([o["tg_id"]], "printed", f"Zakas #{i} chop etildi · {o['client_name']}", "Skladda yig'ilmoqda")
    db.commit()
    return web.json_response({"ok": True, "n": len(ids)})


async def h_notes(request):
    rows = db.execute("SELECT id,kind,title,body,order_id,created,read FROM notes WHERE tg_id=? ORDER BY id DESC LIMIT 60", (request["uid"],)).fetchall()
    unread = db.execute("SELECT COUNT(*) c FROM notes WHERE tg_id=? AND read=0", (request["uid"],)).fetchone()["c"]
    return web.json_response({"items": [dict(r) for r in rows], "unread": unread})


async def h_notes_read(request):
    db.execute("UPDATE notes SET read=1 WHERE tg_id=? AND read=0", (request["uid"],))
    db.commit()
    return web.json_response({"ok": True})


async def h_users(request):
    need_admin(request)
    rows = db.execute("SELECT a.tg_id AS tg_id, COALESCE(u.name,'(hali kirmagan)') AS name, u.username AS username, u.last_seen AS last_seen, a.agent AS agent FROM access a LEFT JOIN users u ON u.tg_id=a.tg_id "
                      "UNION ALL SELECT u.tg_id,u.name,u.username,u.last_seen,NULL FROM users u WHERE u.tg_id NOT IN (SELECT tg_id FROM access)").fetchall()
    rows = sorted(rows, key=lambda r: (r["agent"] is None, -(r["last_seen"] or 0)))[:300]
    agents = [r["agent"] for r in db.execute("SELECT agent FROM clients WHERE agent!='' GROUP BY agent ORDER BY COUNT(*) DESC").fetchall()]
    logins = {r["tg_id"]: r["login"] for r in db.execute("SELECT tg_id, login FROM app_logins").fetchall()}
    return web.json_response({"items": [{**dict(r), "admin": r["tg_id"] in ADMIN_IDS, "login": logins.get(r["tg_id"], "")} for r in rows], "agents": agents, "sklad": SKLAD})


async def h_user_access(request):
    need_admin(request)
    tid = int(request.match_info["id"])
    agent = str((await request.json()).get("agent", "")).strip()
    if agent:
        db.execute("INSERT OR REPLACE INTO access(tg_id,agent,added) VALUES(?,?,?)", (tid, agent, now()))
    else:
        db.execute("DELETE FROM access WHERE tg_id=?", (tid,))
    db.commit()
    return web.json_response({"ok": True})


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
    sql, args = "SELECT agent, COUNT(*) c FROM clients WHERE agent!=''", []
    if not request["admin"]:                      # agent faqat o'zini ko'radi
        sql += " AND agent=?"
        args.append(request["agent"])
    rows = db.execute(sql + " GROUP BY agent ORDER BY c DESC", args).fetchall()
    return web.json_response({"items": [{"region": r["agent"], "count": r["c"]} for r in rows]})


async def h_clients(request):
    if request["role"] in ("sklad", "eksp"):
        return web.json_response({"items": []})
    region = request.query.get("region", "").strip()
    if not request["admin"]:                      # agentga faqat o'z mijozlari (so'rovdagi filtr e'tiborga olinmaydi)
        region = request["agent"]
    sql, args = "SELECT id,name,phone,region,address,agent,balance FROM clients WHERE 1=1", []
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
    """Agent ham, admin ham yangi mijoz qo'sha oladi. Agent qo'shgan mijoz avtomatik o'sha agentga biriktiriladi."""
    b = await request.json()
    name = str(b.get("name", "")).strip()[:120]
    if len(name) < 2:
        return web.json_response({"error": "Mijoz nomini yozing"}, status=400)
    phone, region, addr = (str(b.get(k, "")).strip()[:120] for k in ("phone", "region", "address"))
    agent = request["agent"] if not request["admin"] else (str(b.get("agent", "")).strip() or request["agent"])
    if not agent:
        return web.json_response({"error": "Agentni tanlang"}, status=400)
    if db.execute("SELECT 1 FROM clients WHERE lower(name)=lower(?) AND agent=?", (name, agent)).fetchone():
        return web.json_response({"error": "Bu mijoz bazada bor"}, status=400)
    cur = db.execute(
        "INSERT INTO clients(ext_id,name,phone,region,address,agent,search,added_by,added_at) VALUES(?,?,?,?,?,?,?,?,?)",
        (f"manual:{agent}:{name}", name, phone, region, addr, agent, norm(f"{name} {phone} {region} {addr} {agent}"), request["uid"], now()),
    )
    db.commit()
    row = db.execute("SELECT id,name,phone,region,address,agent,added_at FROM clients WHERE id=?", (cur.lastrowid,)).fetchone()
    if not request["admin"]:
        add_note(ADMIN_IDS, "client", f"Yangi mijoz: {name}", f"{agent} qo'shdi · {region or ''} {phone or ''}".strip(), push=False)
    return web.json_response({"ok": True, "client": dict(row)})


async def h_clients_new(request):
    """Ilovada qo'shilgan yangi mijozlar (oxirgi 30 kun). Agent faqat o'zinikini ko'radi."""
    sql, args = "SELECT id,name,phone,region,address,agent,added_at FROM clients WHERE added_by>0 AND added_at>?", [now() - 30 * 86400]
    if not request["admin"]:
        sql += " AND agent=?"
        args.append(request["agent"])
    rows = db.execute(sql + " ORDER BY added_at DESC LIMIT 50", args).fetchall()
    return web.json_response({"items": [dict(r) for r in rows]})


async def h_orders(request):
    scope = request.query.get("scope", "all")
    if not request["admin"]:
        scope = "mine"
    sql, args = "SELECT * FROM orders", []
    if scope == "mine":
        sql += " WHERE tg_id=?"
        args.append(request["uid"])
    sql += " ORDER BY id DESC LIMIT 200"
    return web.json_response({"items": [row_order(r) for r in db.execute(sql, args).fetchall()]})


MAX_QTY = 100000


async def h_order_create(request):
    if request["role"] in ("sklad", "eksp"):
        return web.json_response({"error": "Bu rol zakas bera olmaydi"}, status=403)
    b = await request.json()
    req_id = re.sub(r"[^\w-]", "", str(b.get("req_id", "")))[:64]
    if req_id:   # internet uzilib qayta yuborilsa yoki ikki marta bosilsa — o'sha zakasni qaytaramiz, yangisini ochmaymiz
        dup = db.execute("SELECT * FROM orders WHERE tg_id=? AND req_id=?", (request["uid"], req_id)).fetchone()
        if dup:
            return web.json_response({"ok": True, "order": row_order(dup), "duplicate": True})
    client = db.execute("SELECT * FROM clients WHERE id=?", (b.get("client_id"),)).fetchone()
    if not client:
        return web.json_response({"error": "Mijoz tanlanmagan"}, status=400)
    if not request["admin"] and client["agent"] != request["agent"]:
        return web.json_response({"error": "Bu mijoz sizning bazangizda emas"}, status=403)
    catalog = {p["id"]: p for p in annotate(await get_products())}
    _, aprices = agent_price_map(client["agent"])               # mijoz agentining narx turi (bo'lmasa asosiy narx)
    items, total = [], 0.0
    for it in b.get("items", []):
        p = catalog.get(str(it.get("id")))
        qty = _num(it.get("qty"))
        if not p or not (0 < qty <= MAX_QTY):
            continue
        p = {**p, "price": aprices.get(p["id"], p["price"])}
        stk = p["stock"]
        items.append({"id": p["id"], "name": p["name"], "price": p["price"], "qty": qty,
                      "unit": it.get("unit") if it.get("unit") in ("kg", "dona") else p["unit"],   # agent tanlagan birlik
                      "stock": stk, "stock_unit": p["stock_unit"],
                      "short": round(max(0.0, qty - stk), 3) if stk is not None else 0,
                      "note": str(it.get("note", ""))[:200]})  # narx va qoldiq serverdan — doim yangi
        total += p["price"] * qty
    if not items:
        return web.json_response({"error": "Savatdagi mahsulotlar topilmadi yoki miqdor noto'g'ri"}, status=400)
    skipped = len(b.get("items", [])) - len(items)
    comment = str(b.get("comment", ""))[:300]
    ddate = str(b.get("ddate", ""))[:10]
    try:
        datetime.strptime(ddate, "%Y-%m-%d")
    except ValueError:
        ddate = (datetime.utcnow() + timedelta(hours=5, days=1)).strftime("%Y-%m-%d")   # ko'rsatilmasa — ertaga
    cur = db.execute(
        "INSERT INTO orders(tg_id,user_name,client_id,client_name,region,items,total,comment,created,updated,ddate,req_id) "
        "VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        (request["uid"], request["uname"], client["id"], client["name"], client["region"],
         json.dumps(items, ensure_ascii=False), total, comment, now(), now(), ddate, req_id),
    )
    db.commit()
    o = row_order(db.execute("SELECT * FROM orders WHERE id=?", (cur.lastrowid,)).fetchone())
    asyncio.create_task(notify_order(o))
    add_note([a for a in ADMIN_IDS if a != request["uid"]], "order", f"Yangi zakas #{o['id']} · {o['client_name']}",
             f"{request['uname']} · {money(o['total'])} so'm", o["id"])
    return web.json_response({"ok": True, "order": o, "skipped": skipped})


async def h_order_status(request):
    need_admin(request)
    oid = int(request.match_info["id"])
    st = (await request.json()).get("status")
    if st not in STATUSES:
        return web.json_response({"error": "status"}, status=400)
    db.execute("UPDATE orders SET status=?, updated=? WHERE id=?", (st, now(), oid))
    db.commit()
    o = db.execute("SELECT * FROM orders WHERE id=?", (oid,)).fetchone()
    if o:                                         # guruhga emas — zakas egasiga shaxsiy bildirishnoma
        add_note([o["tg_id"]], "delivered" if st == "delivered" else "status", f"Zakas #{oid} · {o['client_name']}", STATUS_TEXT[st], oid)
    return web.json_response({"ok": True})


async def h_order_delete(request):
    need_admin(request)
    db.execute("DELETE FROM orders WHERE id=?", (int(request.match_info["id"]),))
    db.commit()
    return web.json_response({"ok": True})


# ---------------------------------------------------------------- VOZVRAT (skladchi kiritadi -> Jarvis'da tasdiq -> guruh topigi)
PHOTO_DIR = Path(DB_PATH).parent / "photos"
PHOTO_DIR.mkdir(parents=True, exist_ok=True)
PHOTO_DDL = "CREATE TABLE IF NOT EXISTS oz_photos(pid TEXT PRIMARY KEY, data BYTEA, created TIMESTAMPTZ DEFAULT now())"
RET_ST = {"pending": "⏳ Tasdiq kutilmoqda", "approved": "✅ Tasdiqlandi", "rejected": "❌ Rad etildi"}


def ret_agents() -> list:
    """Vozvrat uchun agentlar: mijoz bazasidagi agentlar (eng ko'p mijozi borlari birinchi)."""
    rows = [r["agent"] for r in db.execute("SELECT agent FROM clients WHERE agent!='' GROUP BY agent ORDER BY COUNT(*) DESC").fetchall()]
    for a in SD_AGENTS:                     # baza hali bo'sh bo'lsa ham SD_AGENTS dagilar chiqadi
        if not any(norm(a) == norm(x) for x in rows):
            rows.append(a)
    return rows


def agent_price_map(agent: str):
    r = db.execute("SELECT ptype, prices FROM agent_prices WHERE agent=?", (agent,)).fetchone()
    if not r:
        return "", {}
    try:
        return r["ptype"] or "", {str(k): float(v) for k, v in json.loads(r["prices"] or "{}").items()}
    except Exception:
        return r["ptype"] or "", {}


def _photo_norm(raw: bytes) -> bytes:
    """Rasmni tekshiradi va JPEG (eng uzun tomoni 1600px) ga keltiradi — EXIF/ortiqcha ma'lumot olib tashlanadi."""
    from PIL import Image, ImageOps
    im = Image.open(io.BytesIO(raw))
    im = ImageOps.exif_transpose(im).convert("RGB")
    im.thumbnail((1600, 1600))
    out = io.BytesIO()
    im.save(out, "JPEG", quality=80, optimize=True)
    return out.getvalue()


async def photo_put(pid: str, data: bytes):
    (PHOTO_DIR / f"{pid}.jpg").write_bytes(data)
    if DATABASE_URL:                        # Render diski deployda tozalanadi — rasm Postgres'da alohida saqlanadi
        try:
            import asyncpg
            c = await asyncpg.connect(DATABASE_URL, statement_cache_size=0, timeout=20)
            try:
                await c.execute(PHOTO_DDL)
                await c.execute("INSERT INTO oz_photos(pid,data) VALUES($1,$2) ON CONFLICT(pid) DO NOTHING", pid, data)
                await c.execute("DELETE FROM oz_photos WHERE created < now() - interval '120 days'")
            finally:
                await c.close()
        except Exception as e:
            log.warning("photo backup failed: %s", e)


async def photo_get(pid: str):
    if not re.fullmatch(r"[\w-]{6,64}", pid or ""):
        return None
    f = PHOTO_DIR / f"{pid}.jpg"
    if f.exists():
        return f.read_bytes()
    if DATABASE_URL:
        try:
            import asyncpg
            c = await asyncpg.connect(DATABASE_URL, statement_cache_size=0, timeout=20)
            try:
                row = await c.fetchrow("SELECT data FROM oz_photos WHERE pid=$1", pid)
            finally:
                await c.close()
            if row:
                f.write_bytes(bytes(row["data"]))
                return bytes(row["data"])
        except Exception as e:
            log.warning("photo load failed: %s", e)
    return None


async def save_photos(raw_list, limit=6) -> list:
    import base64
    import secrets
    photos = []
    for x in [x for x in (raw_list or []) if isinstance(x, str)][:limit]:
        try:
            raw = base64.b64decode(x.split(",", 1)[-1], validate=False)
            if len(raw) > 6 * 1024 * 1024:
                raise ValueError
            data = await asyncio.get_running_loop().run_in_executor(None, _photo_norm, raw)
        except Exception:
            raise ValueError("Rasm o'qilmadi. Qayta rasmga oling")
        pid = secrets.token_urlsafe(12)
        await photo_put(pid, data)
        photos.append(pid)
    return photos


async def tg_album(chat, topic, files: list, caption: str) -> str:
    """files: [(nom, bytes)] -> 1 ta bo'lsa sendPhoto, ko'p bo'lsa sendMediaGroup. Xato bo'lsa matn qaytaradi."""
    if not BOT_TOKEN:
        return "BOT_TOKEN o'rnatilmagan"
    files = files[:10]
    form = aiohttp.FormData()
    form.add_field("chat_id", str(chat))
    if topic:
        form.add_field("message_thread_id", str(topic))
    if len(files) == 1:
        method = "sendPhoto"
        form.add_field("caption", caption)
        form.add_field("photo", files[0][1], filename=files[0][0], content_type="image/jpeg")
    else:
        method = "sendMediaGroup"
        media = []
        for i, (fn, data) in enumerate(files):
            media.append({"type": "photo", "media": f"attach://f{i}", **({"caption": caption} if i == 0 else {})})
            form.add_field(f"f{i}", data, filename=fn, content_type="image/jpeg")
        form.add_field("media", json.dumps(media, ensure_ascii=False))
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=90)) as s:
            async with s.post(f"https://api.telegram.org/bot{BOT_TOKEN}/{method}", data=form) as resp:
                res = await resp.json()
        if res.get("ok"):
            return ""
        log.warning("%s: %s", method, res)
        return "Telegram: " + str(res.get("description", ""))[:150]
    except Exception as e:
        return f"Telegram: {e}"[:150]


def row_ret(r) -> dict:
    d = dict(r)
    d["items"] = json.loads(d["items"] or "[]")
    d["photos"] = json.loads(d["photos"] or "[]")
    d["status_text"] = RET_ST.get(d["status"], d["status"])
    return d


def ret_items(raw: list, agent: str, catalog: dict, allow_price=False):
    _, prices = agent_price_map(agent)
    items, total = [], 0.0
    for it in raw or []:
        p = catalog.get(str(it.get("id")))
        qty = _num(it.get("qty"))
        if not p or not (0 < qty <= MAX_QTY):
            continue
        price = prices.get(p["id"], p["price"])
        if allow_price and it.get("price") not in (None, ""):
            pr = _num(it.get("price"))
            if 0 <= pr <= 1e9:
                price = pr
        unit = it.get("unit") if it.get("unit") in ("kg", "dona") else p["unit"]     # skladchi tanlagan birlik
        items.append({"id": p["id"], "name": p["name"], "price": price, "qty": qty, "unit": unit})
        total += price * qty
    return items, total


async def h_ret_agents(request):
    if request["role"] not in ("admin", "sklad"):
        return web.json_response({"error": "Faqat skladchi uchun"}, status=403)
    out = []
    for a in ret_agents():
        ptype, prices = agent_price_map(a)
        out.append({"agent": a, "ptype": ptype, "n": len(prices)})
    return web.json_response({"items": out})


async def h_ret_create(request):
    if request["role"] not in ("admin", "sklad"):
        return web.json_response({"error": "Vozvratni faqat skladchi kiritadi"}, status=403)
    b = await request.json()
    req_id = re.sub(r"[^\w-]", "", str(b.get("req_id", "")))[:64]
    if req_id:
        dup = db.execute("SELECT * FROM returns WHERE tg_id=? AND req_id=?", (request["uid"], req_id)).fetchone()
        if dup:
            return web.json_response({"ok": True, "ret": row_ret(dup), "duplicate": True})
    agent = str(b.get("agent", "")).strip()
    if agent not in ret_agents():
        return web.json_response({"error": "Agentni tanlang"}, status=400)
    cname = re.sub(r"\s+", " ", str(b.get("client_name", ""))).strip()[:120]
    if len(cname) < 2:
        return web.json_response({"error": "Mijoz nomini yozing"}, status=400)
    catalog = {p["id"]: p for p in annotate(await get_products())}
    items, total = ret_items(b.get("items"), agent, catalog)
    if not items:
        return web.json_response({"error": "Qaytarilgan mahsulotlar yo'q yoki miqdor noto'g'ri"}, status=400)
    try:
        photos = await save_photos(b.get("photos"))        # vozvratda rasm ixtiyoriy
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    ptype, _ = agent_price_map(agent)
    cur = db.execute(
        "INSERT INTO returns(tg_id,user_name,agent,ptype,client_name,client_typed,items,total,photos,comment,created,updated,req_id) "
        "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (request["uid"], request["uname"], agent, ptype, cname, cname, json.dumps(items, ensure_ascii=False), total,
         json.dumps(photos), str(b.get("comment", ""))[:300], now(), now(), req_id))
    db.commit()
    r = row_ret(db.execute("SELECT * FROM returns WHERE id=?", (cur.lastrowid,)).fetchone())
    add_note([a for a in ADMIN_IDS if a != request["uid"]], "info", f"↩️ Vozvrat #{r['id']} tasdiq kutmoqda",
             f"{cname} · {agent} · {money(total)} so'm")
    return web.json_response({"ok": True, "ret": r})


async def h_ret_list(request):
    sql, args = "SELECT * FROM returns", []
    if request["role"] == "eksp":
        return web.json_response({"items": []})
    if request["role"] == "sklad":
        sql += " WHERE tg_id=?"
        args.append(request["uid"])
    elif request["role"] != "admin":              # agent: faqat o'z mijozlarining tasdiqlangan vozvratlari
        sql += " WHERE agent=? AND status='approved'"
        args.append(request["agent"])
    rows = db.execute(sql + " ORDER BY id DESC LIMIT 150", args).fetchall()
    return web.json_response({"items": [row_ret(r) for r in rows]})


def ret_full(r: dict) -> dict:
    cl = db.execute("SELECT ext_id, region, agent FROM clients WHERE id=?", (r.get("client_id") or 0,)).fetchone()
    return {**r, "kind": "return", "ext_id": (cl["ext_id"] if cl else "") or "", "region": (cl["region"] if cl else "") or "",
            "linked": bool(cl)}


async def send_return(r: dict) -> str:
    """Tasdiqlangan vozvrat: накладная + foto tasdiqlar -> vozvrat topigi. Xato bo'lsa matnini qaytaradi."""
    chat, topic = kv_get("ret_chat") or "", kv_get("ret_topic") or ""
    if not BOT_TOKEN:
        return "BOT_TOKEN o'rnatilmagan"
    if not chat:
        return "Vozvrat topigi belgilanmagan"
    from invoice import make_invoice
    jpg = await asyncio.get_running_loop().run_in_executor(None, make_invoice, ret_full(r))
    cap = f"↩️ ВОЗВРАТ № R-{r['id']} · {r['client_name']} · {r['agent']}"
    files = [("vozvrat.jpg", jpg)]
    for pid in r["photos"][:9]:
        data = await photo_get(pid)
        if data:
            files.append((f"{pid}.jpg", data))
    return await tg_album(chat, topic, files, cap)


# --- Jarvis tomoni (tasdiqlash)
async def h_j_returns(request):
    _jarvis_ok(request)
    st = request.query.get("status", "pending")
    sql, args = "SELECT * FROM returns", []
    if st in RET_ST:
        sql += " WHERE status=?"
        args.append(st)
    rows = db.execute(sql + " ORDER BY id DESC LIMIT 200", args).fetchall()
    out = [ret_full(row_ret(r)) for r in rows]
    cnt = {r["status"]: r["c"] for r in db.execute("SELECT status, COUNT(*) c FROM returns GROUP BY status").fetchall()}
    return web.json_response({"items": out, "counts": cnt, "topic": bool(kv_get("ret_chat")), "agents": ret_agents()})


async def h_j_photo(request):
    _jarvis_ok(request)
    data = await photo_get(request.match_info["pid"])
    if not data:
        raise web.HTTPNotFound()
    return web.Response(body=data, content_type="image/jpeg", headers={"Cache-Control": "max-age=86400"})


async def h_j_clients(request):
    _jarvis_ok(request)
    """Skladchi yozgan nom aniq bo'lmaydi: so'zlardan BIRORTASI mos kelsa ham chiqadi, eng o'xshashi birinchi."""
    sql, args = "SELECT id,ext_id,name,phone,region,address,agent,search FROM clients WHERE 1=1", []
    ag = request.query.get("agent", "").strip()
    if ag:                                        # agent nomi qavssiz/kirill-lotin farqi bilan ham mos keladi
        def _k(v):
            return set(w for w in translit(re.sub(r"\(.*?\)", " ", str(v or ""))).split() if len(w) > 1)
        ka = _k(ag)
        ags = [r["agent"] for r in db.execute("SELECT DISTINCT agent FROM clients WHERE agent IS NOT NULL AND agent<>''").fetchall()]
        ags = [a for a in ags if a == ag or (ka and (_k(a) <= ka or ka <= _k(a)) and _k(a))]
        if ags:
            sql += " AND agent IN (" + ",".join("?" * len(ags)) + ")"
            args += ags
    q = request.query.get("q", "").strip()
    words = [w for w in re.split(r"[\s,.\-]+", q) if len(w) >= 2 and w.lower() not in ("aka", "opa", "dukon", "dukoni", "do'kon", "magazin", "магазин", "ака", "дукон")]
    if words:
        sql += " AND (" + " OR ".join(["search LIKE ? OR search LIKE ?"] * len(words)) + ")"
        for w in words:
            args += [f"%{w.lower()}%", f"%{translit(w)}%"]
    rows = [dict(r) for r in db.execute(sql + " LIMIT 400", args).fetchall()]
    if not rows and ag and words:                 # agent bazasida topilmadi — hamma mijozlar orasidan qidiramiz
        sql2 = "SELECT id,ext_id,name,phone,region,address,agent,search FROM clients WHERE (" + " OR ".join(["search LIKE ? OR search LIKE ?"] * len(words)) + ")"
        a2 = []
        for w in words:
            a2 += [f"%{w.lower()}%", f"%{translit(w)}%"]
        rows = [dict(r) for r in db.execute(sql2 + " LIMIT 400", a2).fetchall()]
    if q:
        tq = translit(q)
        for r in rows:
            hit = sum(1 for w in words if w.lower() in r["search"] or translit(w) in r["search"])
            r["_s"] = hit * 2 + SequenceMatcher(None, tq, translit(r["name"])).ratio()
        rows.sort(key=lambda r: -r["_s"])
    else:
        rows.sort(key=lambda r: r["name"])
    return web.json_response({"items": [{k: v for k, v in r.items() if k not in ("search", "_s")} for r in rows[:40]]})


async def h_j_products(request):
    _jarvis_ok(request)
    ptype, prices = agent_price_map(request.query.get("agent", ""))
    items = [{"id": p["id"], "name": p["name"], "price": prices.get(p["id"], p["price"]), "unit": p["unit"]} for p in annotate(await get_products())]
    return web.json_response({"items": items, "ptype": ptype})


async def _ret_apply(rid: int, b: dict):
    """Jarvis'dagi o'zgartirishlar: agent, mijoz (bazadan yoki matn), mahsulotlar (miqdor/narx), izoh."""
    r = db.execute("SELECT * FROM returns WHERE id=?", (rid,)).fetchone()
    if not r:
        raise web.HTTPNotFound(text=json.dumps({"error": "Vozvrat topilmadi"}), content_type="application/json")
    r = row_ret(r)
    if r["status"] == "approved":
        raise web.HTTPBadRequest(text=json.dumps({"error": "Tasdiqlangan vozvratni o'zgartirib bo'lmaydi"}), content_type="application/json")
    agent = str(b.get("agent") or r["agent"]).strip()
    if agent not in ret_agents():
        raise web.HTTPBadRequest(text=json.dumps({"error": "Agent noto'g'ri"}), content_type="application/json")
    cid, cname = r["client_id"] or 0, r["client_name"]
    if "client_id" in b:
        cid = int(b.get("client_id") or 0)
        if cid:
            cl = db.execute("SELECT name FROM clients WHERE id=?", (cid,)).fetchone()
            if not cl:
                raise web.HTTPBadRequest(text=json.dumps({"error": "Mijoz bazada topilmadi"}), content_type="application/json")
            cname = cl["name"]
    if b.get("client_name") and not cid:
        cname = str(b["client_name"]).strip()[:120]
    items, total = r["items"], r["total"]
    if "items" in b:
        catalog = {p["id"]: p for p in annotate(await get_products())}
        items, total = ret_items(b["items"], agent, catalog, allow_price=True)
        if not items:
            raise web.HTTPBadRequest(text=json.dumps({"error": "Kamida bitta mahsulot qolishi kerak"}), content_type="application/json")
    ptype, _ = agent_price_map(agent)
    db.execute("UPDATE returns SET agent=?,ptype=?,client_id=?,client_name=?,items=?,total=?,comment=?,updated=? WHERE id=?",
               (agent, ptype, cid, cname, json.dumps(items, ensure_ascii=False), total, str(b.get("comment", r["comment"]))[:300], now(), rid))
    db.commit()
    return row_ret(db.execute("SELECT * FROM returns WHERE id=?", (rid,)).fetchone())


async def h_j_ret_save(request):
    _jarvis_ok(request)
    r = await _ret_apply(int(request.match_info["id"]), await request.json())
    return web.json_response({"ok": True, "ret": ret_full(r)})


async def h_j_ret_approve(request):
    _jarvis_ok(request)
    rid = int(request.match_info["id"])
    b = await request.json() if request.can_read_body else {}
    if not kv_get("ret_chat"):
        return web.json_response({"error": "Avval vozvrat topigini belgilang: guruhdagi kerakli topikka /vozvrat deb yozing"}, status=400)
    r = await _ret_apply(rid, b or {})
    if r["status"] == "approved":
        return web.json_response({"ok": True, "ret": ret_full(r)})
    if not r["client_id"] and not b.get("force"):
        return web.json_response({"error": "Mijoz bazadan tanlanmagan. Agent bazasidan mijozni tanlang (yoki 'baribir tasdiqlash')", "code": "noclient"}, status=400)
    who = str(b.get("by") or "Admin")[:60]
    db.execute("UPDATE returns SET status='approved', approved_at=?, approved_by=?, updated=? WHERE id=?", (now(), who, now(), rid))
    db.commit()
    r = row_ret(db.execute("SELECT * FROM returns WHERE id=?", (rid,)).fetchone())
    err = await send_return(r)
    agent_users = [x["tg_id"] for x in db.execute("SELECT tg_id FROM access WHERE agent=?", (r["agent"],)).fetchall()]
    add_note([r["tg_id"]], "info", f"✅ Vozvrat #{rid} tasdiqlandi", f"{r['client_name']} · {money(r['total'])} so'm")
    add_note(agent_users, "info", f"↩️ Mijozingizdan vozvrat #{rid}", f"{r['client_name']} · {money(r['total'])} so'm")
    return web.json_response({"ok": True, "ret": ret_full(r), "warn": err})


async def h_j_ret_reject(request):
    _jarvis_ok(request)
    rid = int(request.match_info["id"])
    reason = str((await request.json()).get("reason", "")).strip()[:200]
    r = db.execute("SELECT * FROM returns WHERE id=?", (rid,)).fetchone()
    if not r or r["status"] == "approved":
        return web.json_response({"error": "Rad etib bo'lmaydi"}, status=400)
    db.execute("UPDATE returns SET status='rejected', reason=?, updated=? WHERE id=?", (reason, now(), rid))
    db.commit()
    add_note([r["tg_id"]], "info", f"❌ Vozvrat #{rid} rad etildi", reason or r["client_name"])
    return web.json_response({"ok": True})


async def h_j_ret_resend(request):
    _jarvis_ok(request)
    r = db.execute("SELECT * FROM returns WHERE id=? AND status='approved'", (int(request.match_info["id"]),)).fetchone()
    if not r:
        return web.json_response({"error": "Tasdiqlangan vozvrat topilmadi"}, status=400)
    err = await send_return(row_ret(r))
    return web.json_response({"ok": not err, "error": err})


async def h_j_ret_invoice(request):
    _jarvis_ok(request)
    r = db.execute("SELECT * FROM returns WHERE id=?", (int(request.match_info["id"]),)).fetchone()
    if not r:
        raise web.HTTPNotFound()
    from invoice import make_invoice
    jpg = await asyncio.get_running_loop().run_in_executor(None, make_invoice, ret_full(row_ret(r)))
    return web.Response(body=jpg, content_type="image/jpeg")


async def h_j_ret_printed(request):
    _jarvis_ok(request)
    ids = [int(x) for x in (await request.json()).get("ids", [])][:300]
    db.executemany("UPDATE returns SET printed_at=? WHERE id=?", [(now(), i) for i in ids])
    db.commit()
    return web.json_response({"ok": True})


async def h_j_ret_paid(request):
    """Jarvis: vozvrat summasi Sales Doctor'da mijoz balansidan ayirish uchun navbatga qo'yildi."""
    _jarvis_ok(request)
    ids = [int(x) for x in (await request.json()).get("ids", [])][:300]
    db.executemany("UPDATE returns SET paid_at=? WHERE id=? AND status='approved'", [(now(), i) for i in ids])
    db.commit()
    return web.json_response({"ok": True})


async def h_j_settings(request):
    _jarvis_ok(request)
    if request.method == "POST":
        b = await request.json()
        pre = "otk" if b.get("which") == "otk" else "ret"
        if b.get("link"):                      # topikdagi xabar havolasi: t.me/c/<chat>/<topic>/<xabar> yoki t.me/<username>/<topic>/<xabar>
            m = re.search(r"t\.me/c/(\d+)/(\d+)(?:/(\d+))?", str(b["link"]))
            if m:
                chat, topic = "-100" + m.group(1), m.group(2) if m.group(3) else ""
            else:
                m = re.search(r"t\.me/([A-Za-z]\w{3,})/(\d+)(?:/(\d+))?", str(b["link"]))
                if not m:
                    return web.json_response({"error": "Havola tanilmadi. Topikdagi xabarni bosib «Копировать ссылку» ni tanlang"}, status=400)
                chat, topic = "@" + m.group(1), m.group(2) if m.group(3) else ""
            p = {"chat_id": chat, "text": "✅ " + ("Otkaz zakaslar" if pre == "otk" else "Vozvrat nakladnoylari") + " endi shu topikka tushadi"}
            if topic:
                p["message_thread_id"] = int(topic)
            res = await tg("sendMessage", **p)
            if not (res or {}).get("ok"):
                return web.json_response({"error": "Bot bu topikka yoza olmadi: " + str((res or {}).get("description", "Telegram javob bermadi")) + ". Bot guruhda admin ekanini tekshiring"}, status=400)
            chat = str(((res.get("result") or {}).get("chat") or {}).get("id") or chat)
            kv_set(pre + "_chat", chat)
            kv_set(pre + "_topic", topic)
            return web.json_response({"ok": True, "ret_chat": kv_get("ret_chat") or "", "ret_topic": kv_get("ret_topic") or "",
                                      "otk_chat": kv_get("otk_chat") or "", "otk_topic": kv_get("otk_topic") or ""})
        if b.get("clear"):
            kv_set(pre + "_chat", "")
            kv_set(pre + "_topic", "")
        elif b.get("test"):
            if not kv_get(pre + "_chat"):
                return web.json_response({"error": "Topik belgilanmagan"}, status=400)
            p = {"chat_id": kv_get(pre + "_chat"), "text": "✅ Sinov: " + ("otkaz zakaslar" if pre == "otk" else "vozvrat nakladnoylari") + " shu topikka tushadi"}
            if kv_get(pre + "_topic"):
                p["message_thread_id"] = int(kv_get(pre + "_topic"))
            res = await tg("sendMessage", **p)
            if not (res or {}).get("ok"):
                return web.json_response({"error": str((res or {}).get("description", "Telegram javob bermadi"))}, status=400)
    return web.json_response({"ret_chat": kv_get("ret_chat") or "", "ret_topic": kv_get("ret_topic") or "",
                              "otk_chat": kv_get("otk_chat") or "", "otk_topic": kv_get("otk_topic") or "", "order_topic": TOPIC_ID})


def read_price_xlsx(data: bytes) -> list:
    """Narxlar Excel: 'Наименование/Товар' va 'Цена/Narx' ustunlari -> [(nom, narx)]."""
    import openpyxl
    ws = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True).active
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    for i, r in enumerate(rows[:20]):
        low = [str(c or "").strip().lower() for c in r]
        cn = next((j for j, c in enumerate(low) if any(k in c for k in ("наимен", "товар", "продукт", "mahsulot", "nom", "name"))), None)
        cp = next((j for j, c in enumerate(low) if any(k in c for k in ("цена", "narx", "price", "стоим"))), None)
        if cn is not None and cp is not None:
            out = []
            for rr in rows[i + 1:]:
                if cn < len(rr) and cp < len(rr) and rr[cn]:
                    v = rr[cp] if isinstance(rr[cp], (int, float)) else _num(rr[cp])
                    if v:
                        out.append((str(rr[cn]), float(v)))
            return out
    out = []                                   # sarlavhasiz: birinchi matn + oxirgi son
    for r in rows:
        txt = [c for c in r if isinstance(c, str) and c.strip()]
        nums = [c for c in r if isinstance(c, (int, float))]
        if txt and nums:
            out.append((txt[0], float(nums[-1])))
    return out


def match_prices(rows: list, products: list):
    """[(nom, narx)] -> {mahsulot_id: narx}. Nomdagi raqamlar (0,5 kg) bir xil bo'lishi shart."""
    idx = [(p["id"],) + pkey(p["name"]) for p in products]
    res, miss = {}, []
    for name, price in rows:
        k, nums = pkey(name)
        best, bid = 0.0, None
        for pid, k2, n2 in idx:
            if n2 != nums:
                continue
            r = 1.0 if k == k2 else SequenceMatcher(None, k, k2).ratio()
            if r > best:
                best, bid = r, pid
        if bid and best >= 0.88:
            res[bid] = price
        else:
            miss.append(name)
    return res, miss


async def h_j_agents(request):
    _jarvis_ok(request)
    out = []
    for a in ret_agents():
        r = db.execute("SELECT ptype, prices, updated FROM agent_prices WHERE agent=?", (a,)).fetchone()
        out.append({"agent": a, "ptype": (r["ptype"] if r else "") or "", "n": len(json.loads(r["prices"] or "{}")) if r else 0,
                    "updated": r["updated"] if r else 0})
    return web.json_response({"items": out})


async def h_j_agent_prices(request):
    """Agentga narx turi biriktirish. JSON: {agent, ptype, items:[{name|id, price}]} yoki xlsx (?agent=&ptype=)."""
    _jarvis_ok(request)
    products = annotate(await get_products())
    if request.content_type == "application/json":
        b = await request.json()
        agent, ptype = str(b.get("agent", "")).strip(), str(b.get("ptype", "")).strip()[:60]
        ids = {p["id"] for p in products}
        by_id = {str(x["id"]): _num(x.get("price")) for x in b.get("items", []) if str(x.get("id", "")) in ids}
        prices, miss = match_prices([(x.get("name", ""), _num(x.get("price"))) for x in b.get("items", []) if str(x.get("id", "")) not in ids and x.get("name")], products)
        prices.update(by_id)
    else:
        agent, ptype = request.query.get("agent", "").strip(), request.query.get("ptype", "").strip()[:60]
        try:
            rows = read_price_xlsx(await request.read())
        except Exception as e:
            return web.json_response({"error": f"Excel o'qilmadi: {e}"}, status=400)
        prices, miss = match_prices(rows, products)
    if agent not in ret_agents():
        return web.json_response({"error": "Agent topilmadi"}, status=400)
    if not prices and not ptype:
        db.execute("DELETE FROM agent_prices WHERE agent=?", (agent,))
    else:
        db.execute("INSERT OR REPLACE INTO agent_prices(agent,ptype,prices,updated) VALUES(?,?,?,?)",
                   (agent, ptype, json.dumps(prices), now()))
    db.commit()
    return web.json_response({"ok": True, "matched": len(prices), "missed": len(miss), "missed_names": miss[:20]})


# ---------------------------------------------------------------- OTKAZ ZAKAS (skladchi: mijoz + zakas raqami + mahsulot rasmi)
def row_otk(r) -> dict:
    d = dict(r)
    d["photos"] = json.loads(d["photos"] or "[]")
    return d


async def send_otkaz(o: dict) -> str:
    chat, topic = kv_get("otk_chat") or "", kv_get("otk_topic") or ""
    if not chat:
        return "Otkaz topigi belgilanmagan"
    t = datetime.utcfromtimestamp(o["created"]) + timedelta(hours=5)
    cap = (f"🚫 ОТКАЗ · Zakas № {o['order_no']}\n🏪 {o['client_name']}\n📦 {o['user_name']} · {t:%d.%m.%Y %H:%M}"
           + (f"\n💬 {o['comment']}" if o.get("comment") else ""))
    files = []
    for pid in o["photos"]:
        data = await photo_get(pid)
        if data:
            files.append((f"{pid}.jpg", data))
    if not files:
        return "Rasm topilmadi"
    err = await tg_album(chat, topic, files, cap)
    if not err:
        db.execute("UPDATE otkaz SET sent=? WHERE id=?", (now(), o["id"]))
        db.commit()
    return err


async def h_otk_create(request):
    if request["role"] not in ("admin", "sklad", "eksp"):
        return web.json_response({"error": "Otkazni faqat skladchi yoki ekspeditor kiritadi"}, status=403)
    b = await request.json()
    req_id = re.sub(r"[^\w-]", "", str(b.get("req_id", "")))[:64]
    if req_id:
        dup = db.execute("SELECT * FROM otkaz WHERE tg_id=? AND req_id=?", (request["uid"], req_id)).fetchone()
        if dup:
            return web.json_response({"ok": True, "otkaz": row_otk(dup), "duplicate": True})
    cname = re.sub(r"\s+", " ", str(b.get("client_name", ""))).strip()[:120]
    ono = re.sub(r"\s+", " ", str(b.get("order_no", ""))).strip()[:40]
    if len(cname) < 2:
        return web.json_response({"error": "Mijoz nomini yozing"}, status=400)
    if not ono:
        return web.json_response({"error": "Zakas raqamini yozing"}, status=400)
    if not b.get("photos"):
        return web.json_response({"error": "Mahsulotni rasmga oling (kamida 1 ta)"}, status=400)
    try:
        photos = await save_photos(b.get("photos"), limit=10)
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    cur = db.execute("INSERT INTO otkaz(tg_id,user_name,client_name,order_no,photos,comment,created,req_id) VALUES(?,?,?,?,?,?,?,?)",
                     (request["uid"], request["uname"], cname, ono, json.dumps(photos), str(b.get("comment", ""))[:300], now(), req_id))
    db.commit()
    o = row_otk(db.execute("SELECT * FROM otkaz WHERE id=?", (cur.lastrowid,)).fetchone())
    err = await send_otkaz(o)
    add_note([a for a in ADMIN_IDS if a != request["uid"]], "info", f"🚫 Otkaz · zakas № {ono}", f"{cname} · {len(photos)} ta rasm")
    o = row_otk(db.execute("SELECT * FROM otkaz WHERE id=?", (o["id"],)).fetchone())
    return web.json_response({"ok": True, "otkaz": o, "warn": err})


async def h_otk_list(request):
    if request["role"] not in ("admin", "sklad", "eksp"):
        return web.json_response({"items": []})
    sql, args = "SELECT * FROM otkaz", []
    if request["role"] in ("sklad", "eksp"):
        sql += " WHERE tg_id=?"
        args.append(request["uid"])
    return web.json_response({"items": [row_otk(r) for r in db.execute(sql + " ORDER BY id DESC LIMIT 150", args).fetchall()]})


async def h_j_otkaz(request):
    _jarvis_ok(request)
    rows = db.execute("SELECT * FROM otkaz ORDER BY id DESC LIMIT 200").fetchall()
    new = db.execute("SELECT COUNT(*) c FROM otkaz WHERE seen_at=0").fetchone()["c"]
    return web.json_response({"items": [row_otk(r) for r in rows], "new": new, "topic": bool(kv_get("otk_chat"))})


async def h_j_otk_seen(request):
    _jarvis_ok(request)
    db.execute("UPDATE otkaz SET seen_at=? WHERE id=?", (now(), int(request.match_info["id"])))
    db.commit()
    return web.json_response({"ok": True})


async def h_j_otk_resend(request):
    _jarvis_ok(request)
    r = db.execute("SELECT * FROM otkaz WHERE id=?", (int(request.match_info["id"]),)).fetchone()
    if not r:
        raise web.HTTPNotFound()
    err = await send_otkaz(row_otk(r))
    return web.json_response({"ok": not err, "error": err})


# ---------------------------------------------------------------- XODIMLAR (login/parol Jarvis'dagi "Foydalanuvchilar" bo'limidan)
ROLE_OF = {"agent": None, "sklad": SKLAD, "eksp": EKSP, "admin": ADMIN_ROLE}


def agent_find(x: str):
    """SD agent nomini topadi: qavs ichidagisiz, so'zlar bo'yicha (kirill/lotin farqi yo'q).
    "Samandar", "Хусанов Самандар", "Хусанов Самандар ( Шахар )" — hammasi bitta agent."""
    def key(v):
        return set(w for w in translit(re.sub(r"\(.*?\)", " ", str(v or ""))).split() if len(w) > 1)
    kx = key(x)
    if not kx:
        return None
    hits = [a for a in ret_agents() if norm(a) == norm(x)] or [a for a in ret_agents() if kx <= key(a) or (key(a) and key(a) <= kx)]
    return hits[0] if len(hits) == 1 or (hits and norm(hits[0]) == norm(x)) else (hits[0] if hits else None)


def _staff_row(login):
    return db.execute("SELECT l.login, l.tg_id, u.name, u.username AS phone, u.last_seen, a.agent "
                      "FROM app_logins l LEFT JOIN users u ON u.tg_id=l.tg_id LEFT JOIN access a ON a.tg_id=l.tg_id WHERE l.login=?", (login,)).fetchone()


def _staff_out(r):
    acc = r["agent"] or ""
    role = "sklad" if acc == SKLAD else "eksp" if acc == EKSP else "admin" if acc == ADMIN_ROLE or r["tg_id"] in ADMIN_IDS else "agent" if acc else ""
    return {"login": r["login"], "name": r["name"] or "", "phone": r["phone"] or "", "role": role,
            "agent": acc if role == "agent" else "", "active": bool(acc) or r["tg_id"] in ADMIN_IDS,
            "last_seen": r["last_seen"] or 0, "telegram": r["tg_id"] > 0, "sections": _sections_of(r["tg_id"])}


async def h_j_staff(request):
    _jarvis_ok(request)
    rows = db.execute("SELECT login FROM app_logins ORDER BY login").fetchall()
    return web.json_response({"items": [_staff_out(_staff_row(r["login"])) for r in rows], "agents": ret_agents()})


async def h_j_staff_save(request):
    """Jarvis -> {login, password?, name, phone, role: agent|sklad|admin, agent, active}. Login bo'yicha yaratadi yoki yangilaydi."""
    _jarvis_ok(request)
    b = await request.json()
    login = str(b.get("login", "")).strip().lower()
    if not re.fullmatch(r"[\w.@-]{3,40}", login):
        return web.json_response({"error": "Login: 3-40 belgi (harf, raqam, . - _ @)"}, status=400)
    role = str(b.get("role", "agent")).strip().lower()
    if role not in ROLE_OF:
        return web.json_response({"error": "Rol: agent, sklad, eksp yoki admin"}, status=400)
    agent = str(b.get("agent", "")).strip()
    if role == "agent":
        match = agent_find(agent)
        if not match:
            return web.json_response({"error": f"SD agent «{agent or '—'}» MC Xodim'da topilmadi. Bor agentlar: " + ", ".join(ret_agents()), "agents": ret_agents()}, status=400)
        agent = match
    pw = str(b.get("password", ""))
    ph = str(b.get("pw_hash", "")).strip().lower()          # Jarvis'dagi PBKDF2 xeshi (parol ochiq yuborilmaydi)
    if ph and not re.fullmatch(r"[0-9a-f]{16,128}\$[0-9a-f]{64}", ph):
        return web.json_response({"error": "Parol xeshi noto'g'ri"}, status=400)
    old = db.execute("SELECT tg_id FROM app_logins WHERE login=?", (login,)).fetchone()
    if not old and len(pw) < 4 and not ph:
        return web.json_response({"error": "Yangi xodimga parol kerak (kamida 4 belgi)"}, status=400)
    if pw and len(pw) < 4:
        return web.json_response({"error": "Parol kamida 4 belgi"}, status=400)
    if old:
        uid = old["tg_id"]
    else:                                         # Telegram'siz xodim: ichki (manfiy) ID
        uid = min(-1000, (db.execute("SELECT MIN(tg_id) m FROM users").fetchone()["m"] or 0)) - 1
        db.execute("INSERT INTO app_logins(login,pw,tg_id,created) VALUES(?,?,?,?)", (login, ph or pw_hash(pw), uid, now()))
        pw, ph = "", ""
    if "sections" in b:                           # Jarvis rol bo'limlari (ilovadagi menyu shunga qarab)
        secs = [str(x)[:40] for x in (b.get("sections") or []) if str(x).strip()][:200]
        db.execute("INSERT OR REPLACE INTO mc_sections(login,secs) VALUES(?,?)", (login, json.dumps(secs)))
    name = re.sub(r"\s+", " ", str(b.get("name", "")).strip())[:80] or login
    db.execute("INSERT INTO users(tg_id,name,username,created,last_seen) VALUES(?,?,?,?,0) "
               "ON CONFLICT(tg_id) DO UPDATE SET name=excluded.name" + (", username=excluded.username" if uid < 0 else ""),
               (uid, name, str(b.get("phone", ""))[:30], now()))
    newpw = ph or (pw_hash(pw) if pw else "")
    oldpw = db.execute("SELECT pw FROM app_logins WHERE login=?", (login,)).fetchone()["pw"]
    if newpw and newpw != oldpw:
        db.execute("UPDATE app_logins SET pw=? WHERE login=?", (newpw, login))
        db.execute("DELETE FROM app_tokens WHERE tg_id=?", (uid,))      # parol almashdi — eski kirishlar bekor
    active = b.get("active", True) not in (False, 0, "0", "false")
    if active:
        db.execute("INSERT OR REPLACE INTO access(tg_id,agent,added) VALUES(?,?,?)", (uid, ROLE_OF[role] or agent, now()))
    else:
        db.execute("DELETE FROM access WHERE tg_id=?", (uid,))
        db.execute("DELETE FROM app_tokens WHERE tg_id=?", (uid,))
    db.commit()
    return web.json_response({"ok": True, "staff": _staff_out(_staff_row(login)), "created": not old})


async def h_j_staff_delete(request):
    _jarvis_ok(request)
    login = str((await request.json()).get("login", "")).strip().lower()
    r = db.execute("SELECT tg_id FROM app_logins WHERE login=?", (login,)).fetchone()
    if not r:
        return web.json_response({"ok": True})
    db.execute("DELETE FROM app_logins WHERE login=?", (login,))
    db.execute("DELETE FROM app_tokens WHERE tg_id=?", (r["tg_id"],))
    db.execute("DELETE FROM access WHERE tg_id=?", (r["tg_id"],))
    db.commit()
    return web.json_response({"ok": True})


# ---------------------------------------------------------------- AGENT: mijoz balanslari + savdo hisoboti (Jarvis'dan har 10 daq.)
async def h_j_balances(request):
    _jarvis_ok(request)
    items = (await request.json()).get("items") or []
    t = now()
    cur = db.executemany("UPDATE clients SET balance=?, bal_t=? WHERE ext_id=?",
                         [(float(x.get("bal") or 0), t, str(x.get("id"))) for x in items if x.get("id")])
    db.commit()
    kv_set("bal_t", str(t))
    return web.json_response({"ok": True, "updated": cur.rowcount})


async def h_j_agent_stats(request):
    _jarvis_ok(request)
    b = await request.json()
    if b.get("agent") not in ret_agents():
        return web.json_response({"error": "Agent topilmadi"}, status=400)
    b["t"] = now()
    kv_set("astats:" + b["agent"], json.dumps(b, ensure_ascii=False))
    return web.json_response({"ok": True})


def _who_agent(request):
    if request["role"] == "agent":
        return request["agent"]
    if request["role"] == "admin":
        return request.query.get("agent", "").strip()
    return ""


async def h_agent_balances(request):
    ag = _who_agent(request)
    if not ag:
        return web.json_response({"error": "Faqat agent uchun"}, status=403)
    rows = [dict(r) for r in db.execute("SELECT id,ext_id,name,region,phone,balance FROM clients WHERE agent=? ORDER BY COALESCE(balance,0), name", (ag,))]
    debt = sum(-(r["balance"] or 0) for r in rows if (r["balance"] or 0) < 0)
    return web.json_response({"items": rows, "debt": debt, "n_debt": sum(1 for r in rows if (r["balance"] or 0) < 0),
                              "t": int(kv_get("bal_t") or 0)})


async def h_j_narx(request):
    """Jarvis -> narx snapshot (turlar, tovarlar, narxlar). Faqat o'qish uchun saqlanadi."""
    _jarvis_ok(request)
    b = await request.json()
    if not isinstance(b, dict) or "types" not in b:
        return web.json_response({"error": "Noto'g'ri ma'lumot"}, status=400)
    db.execute("INSERT OR REPLACE INTO kv(k,v) VALUES('narx_snap', ?)", (json.dumps(b, ensure_ascii=False),))
    db.commit()
    return web.json_response({"ok": True, "types": len(b.get("types") or []), "products": len(b.get("products") or [])})


async def h_narx_list(request):
    """MC Xodim ilovasi: narx bo'limi (Jarvis'da 'Narxlar: ko'rish' yoki 'o'zgartirish' ruxsati bo'lsa)."""
    secs = _sections_of(request["uid"])
    if not (request["admin"] or "narx" in secs or "narx_edit" in secs):
        return web.json_response({"error": "Narxlar bo'limi sizga berilmagan"}, status=403)
    r = db.execute("SELECT v FROM kv WHERE k='narx_snap'").fetchone()
    snap = json.loads(r["v"]) if r else {"t": 0, "types": [], "products": [], "prices": {}}
    snap["can_edit"] = False                       # tahrir faqat Jarvis kompyuterida (hozircha)
    return web.json_response(snap)


async def h_debt_refresh(request):
    """Ekspeditor/admin: «Salesdan yangilash» — Jarvis keyingi tekshiruvda balanslarni Sales Doctor'dan qayta oladi."""
    if request["role"] not in ("admin", "eksp"):
        return web.json_response({"error": "Ruxsat yo'q"}, status=403)
    kv_set("bal_req", str(now()))
    return web.json_response({"ok": True, "t": int(kv_get("bal_t") or 0)})


async def h_j_bal_req(request):
    """Jarvis (har 30 soniyada): so'rov bormi? Bor bo'lsa qaytaradi va tozalaydi."""
    _jarvis_ok(request)
    v = int(kv_get("bal_req") or 0)
    if v:
        kv_set("bal_req", "0")
    return web.json_response({"req": v})


async def h_debtors(request):
    """Ekspeditor (va admin): barcha agentlar mijozlaridan qarzdorlar ro'yxati (Jarvis'dan har 10 daq. yangilanadi)."""
    if request["role"] not in ("admin", "eksp"):
        return web.json_response({"error": "Faqat ekspeditor uchun"}, status=403)
    rows = [dict(r) for r in db.execute("SELECT id,ext_id,name,region,address,phone,agent,balance FROM clients "
                                        "WHERE COALESCE(balance,0)<0 ORDER BY balance, name")]
    by = {}
    for r in rows:
        a = by.setdefault(r["agent"] or "—", {"agent": r["agent"] or "—", "n": 0, "debt": 0})
        a["n"] += 1
        a["debt"] += -(r["balance"] or 0)
    return web.json_response({"items": rows, "debt": sum(-(r["balance"] or 0) for r in rows), "n_debt": len(rows),
                              "agents": sorted(by.values(), key=lambda x: -x["debt"]), "t": int(kv_get("bal_t") or 0)})


async def h_agent_stats(request):
    ag = _who_agent(request)
    if not ag:
        return web.json_response({"error": "Faqat agent uchun"}, status=403)
    try:
        st = json.loads(kv_get("astats:" + ag) or "{}")
    except Exception:
        st = {}
    prods = st.get("products") or []
    today = {c["cat"]: c for c in st.get("today") or []}
    month = {c["cat"]: c for c in st.get("month") or []}
    # Jarvis'ga hali tushmagan, shu ilovadan berilgan zakaslar ham darhol hisobga qo'shiladi (ro'yxat yangilanib boradi)
    t0 = int(st.get("t") or 0)
    idx = [(p, pkey(p["name"])) for p in prods]
    d0 = datetime.utcnow() + timedelta(hours=5)
    day0 = int((datetime(d0.year, d0.month, d0.day) - timedelta(hours=5)).timestamp())
    for o in db.execute("SELECT created, items FROM orders WHERE created>? AND client_id IN (SELECT id FROM clients WHERE agent=?) AND status!='cancelled'", (t0, ag)).fetchall():
        for it in json.loads(o["items"] or "[]"):
            k, nums = pkey(it["name"])
            best, bp = 0.0, None
            for p, (k2, n2) in idx:
                if n2 != nums:
                    continue
                r = 1.0 if k == k2 else SequenceMatcher(None, k, k2).ratio()
                if r > best:
                    best, bp = r, p
            if not bp or best < 0.85:
                continue
            q, sm = float(it["qty"]), float(it["qty"]) * float(it["price"])
            bp["q"] = bp.get("q", 0) + q
            bp["s"] = bp.get("s", 0) + sm
            for dct, ok in ((month, True), (today, o["created"] >= day0)):
                if ok:
                    c = dct.setdefault(bp["cat"], {"cat": bp["cat"], "qty": 0, "sum": 0})
                    c["qty"] += q
                    c["sum"] += sm
    day, mdays = int(st.get("day") or d0.day), int(st.get("mdays") or 30)
    remind = []
    for p in prods:
        if not p.get("lq"):
            continue
        exp = p["lq"] * day / mdays                                  # o'tgan oy sur'atida shu kungacha kutilgan
        if p.get("q", 0) <= 0:
            remind.append({**p, "kind": "none"})
        elif p["q"] < exp * 0.5:
            remind.append({**p, "kind": "low", "pct": round(100 * p["q"] / exp) if exp else 0})
    remind.sort(key=lambda x: (x["kind"] != "none", -x.get("ls", 0)))
    srt = lambda d: sorted(d.values(), key=lambda x: -x["sum"])
    return web.json_response({"t": t0, "today": srt(today), "month": srt(month), "remind": remind[:60],
                              "last_total": sum(p.get("ls", 0) for p in prods), "day": day, "mdays": mdays})


BOOT_V = str(int(time.time()))


async def h_index(request):
    # style/app manzillariga versiya qo'shamiz: har deploy'da Telegram yangi faylni oladi (kesh muammosi yo'q)
    html = (BASE / "webapp" / "index.html").read_text("utf-8")
    html = re.sub(r'(/static/[\w.]+\.(?:js|css))', rf'\1?v={BOOT_V}', html)
    return web.Response(text=html, content_type="text/html", headers={"Cache-Control": "no-store"})


@web.middleware
async def error_mw(request: web.Request, handler):
    """Kutilmagan xato ilovani "qotirmasin": logga yoziladi, foydalanuvchiga tushunarli javob qaytadi."""
    try:
        return await handler(request)
    except web.HTTPException:
        raise
    except json.JSONDecodeError:
        return web.json_response({"error": "So'rov noto'g'ri formatda"}, status=400)
    except Exception:
        log.exception("Xato: %s %s", request.method, request.path)
        return web.json_response({"error": "Serverda vaqtinchalik xato. Qayta urinib ko'ring"}, status=500)


async def h_clientlog(request):
    """Telefondagi JS xatolari — server logiga (sababini topish uchun)."""
    try:
        b = await request.json()
        log.warning("CLIENT %s: %s | %s", request.get("uid"), str(b.get("msg", ""))[:300], str(b.get("at", ""))[:200])
    except Exception:
        pass
    return web.json_response({"ok": True})


@web.middleware
async def nocache_mw(request: web.Request, handler):
    resp = await handler(request)
    if request.path.startswith("/static/") or request.path == "/":
        resp.headers["Cache-Control"] = "no-store"
    return resp


async def on_start(app):
    reindex_clients()
    app["tasks"] = [asyncio.create_task(poll_bot()), asyncio.create_task(keepalive()), asyncio.create_task(stock_loop()), asyncio.create_task(persist.loop(DATABASE_URL, db)), asyncio.create_task(client_loop())]
    r = db.execute("SELECT COUNT(*) c, MAX(updated) t FROM stock").fetchone()
    if r["c"]:
        _stock.update(rows=r["c"], t=r["t"] or 0, src="saqlangan")


def make_app():
    app = web.Application(middlewares=[error_mw, nocache_mw, auth_mw], client_max_size=20 * 1024 * 1024)
    app.add_routes([
        web.get("/", h_index),
        web.get("/health", h_health),
        web.post("/api/clientlog", h_clientlog),
        web.get("/api/me", h_me),
        web.put("/api/me", h_me_put),
        web.get("/api/products", h_products),
        web.put("/api/products/{id}/unit", h_unit),
        web.get("/api/backup", h_backup),
        web.get("/jarvis/orders", h_jarvis_orders),
        web.get("/jarvis/invoice/{id}.jpg", h_jarvis_invoice),
        web.post("/jarvis/printed", h_jarvis_printed),
        web.get("/api/users", h_users),
        web.get("/api/ret/agents", h_ret_agents),
        web.get("/api/returns", h_ret_list),
        web.get("/api/otkaz", h_otk_list),
        web.post("/api/otkaz", h_otk_create),
        web.get("/jarvis/otkaz", h_j_otkaz),
        web.post("/jarvis/otkaz/{id}/seen", h_j_otk_seen),
        web.post("/jarvis/otkaz/{id}/resend", h_j_otk_resend),
        web.post("/api/returns", h_ret_create),
        web.get("/jarvis/returns", h_j_returns),
        web.get("/jarvis/return_photo/{pid}.jpg", h_j_photo),
        web.get("/jarvis/photo/{pid}.jpg", h_j_photo),
        web.get("/jarvis/clients", h_j_clients),
        web.get("/jarvis/products", h_j_products),
        web.post("/jarvis/returns/{id}", h_j_ret_save),
        web.post("/jarvis/returns/{id}/approve", h_j_ret_approve),
        web.post("/jarvis/returns/{id}/reject", h_j_ret_reject),
        web.post("/jarvis/returns/{id}/resend", h_j_ret_resend),
        web.get("/jarvis/return_invoice/{id}.jpg", h_j_ret_invoice),
        web.post("/jarvis/return_printed", h_j_ret_printed),
        web.post("/jarvis/return_paid", h_j_ret_paid),
        web.get("/jarvis/settings", h_j_settings),
        web.post("/jarvis/settings", h_j_settings),
        web.get("/jarvis/agents", h_j_agents),
        web.get("/jarvis/staff", h_j_staff),
        web.post("/jarvis/balances", h_j_balances),
        web.post("/jarvis/agent_stats", h_j_agent_stats),
        web.get("/api/agent/balances", h_agent_balances),
        web.get("/api/debtors", h_debtors),
        web.post("/api/debtors/refresh", h_debt_refresh),
        web.post("/jarvis/bal_req", h_j_bal_req),
        web.get("/api/narx/list", h_narx_list),
        web.post("/jarvis/narx", h_j_narx),
        web.get("/api/agent/stats", h_agent_stats),
        web.post("/jarvis/staff", h_j_staff_save),
        web.post("/jarvis/staff/delete", h_j_staff_delete),
        web.post("/jarvis/agent_prices", h_j_agent_prices),
        web.get("/api/notes", h_notes),
        web.post("/app/login", h_app_login),
        web.post("/api/app/logout", h_app_logout),
        web.put("/api/users/{id}/login", h_user_login),
        web.post("/api/notes/read", h_notes_read),
        web.put("/api/users/{id}/access", h_user_access),
        web.get("/api/stock/status", h_stock_status),
        web.post("/api/stock/sync", h_stock_sync),
        web.post("/api/stock/import", h_stock_import),
        web.get("/api/regions", h_regions),
        web.get("/api/clients", h_clients),
        web.post("/api/clients/import", h_clients_import),
        web.post("/api/clients/sync", h_clients_sync),
        web.post("/api/clients", h_client_add),
        web.get("/api/clients/new", h_clients_new),
        web.get("/api/orders", h_orders),
        web.post("/api/orders", h_order_create),
        web.post("/api/orders/{id}/status", h_order_status),
        web.delete("/api/orders/{id}", h_order_delete),
        web.static("/static", BASE / "webapp"),
    ])
    app.on_startup.append(on_start)

    async def on_stop(app):                       # deploy/qayta ishga tushishda oxirgi holatni saqlab ketamiz
        await persist.backup(DATABASE_URL, db, force=True)
    app.on_shutdown.append(on_stop)
    return app


if __name__ == "__main__":
    web.run_app(make_app(), host="0.0.0.0", port=int(os.getenv("PORT", "8080")))
