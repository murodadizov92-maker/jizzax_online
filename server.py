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
import sqlite3
import time
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
PRODUCTS_URL = os.getenv("PRODUCTS_URL", "")  # zakas bot'ning mahsulot API manzili
PRODUCTS_TOKEN = os.getenv("PRODUCTS_TOKEN", "")  # kerak bo'lsa (Bearer)
DB_PATH = os.getenv("DB_PATH", str(BASE / "data" / "online.db"))
DEV = os.getenv("DEV") == "1"                 # faqat lokal sinov uchun
SELF_URL = os.getenv("RENDER_EXTERNAL_URL", os.getenv("SELF_URL", ""))
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
"""
)
db.commit()

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
            "name": str(name),
            "price": _num(_pick(p, "price", "narx", "cost", "цена", default=0)),
            "image": img or "",
            "category": str(_pick(p, "category", "kategoriya", "cat", "group", default="Boshqa")),
            "unit": str(_pick(p, "unit", "birlik", default="")),
            "active": bool(_pick(p, "active", "enabled", "available", default=True)),
        })
    return [p for p in out if p["active"]]


async def get_products(force=False) -> list:
    if not force and _cache["items"] and now() - _cache["t"] < 45:
        return _cache["items"]
    items = []
    if PRODUCTS_URL:
        try:
            headers = {"Authorization": f"Bearer {PRODUCTS_TOKEN}"} if PRODUCTS_TOKEN else {}
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as s:
                async with s.get(PRODUCTS_URL, headers=headers) as r:
                    r.raise_for_status()
                    items = map_products(await r.json(content_type=None))
        except Exception as e:
            log.warning("products sync failed: %s", e)
    if not items:
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
        lines.append(f"• {it['name']} × {it['qty']:g} = {money(it['price'] * it['qty'])}")
    lines += ["", f"💰 <b>Jami: {money(o['total'])} so'm</b>"]
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
    return web.json_response({"items": items, "t": _cache["t"]})


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
    catalog = {p["id"]: p for p in await get_products()}
    items, total = [], 0.0
    for it in b.get("items", []):
        p = catalog.get(str(it.get("id")))
        qty = _num(it.get("qty"))
        if not p or qty <= 0:
            continue
        items.append({"id": p["id"], "name": p["name"], "price": p["price"], "qty": qty})  # narx serverdan — doim yangi
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


async def h_index(request):
    return web.FileResponse(BASE / "webapp" / "index.html", headers={"Cache-Control": "no-cache"})


async def on_start(app):
    reindex_clients()
    app["tasks"] = [asyncio.create_task(poll_bot()), asyncio.create_task(keepalive())]


def make_app():
    app = web.Application(middlewares=[auth_mw], client_max_size=20 * 1024 * 1024)
    app.add_routes([
        web.get("/", h_index),
        web.get("/health", h_health),
        web.get("/api/me", h_me),
        web.put("/api/me", h_me_put),
        web.get("/api/products", h_products),
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
