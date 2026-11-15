"""
ONLINE ZAKAS → Jarvis bo'limi (kompyuterda ishlaydi, D:\\jarvis ichiga qo'ying).

Nima qiladi:
  * Online zakas (Render) serveridan oxirgi kunlardagi zakaslarni oladi
  * Tanlangan zakaslarning накладная rasmlarini A4 varaqqa ketma-ket taxlaydi (sig'sa bir varaqqa 2-3 ta)
  * Canon MF3010 ga to'g'ridan-to'g'ri chop etadi va zakasga ✓ (chop etildi) belgisini qo'yadi
  * Nusxasi PDF bo'lib D:\\jarvis\\online_zakas_print\\ ga saqlanadi

Ishga tushirish:   python online_zakas_jarvis.py
Telefondan ochish:  http://<kompyuter-IP>:8791     (Jarvis'dagi plitkani shu manzilga yo'naltiring)

Kerakli kutubxonalar:  pip install pillow pywin32
"""
import io
import json
import os
import sys
import threading
import urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from PIL import Image

# ------------------------------------------------------------------ SOZLAMALAR
SERVER = os.getenv("ONLINE_ZAKAS_URL", "https://jizzax-online.onrender.com")
KEY = os.getenv("JARVIS_KEY", "mc-a67dba5c1e49")            # Render'dagi JARVIS_KEY bilan bir xil bo'lsin (yoki shu yerga yozing)
PRINTER = os.getenv("JARVIS_PRINTER", "Canon MF3010")   # printer nomining bir qismi yetadi
PORT = int(os.getenv("ONLINE_ZAKAS_PORT", "8791"))
OUT = Path(__file__).parent / "online_zakas_print"
A4 = (1240, 1754)        # 150 dpi da A4
MARGIN, GAP = 30, 20
PER_PAGE = 3             # bir A4 varaqqa nechta накладная
# ------------------------------------------------------------------


def api(path, data=None):
    req = urllib.request.Request(SERVER.rstrip("/") + path, headers={"X-Jarvis-Key": KEY, "User-Agent": "jarvis"})
    if data is not None:
        req.data = json.dumps(data).encode()
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=90) as r:      # Render bepul servisi uyg'onishi 30-60 s olishi mumkin
        return r.read()


def build_pages(ids):
    """Накладная rasmlarini A4 varaqlarga ketma-ket joylaydi."""
    w = A4[0] - 2 * MARGIN
    h_max = A4[1] - 2 * MARGIN
    slot = (h_max - GAP * (PER_PAGE - 1)) / PER_PAGE      # bitta накладная uchun joy
    pages, page, y = [], None, MARGIN
    for oid in ids:
        im = Image.open(io.BytesIO(api(f"/jarvis/invoice/{oid}.jpg"))).convert("RGB")
        k = min(w / im.width, slot / im.height)        # 3 tasi sig'adigan qilib kichraytiramiz
        k = max(k, 0.55 * w / im.width)               # mahsuloti ko'p накладная juda mayda bo'lib ketmasin (ko'proq joy oladi)
        k = min(k, h_max / im.height)
        im = im.resize((int(im.width * k), int(im.height * k)), Image.LANCZOS)
        if page is None or y + im.height > A4[1] - MARGIN:
            page = Image.new("RGB", A4, "white")
            pages.append(page)
            y = MARGIN
        page.paste(im, (MARGIN + (w - im.width) // 2, y))
        y += im.height + GAP
        if y < A4[1] - MARGIN:      # qirqish chizig'i (keyingi zakas bilan orasida)
            for x in range(MARGIN, A4[0] - MARGIN, 24):
                page.paste((170, 170, 170), (x, y - GAP // 2, x + 12, y - GAP // 2 + 2))
    return pages


def find_printer():
    import win32print
    names = [p[2] for p in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)]
    for n in names:
        if PRINTER.lower() in n.lower():
            return n
    return win32print.GetDefaultPrinter()


def print_pages(pages, title):
    """Windows GDI orqali to'g'ridan-to'g'ri printerga (Excel/PDF dastur ochilmaydi)."""
    import win32ui
    import win32con
    from PIL import ImageWin
    name = find_printer()
    dc = win32ui.CreateDC()
    dc.CreatePrinterDC(name)
    pw, ph = dc.GetDeviceCaps(win32con.HORZRES), dc.GetDeviceCaps(win32con.VERTRES)
    dc.StartDoc(title)
    for pg in pages:
        dc.StartPage()
        k = min(pw / pg.width, ph / pg.height)
        tw, th = int(pg.width * k), int(pg.height * k)
        ImageWin.Dib(pg).draw(dc.GetHandleOutput(), ((pw - tw) // 2, 0, (pw - tw) // 2 + tw, th))
        dc.EndPage()
    dc.EndDoc()
    dc.DeleteDC()
    return name


def do_print(ids):
    pages = build_pages(ids)
    OUT.mkdir(exist_ok=True)
    pdf = OUT / f"online_zakas_{datetime.now():%Y%m%d_%H%M%S}.pdf"
    pages[0].save(pdf, save_all=True, append_images=pages[1:], resolution=150)
    printer = None
    try:
        printer = print_pages(pages, "Online zakas " + ",".join(map(str, ids)))
    except Exception as e:                       # pywin32 bo'lmasa — PDF'ni standart dastur bilan chop etish
        try:
            os.startfile(str(pdf), "print")
            printer = "standart (PDF dastur orqali)"
        except Exception:
            raise RuntimeError(f"Chop etib bo'lmadi: {e}. PDF saqlandi: {pdf}")
    api("/jarvis/printed", {"ids": ids})
    return {"ok": True, "pages": len(pages), "printer": printer, "pdf": str(pdf)}


PAGE = r"""<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Online zakas — chop etish</title><style>
:root{--bg:#120d1f;--card:#1e1633;--line:#33284f;--txt:#f3eefe;--mut:#a99bc9;--acc:#8b5cf6;--ok:#22c55e}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font:16px/1.4 system-ui,Segoe UI,Roboto,sans-serif;padding:14px 14px 110px}
h1{font-size:21px;margin:4px 0 12px}.bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.chip{padding:9px 14px;border-radius:999px;background:var(--card);border:1px solid var(--line);color:var(--txt);font-weight:700;cursor:pointer}
.chip.on{background:var(--acc);border-color:var(--acc)}
.o{display:flex;gap:12px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px;margin-bottom:8px;cursor:pointer}
.o.sel{border-color:var(--acc);box-shadow:0 0 0 2px var(--acc) inset}.o.done{opacity:.55}
.cb{width:28px;height:28px;border-radius:8px;border:2px solid var(--mut);flex:none;display:grid;place-items:center;font-weight:900}
.o.sel .cb{background:var(--acc);border-color:var(--acc)}.o.sel .cb:after{content:"✓"}
.in{flex:1;min-width:0}.nm{font-weight:800}.mut{color:var(--mut);font-size:14px}
.pr{font-weight:900;white-space:nowrap;text-align:right}.tag{display:inline-block;background:var(--ok);color:#06210f;border-radius:999px;padding:1px 9px;font-size:12px;font-weight:900;margin-left:6px}
#go{position:fixed;left:14px;right:14px;bottom:16px;padding:17px;border:0;border-radius:18px;background:linear-gradient(135deg,#a78bfa,#7c3aed);color:#fff;font-size:18px;font-weight:900;box-shadow:0 12px 30px rgba(124,58,237,.5)}
#go:disabled{opacity:.45}#msg{position:fixed;left:50%;top:14px;transform:translateX(-50%);background:#000c;padding:10px 18px;border-radius:14px;display:none;z-index:9;max-width:92vw}
</style></head><body>
<h1>🖨️ Online zakaslar</h1>
<div class="bar"><div class="chip on" data-f="new">Chop etilmagan</div><div class="chip" data-f="all">Hammasi</div><div class="chip" id="selall">☑ Hammasini tanlash</div><div class="chip" id="rf">🔄</div></div>
<div id="list"><div class="mut">Yuklanmoqda… (server uyg'onishi 30-60 s olishi mumkin)</div></div>
<button id="go" disabled>🖨️ Chop etish</button><div id="msg"></div>
<script>
let items=[],sel=new Set(),f='new';
const $=s=>document.querySelector(s),msg=t=>{const m=$('#msg');m.textContent=t;m.style.display='block';clearTimeout(msg.t);msg.t=setTimeout(()=>m.style.display='none',3500)};
const money=n=>Math.round(n).toLocaleString('ru').replace(/,/g,' ');
const dd=d=>d?d.split('-').reverse().join('.'):'';
function draw(){const L=items.filter(o=>f==='all'||!o.printed_at);
 $('#list').innerHTML=L.length?L.map(o=>`<div class="o ${sel.has(o.id)?'sel':''} ${o.printed_at?'done':''}" data-id="${o.id}"><div class="cb"></div>
 <div class="in"><div class="nm">#${o.id} · ${o.client_name}${o.printed_at?'<span class="tag">✓ chop etildi</span>':''}</div>
 <div class="mut">🧑‍💼 ${o.agent||o.user_name} · 🚚 ${dd(o.ddate)} · ${o.n} xil</div></div><div class="pr">${money(o.total)}</div></div>`).join(''):'<div class="mut">Chop etilmagan zakas yo\'q ✅</div>';
 document.querySelectorAll('.o').forEach(e=>e.onclick=()=>{const id=+e.dataset.id;sel.has(id)?sel.delete(id):sel.add(id);draw()});
 $('#go').disabled=!sel.size;$('#go').textContent=sel.size?`🖨️ Chop etish (${sel.size} ta)`:'🖨️ Chop etish';}
async function load(){try{const r=await fetch('/orders');const j=await r.json();if(j.error)throw new Error(j.error);items=j.items;
 sel=new Set([...sel].filter(id=>items.some(o=>o.id===id)));draw()}catch(e){$('#list').innerHTML='<div class="mut">❌ '+e.message+'</div>'}}
document.querySelectorAll('[data-f]').forEach(c=>c.onclick=()=>{f=c.dataset.f;document.querySelectorAll('[data-f]').forEach(x=>x.classList.toggle('on',x===c));draw()});
$('#selall').onclick=()=>{const L=items.filter(o=>f==='all'||!o.printed_at);const all=L.every(o=>sel.has(o.id));L.forEach(o=>all?sel.delete(o.id):sel.add(o.id));draw()};
$('#rf').onclick=load;
$('#go').onclick=async()=>{const ids=items.filter(o=>sel.has(o.id)).map(o=>o.id).sort((a,b)=>a-b);$('#go').disabled=true;$('#go').textContent='⏳ Chop etilmoqda…';
 try{const r=await fetch('/print',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});const j=await r.json();if(!j.ok)throw new Error(j.error);
 msg(`✅ ${ids.length} ta zakas · ${j.pages} varaq → ${j.printer}`);sel.clear();await load()}catch(e){msg('❌ '+e.message);draw()}};
load();setInterval(load,60000);
</script></body></html>"""


class H(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False).encode()
        elif isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        try:
            if self.path.startswith("/orders"):
                return self._send(200, api("/jarvis/orders?days=7"))
            return self._send(200, PAGE, "text/html; charset=utf-8")
        except Exception as e:
            return self._send(200, {"error": str(e)})

    def do_POST(self):
        if self.path.startswith("/print"):
            try:
                n = int(self.headers.get("Content-Length", 0))
                ids = [int(x) for x in json.loads(self.rfile.read(n) or b"{}").get("ids", [])]
                if not ids:
                    return self._send(200, {"ok": False, "error": "Zakas tanlanmagan"})
                return self._send(200, do_print(ids))
            except Exception as e:
                return self._send(200, {"ok": False, "error": str(e)})
        self._send(404, {"error": "not found"})

    def log_message(self, *a):
        pass


def start(background=False):
    """Jarvis ichidan chaqirish uchun: import online_zakas_jarvis; online_zakas_jarvis.start(True)"""
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), H)
    if background:
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        return srv
    print(f"Online zakas chop etish: http://localhost:{PORT}  (server: {SERVER})")
    srv.serve_forever()


if __name__ == "__main__":
    if not KEY:
        print("DIQQAT: JARVIS_KEY yozilmagan (fayl boshidagi KEY = ... ga yoki muhit o'zgaruvchisiga yozing)")
    start()
