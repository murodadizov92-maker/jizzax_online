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
