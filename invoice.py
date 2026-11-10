"""Zakas uchun накладная (JPG) — guruhga zakas xabari bilan birga yuboriladi."""
import io
from datetime import datetime, timedelta
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

F = Path(__file__).parent / "fonts"
W = 1240  # A4 kengligi ~150 dpi


def _f(sz, bold=False):
    return ImageFont.truetype(str(F / ("DejaVuSansCondensed-Bold.ttf" if bold else "DejaVuSansCondensed.ttf")), sz)


def _money(v):
    return f"{int(round(v)):,}".replace(",", " ")


def _dd(d):
    try:
        dt = datetime.strptime(d, "%Y-%m-%d")
    except (TypeError, ValueError):
        return "—"
    today = (datetime.utcnow() + timedelta(hours=5)).date()
    tag = {0: "сегодня", 1: "завтра", 2: "послезавтра"}.get((dt.date() - today).days, "")
    return dt.strftime("%d.%m.%Y") + (f" ({tag})" if tag else "")


def _qty(v):
    return f"{v:g}".replace(".", ",")


def _wrap(d, text, font, maxw):
    words, lines, cur = str(text).split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=font) <= maxw:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines or [""]


def make_invoice(o: dict) -> bytes:
    items = o["items"]
    cols = [("№", 70, "c"), ("Наименование", 430, "l"), ("Кол-во", 150, "r"), ("Цена", 195, "r"), ("Сумма", 265, "r")]
    x0 = (W - sum(c[1] for c in cols)) // 2
    fb, fn, fs = _f(27, True), _f(26), _f(22)
    tmp = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    rows = []
    for i, it in enumerate(items, 1):
        nm = _wrap(tmp, it["name"], fn, cols[1][1] - 20)
        h = max(52, 14 + 34 * len(nm))
        rows.append((i, it, nm, h))
    H = 420 + sum(r[3] for r in rows) + 330
    im = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(im)
    y = 50
    now = datetime.now()
    d.text((x0, y), f"НАКЛАДНАЯ № {o['id']}", font=_f(46, True), fill="black")
    d.text((W - x0, y + 8), now.strftime("%d.%m.%Y  %H:%M"), font=_f(30), fill="black", anchor="ra")
    y += 85
    d.text((x0, y), "Клиент:", font=fb, fill="black")
    d.text((x0 + 140, y), o["client_name"], font=_f(31, True), fill="black")
    y += 48
    if o.get("region"):
        d.text((x0, y), "Агент:", font=fb, fill="black")
        d.text((x0 + 140, y), str(o["region"]), font=fn, fill="black")
        y += 44
    d.text((x0, y), "Доставка:", font=fb, fill="black")
    d.text((x0 + 140, y), _dd(o.get("ddate")), font=_f(31, True), fill="#b00020")
    y += 46
    d.text((x0, y), "Принял:", font=fb, fill="black")
    d.text((x0 + 140, y), str(o["user_name"]), font=fn, fill="black")
    y += 56
    # sarlavha
    d.rectangle([x0, y, x0 + sum(c[1] for c in cols), y + 54], fill="#e9e9e9", outline="black", width=2)
    x = x0
    for name, w, al in cols:
        d.text((x + w / 2, y + 27), name, font=fb, fill="black", anchor="mm")
        d.line([x, y, x, y + 54], fill="black", width=2)
        x += w
    y += 54
    for i, it, nm, h in rows:
        x = x0
        unit = it.get("unit", "")
        vals = [str(i), None, f"{_qty(it['qty'])} {unit}".strip(), _money(it["price"]), _money(it["price"] * it["qty"])]
        d.rectangle([x0, y, x0 + sum(c[1] for c in cols), y + h], outline="black", width=1)
        for k, (name, w, al) in enumerate(cols):
            d.line([x, y, x, y + h], fill="black", width=1)
            if k == 1:
                for j, ln in enumerate(nm):
                    d.text((x + 10, y + 8 + 34 * j), ln, font=fn, fill="black")
            elif al == "c":
                d.text((x + w / 2, y + h / 2), vals[k], font=fn, fill="black", anchor="mm")
            else:
                d.text((x + w - 12, y + h / 2), vals[k], font=fn if k != 4 else fb, fill="black", anchor="rm")
            x += w
        d.line([x, y, x, y + h], fill="black", width=1)
        y += h
    # jami
    tw = sum(c[1] for c in cols)
    d.rectangle([x0, y, x0 + tw, y + 62], outline="black", width=2, fill="#f4f4f4")
    d.text((x0 + tw - 290, y + 31), "ИТОГО:", font=_f(32, True), fill="black", anchor="rm")
    d.text((x0 + tw - 12, y + 31), _money(o["total"]), font=_f(34, True), fill="black", anchor="rm")
    y += 62
    d.text((x0, y + 12), f"Всего наименований: {len(items)}", font=fs, fill="#333")
    y += 60
    if o.get("comment"):
        for ln in _wrap(d, "Комментарий: " + o["comment"], fn, tw):
            d.text((x0, y), ln, font=fn, fill="black")
            y += 34
        y += 10
    short = [i for i in items if i.get("short")]
    if short:
        d.text((x0, y), "⚠ Нет в наличии / не хватает:", font=fb, fill="#b00020")
        y += 40
        for i in short:
            t = f"• {i['name']}: нужно {_qty(i['qty'])}, на складе {_qty(i.get('stock') or 0)}" + (f" — {i['note']}" if i.get("note") else "")
            for ln in _wrap(d, t, fs, tw):
                d.text((x0 + 10, y), ln, font=fs, fill="#b00020")
                y += 30
        y += 14
    y += 50
    for lab in ("Отпустил: ____________________", "Получил: ____________________"):
        d.text((x0 if "Отп" in lab else x0 + 600, y), lab, font=fn, fill="black")
    y += 60
    im = im.crop((0, 0, W, y))
    out = io.BytesIO()
    im.save(out, "JPEG", quality=92)
    return out.getvalue()
