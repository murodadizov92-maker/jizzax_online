"""Avtomatik tekshiruv: python tests/selftest.py
Vaqtinchalik bazada serverni ishga tushirib, asosiy ishlarni sinaydi. Hammasi ✅ bo'lsa — yangilashga tayyor."""
import json, os, sqlite3, subprocess, sys, tempfile, time, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8197
DB = os.path.join(tempfile.mkdtemp(), "t.db")
ok = fail = 0


def req(path, data=None, user=None, method=None, headers=None):
    h = {"Content-Type": "application/json", **(headers or {})}
    if user:
        h["X-Dev-User"] = str(user)
    r = urllib.request.Request(f"http://127.0.0.1:{PORT}{path}", data=json.dumps(data).encode() if data is not None else None, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            body = resp.read()
            return resp.status, (json.loads(body) if body[:1] in (b"{", b"[") else body)
    except urllib.error.HTTPError as e:
        b = e.read()
        try:
            return e.code, json.loads(b)
        except Exception:
            return e.code, b


def check(name, cond, extra=""):
    global ok, fail
    if cond:
        ok += 1
        print("  ✅", name)
    else:
        fail += 1
        print("  ❌", name, extra)


env = {**os.environ, "DB_PATH": DB, "DEV": "1", "ADMIN_IDS": "1", "PORT": str(PORT), "JARVIS_KEY": "testkey",
       "DATABASE_URL": "", "BOT_TOKEN": "", "SD_LOGIN": "", "PUSH_PRIVATE": "0"}
srv = subprocess.Popen([sys.executable, "server.py"], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
try:
    for _ in range(60):
        try:
            if req("/health")[0] == 200:
                break
        except Exception:
            time.sleep(0.5)
    print("Server:")
    check("ishga tushdi (/health)", req("/health")[0] == 200)
    c = sqlite3.connect(DB)
    c.execute("INSERT INTO clients(ext_id,name,region,address,agent,search) VALUES('d0_1','25-ДУКОН','Пахтакор','','Агент А','25-дукон')")
    c.execute("INSERT INTO clients(ext_id,name,region,address,agent,search) VALUES('d0_2','Бошқа дўкон','Жиззах','','Агент Б','бошқа')")
    c.commit()
    c1 = c.execute("SELECT id FROM clients WHERE agent='Агент А'").fetchone()[0]
    c2 = c.execute("SELECT id FROM clients WHERE agent='Агент Б'").fetchone()[0]

    print("Ruxsatlar:")
    check("ruxsatsiz foydalanuvchi bloklanadi", req("/api/clients", user=50)[0] == 403)
    check("admin agentga ruxsat beradi", req("/api/users/50/access", {"agent": "Агент А"}, user=1, method="PUT")[0] == 200)
    st, d = req("/api/clients", user=50)
    check("agent faqat o'z mijozini ko'radi", st == 200 and [x["agent"] for x in d["items"]] == ["Агент А"], d)
    st, d = req("/api/clients", user=1)
    check("admin hammasini ko'radi", st == 200 and len(d["items"]) == 2)

    print("Zakas:")
    st, d = req("/api/products", user=50)
    prods = [p for p in d.get("items", []) if p.get("price", 0) > 0]
    check("mahsulotlar yuklandi", st == 200 and len(prods) > 0)
    pid = prods[0]["id"]
    st, d = req("/api/orders", {"client_id": c2, "items": [{"id": pid, "qty": 1}]}, user=50)
    check("begona mijozga zakas yo'q", st == 403)
    st, d = req("/api/orders", {"client_id": c1, "items": [{"id": pid, "qty": -5}]}, user=50)
    check("manfiy miqdor rad etiladi", st == 400)
    st, d = req("/api/orders", {"client_id": c1, "items": [{"id": pid, "qty": 10 ** 9}]}, user=50)
    check("haddan katta miqdor rad etiladi", st == 400)
    st, d = req("/api/orders", {"client_id": c1, "items": [{"id": pid, "qty": 2, "price": 1}], "req_id": "abc123"}, user=50)
    check("zakas yaratildi", st == 200 and d.get("ok"), d)
    oid = d["order"]["id"]
    check("narx serverdan olinadi (soxta narx o'tmaydi)", abs(d["order"]["total"] - prods[0]["price"] * 2) < 0.01, d["order"]["total"])
    st, d2 = req("/api/orders", {"client_id": c1, "items": [{"id": pid, "qty": 2}], "req_id": "abc123"}, user=50)
    check("qayta yuborilsa ikkinchi zakas ochilmaydi", st == 200 and d2.get("duplicate") and d2["order"]["id"] == oid, d2)
    st, d = req("/api/orders?scope=all", user=50)
    check("agent faqat o'z zakaslarini ko'radi", st == 200 and all(o["tg_id"] == 50 for o in d["items"]))

    print("Bildirishnoma va Jarvis:")
    st, d = req("/api/notes", user=1)
    check("adminga 'yangi zakas' xabari", st == 200 and any(n["order_id"] == oid for n in d["items"]))
    check("Jarvis kalitsiz kira olmaydi", req("/jarvis/orders")[0] == 401)
    st, d = req("/jarvis/orders", headers={"X-Jarvis-Key": "testkey"})
    check("Jarvis zakaslarni ko'radi", st == 200 and any(o["id"] == oid for o in d["items"]))
    st, body = req(f"/jarvis/invoice/{oid}.jpg", headers={"X-Jarvis-Key": "testkey"})
    check("накладная rasmi yasaladi", st == 200 and isinstance(body, bytes) and body[:2] == b"\xff\xd8")
    req("/jarvis/printed", {"ids": [oid]}, headers={"X-Jarvis-Key": "testkey"})
    st, d = req("/api/notes", user=50)
    check("agentga 'chop etildi' xabari", any("chop etildi" in n["title"] for n in d["items"]))

    print("Telefon ilovasi (login/parol):")
    check("admin login beradi", req("/api/users/50/login", {"login": "agent_a", "password": "parol123"}, user=1, method="PUT")[0] == 200)
    check("noto'g'ri parol rad etiladi", req("/app/login", {"login": "agent_a", "password": "xato"})[0] == 400)
    st, d = req("/app/login", {"login": "AGENT_A", "password": "parol123"})
    check("to'g'ri login bilan kiradi", st == 200 and d.get("token"))
    tok = d.get("token", "")
    st, d = req("/api/me", headers={"X-App-Token": tok})
    check("token bilan profil ochiladi", st == 200 and d.get("allowed"), d)
    req("/api/users/50/login", {"login": ""}, user=1, method="PUT")
    check("login o'chirilsa token bekor bo'ladi", req("/api/clients", headers={"X-App-Token": tok})[0] in (401, 403))

    print("Vozvrat (skladchi):")
    import base64, io as _io
    from PIL import Image as _Im
    _b = _io.BytesIO(); _Im.new("RGB", (640, 480), (200, 80, 60)).save(_b, "JPEG")
    photo = "data:image/jpeg;base64," + base64.b64encode(_b.getvalue()).decode()
    check("admin skladchi rolini beradi", req("/api/users/70/access", {"agent": "@sklad"}, user=1, method="PUT")[0] == 200)
    st, d = req("/api/me", user=70)
    check("skladchi roli aniqlanadi", st == 200 and d.get("role") == "sklad", d)
    st, d = req("/api/clients", user=70)
    check("skladchiga mijoz bazasi yopiq", st == 200 and d["items"] == [])
    st, d = req("/api/orders", {"client_id": c1, "items": [{"id": prods[0]["id"], "qty": 1}]}, user=70)
    check("skladchi zakas bera olmaydi", st == 403)
    st, d = req("/api/ret/agents", user=70)
    check("skladchi agentlarni ko'radi", st == 200 and "Агент А" in [a["agent"] for a in d["items"]], d)
    check("agentga narx turi biriktiriladi", req("/jarvis/agent_prices", {"agent": "Агент А", "ptype": "Фориш", "items": [{"id": prods[0]["id"], "price": 12345}]}, headers={"X-Jarvis-Key": "testkey"})[0] == 200)
    st, d = req("/api/products?agent=" + urllib.request.quote("Агент А"), user=70)
    check("narx agent narx turidan chiqadi", st == 200 and d["ptype"] == "Фориш" and next(p for p in d["items"] if p["id"] == prods[0]["id"])["price"] == 12345)
    body = {"agent": "Агент А", "client_name": "25 dukon", "items": [{"id": prods[0]["id"], "qty": 2}], "photos": [], "req_id": "r1"}
    st, d = req("/api/returns", body, user=70)
    check("vozvrat yaratildi (narx agent narx turidan)", st == 200 and d["ret"]["total"] == 12345 * 2 and d["ret"]["status"] == "pending", d)
    rid = d["ret"]["id"]
    st, d2 = req("/api/returns", body, user=70)
    check("qayta yuborilsa ikkinchisi ochilmaydi", d2.get("duplicate") and d2["ret"]["id"] == rid)
    check("agent vozvrat kirita olmaydi", req("/api/returns", body, user=50)[0] == 403)
    st, d = req("/jarvis/returns?status=pending", headers={"X-Jarvis-Key": "testkey"})
    check("Jarvis tasdiq kutayotganini ko'radi", st == 200 and d["items"][0]["id"] == rid and d["items"][0]["client_typed"] == "25 dukon")
    st, d = req("/jarvis/clients?agent=" + urllib.request.quote("Агент А") + "&q=25", headers={"X-Jarvis-Key": "testkey"})
    check("Jarvis agent bazasidan mijoz qidiradi", st == 200 and d["items"] and d["items"][0]["id"] == c1)
    st, d = req(f"/jarvis/returns/{rid}/approve", {"by": "Murod"}, headers={"X-Jarvis-Key": "testkey"})
    check("topik belgilanmasa tasdiqlanmaydi", st == 400 and "topig" in d.get("error", ""))
    c.execute("INSERT OR REPLACE INTO kv(k,v) VALUES('ret_chat','-100123'),('ret_topic','55')"); c.commit()
    st, d = req(f"/jarvis/returns/{rid}/approve", {"by": "Murod"}, headers={"X-Jarvis-Key": "testkey"})
    check("bazaga bog'lanmagan mijoz so'raladi", st == 400 and d.get("code") == "noclient")
    st, d = req(f"/jarvis/returns/{rid}", {"client_id": c1, "items": [{"id": prods[0]["id"], "qty": 3, "price": 10000}]}, headers={"X-Jarvis-Key": "testkey"})
    check("admin mijoz va mahsulotni o'zgartiradi", st == 200 and d["ret"]["client_name"] == "25-ДУКОН" and d["ret"]["total"] == 30000 and d["ret"]["ext_id"] == "d0_1", d)
    st, d = req(f"/jarvis/returns/{rid}/approve", {"by": "Murod"}, headers={"X-Jarvis-Key": "testkey"})
    check("vozvrat tasdiqlandi", st == 200 and d["ret"]["status"] == "approved", d)
    st, b = req(f"/jarvis/return_invoice/{rid}.jpg", headers={"X-Jarvis-Key": "testkey"})
    check("vozvrat nakladnoyi yasaladi", st == 200 and b[:2] == b"\xff\xd8")
    open(os.path.join(os.path.dirname(DB), "vozvrat_test.jpg"), "wb").write(b)
    st, d = req("/api/notes", user=70)
    check("skladchiga 'tasdiqlandi' xabari", any("tasdiqlandi" in n["title"] for n in d["items"]))
    st, d = req("/api/returns", user=50)
    check("agent o'z mijozining vozvratini ko'radi", st == 200 and [r["id"] for r in d["items"]] == [rid])
    check("tasdiqlangani o'zgarmaydi", req(f"/jarvis/returns/{rid}", {"items": []}, headers={"X-Jarvis-Key": "testkey"})[0] == 400)

    print("Otkaz zakas:")
    ob = {"client_name": "25-dukon", "order_no": "1254", "photos": [], "req_id": "o1"}
    check("rasmsiz otkaz rad etiladi", req("/api/otkaz", ob, user=70)[0] == 400)
    check("zakas raqamisiz rad etiladi", req("/api/otkaz", {**ob, "order_no": "", "photos": [photo]}, user=70)[0] == 400)
    ob["photos"] = [photo, photo]
    st, d = req("/api/otkaz", ob, user=70)
    check("otkaz saqlandi (2 rasm)", st == 200 and len(d["otkaz"]["photos"]) == 2 and d["otkaz"]["order_no"] == "1254", d)
    oid2 = d["otkaz"]["id"]; opid = d["otkaz"]["photos"][0]
    check("otkaz qayta yuborilsa ikkinchisi ochilmaydi", req("/api/otkaz", ob, user=70)[1].get("duplicate"))
    check("agent otkaz kirita olmaydi", req("/api/otkaz", ob, user=50)[0] == 403)
    st, d = req("/jarvis/otkaz", headers={"X-Jarvis-Key": "testkey"})
    check("Jarvis otkazni ko'radi", st == 200 and d["items"][0]["id"] == oid2 and d["new"] == 1)
    st, b = req(f"/jarvis/photo/{opid}.jpg", headers={"X-Jarvis-Key": "testkey"})
    check("otkaz rasmi ochiladi", st == 200 and b[:2] == b"\xff\xd8")
    req(f"/jarvis/otkaz/{oid2}/seen", {}, headers={"X-Jarvis-Key": "testkey"})
    check("'ko'rildi' belgisi", req("/jarvis/otkaz", headers={"X-Jarvis-Key": "testkey"})[1]["new"] == 0)

    print("Himoya:")
    st, d = req("/api/orders", None, user=50, method="POST")
    check("buzuq so'rov serverni qulatmaydi", st in (400, 500) and isinstance(d, dict))
    check("server hali ishlayapti", req("/health")[0] == 200)
finally:
    srv.terminate()
    try:
        srv.wait(timeout=5)
    except Exception:
        srv.kill()
print(f"\nNatija: {ok} ✅ / {fail} ❌")
sys.exit(1 if fail else 0)
