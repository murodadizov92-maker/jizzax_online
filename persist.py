"""Ma'lumotlarni (mijozlar, zakaslar, ruxsatlar, birlik sozlamalari...) deploydan keyin yo'qolmasligi uchun
SQLite bazasining nusxasini Postgres (DATABASE_URL) ga saqlaydi va server yangidan turganda tiklaydi."""
import asyncio
import logging
import os
import sqlite3
import tempfile
import time
import datetime as _dt
import zlib
from pathlib import Path

log = logging.getLogger("persist")
TABLE = "oz_backup"
_state = {"changes": -1, "slot": 0, "ok": None, "ts": "", "size": 0, "error": "", "boot": "", "best_n": 0, "hold": False}

DDL = f"CREATE TABLE IF NOT EXISTS {TABLE}(slot INT PRIMARY KEY, data BYTEA, ts TIMESTAMPTZ DEFAULT now(), size INT)"


async def _conn(url):
    import asyncpg
    return await asyncpg.connect(url, statement_cache_size=0, timeout=20)


async def _latest(url):
    c = await _conn(url)
    try:
        await c.execute(DDL)
        row = await c.fetchrow(f"SELECT data FROM {TABLE} WHERE data IS NOT NULL AND slot < 100 ORDER BY ts DESC LIMIT 1")
        return row["data"] if row else None
    finally:
        await c.close()


def restore(url: str, path: str) -> str:
    """Server yuklanishidan OLDIN chaqiriladi. Mahalliy baza yo'q bo'lsagina tiklaydi.
    Postgres javob bermasa (uxlab qolgan bo'lsa) bir necha marta urinadi; baribir bo'lmasa — "failed":
    shunda zaxira YOZILMAYDI (bo'sh baza yaxshi nusxa ustiga tushmasin), keyinroq qayta tiklashga uriniladi."""
    if not url or os.path.exists(path):
        _state["boot"] = "local" if os.path.exists(path) else "none"
        return _state["boot"]
    for i, wait in enumerate((0, 3, 8, 15, 25)):
        time.sleep(wait)
        try:
            data = asyncio.run(_latest(url))
            if data:
                Path(path).parent.mkdir(parents=True, exist_ok=True)
                Path(path).write_bytes(zlib.decompress(bytes(data)))
                log.info("baza Postgres nusxasidan tiklandi (%s bayt)", os.path.getsize(path))
                _state["boot"] = "restored"
            else:
                _state["boot"] = "empty"                  # Postgres'da nusxa yo'q — haqiqatan yangi baza
            return _state["boot"]
        except Exception as e:
            log.warning("tiklash xato (%d-urinish): %s", i + 1, e)
            _state["error"] = str(e)[:200]
    _state["boot"] = "failed"
    return "failed"


def _restore_live(db, data: bytes):
    """Ishlab turgan bazani Postgres nusxasi bilan almashtiradi (tiklash boot paytida o'xshamagan bo'lsa)."""
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    try:
        Path(tmp.name).write_bytes(zlib.decompress(bytes(data)))
        src = sqlite3.connect(tmp.name)
        src.backup(db)
        src.close()
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


def _snapshot(db) -> bytes:
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    try:
        dst = sqlite3.connect(tmp.name)
        db.backup(dst)
        dst.close()
        return zlib.compress(Path(tmp.name).read_bytes(), 6)
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


async def backup(url: str, db, force=False):
    if not url:
        return False
    if _state["boot"] == "failed":                    # boot'da tiklanmagan: avval Postgres'dagi nusxani olishga urinamiz
        try:
            data = await _latest(url)
        except Exception as e:
            _state.update(ok=False, error="Postgres'ga ulanib bo'lmadi, zaxira to'xtatildi: " + str(e)[:150])
            return False
        if data:
            _restore_live(db, data)
            log.warning("baza kechikib Postgres nusxasidan tiklandi")
            _state["boot"] = "restored-late"
            _state["changes"] = db.total_changes
            return False
        _state["boot"] = "empty"
    if not force and db.total_changes == _state["changes"]:
        return False
    try:
        # bo'sh bazani yaxshi nusxa ustiga yozib yubormaslik
        n = db.execute("SELECT (SELECT COUNT(*) FROM clients)+(SELECT COUNT(*) FROM orders)+(SELECT COUNT(*) FROM access)").fetchone()[0]
        if n == 0:
            return False
        if _state.get("hold"):                        # admin tiklashni tanlaguncha nusxalar ustiga yozilmaydi
            return False
        best = _state.get("best_n") or 0
        if best > 50 and n < best * 0.5:              # ma'lumot birdan yarmidan ko'proq kamaydi — yaxshi nusxani buzmaymiz
            _state.update(ok=False, hold=True, error="Baza birdan kamayib ketdi (%d → %d). Zaxira to'xtatildi — Admin'da nusxadan tiklang." % (best, n))
            log.error(_state["error"])
            return False
        _state["best_n"] = max(best, n)
        changes = db.total_changes
        blob = _snapshot(db)
        c = await _conn(url)
        try:
            await c.execute(DDL)
            _state["slot"] = 1 - _state["slot"]          # 2 ta slot navbat bilan: bittasi doim butun qoladi
            await c.execute(f"INSERT INTO {TABLE}(slot,data,ts,size) VALUES($1,$2,now(),$3) "
                            f"ON CONFLICT(slot) DO UPDATE SET data=$2, ts=now(), size=$3", _state["slot"], blob, len(blob))
            day = 100 + _dt.date.today().toordinal() % 7       # + 7 kunlik nusxa (slot 100..106): har kunning oxirgi holati saqlanadi
            await c.execute(f"INSERT INTO {TABLE}(slot,data,ts,size) VALUES($1,$2,now(),$3) "
                            f"ON CONFLICT(slot) DO UPDATE SET data=$2, ts=now(), size=$3", day, blob, len(blob))
        finally:
            await c.close()
        _state.update(changes=changes, ok=True, size=len(blob), error="")
        return True
    except Exception as e:
        _state.update(ok=False, error=str(e)[:200])
        log.warning("zaxira xato: %s", e)
        return False


async def loop(url: str, db, every=20):
    await asyncio.sleep(8)
    while True:
        await backup(url, db)
        await asyncio.sleep(every)


def status():
    return dict(_state)


def _counts(blob: bytes) -> dict:
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    try:
        Path(tmp.name).write_bytes(zlib.decompress(bytes(blob)))
        c = sqlite3.connect(tmp.name)
        out = {}
        for t in ("clients", "orders", "returns", "otkaz", "access", "kv"):
            try:
                out[t] = c.execute("SELECT COUNT(*) FROM %s" % t).fetchone()[0]
            except Exception:
                out[t] = None
        c.close()
        return out
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


async def list_slots(url):
    c = await _conn(url)
    try:
        await c.execute(DDL)
        rows = await c.fetch(f"SELECT slot, ts, size, data FROM {TABLE} WHERE data IS NOT NULL ORDER BY ts DESC")
    finally:
        await c.close()
    out = []
    for r in rows:
        try:
            cnt = _counts(r["data"])
        except Exception as e:
            cnt = {"xato": str(e)[:80]}
        out.append({"slot": r["slot"], "ts": r["ts"].astimezone(_dt.timezone(_dt.timedelta(hours=5))).strftime("%Y-%m-%d %H:%M"),
                    "size": r["size"], **cnt})
    return out


async def restore_slot(url, db, slot: int):
    c = await _conn(url)
    try:
        row = await c.fetchrow(f"SELECT data FROM {TABLE} WHERE slot=$1", int(slot))
    finally:
        await c.close()
    if not row or not row["data"]:
        raise RuntimeError("Bu nusxa topilmadi")
    _restore_live(db, row["data"])
    n = db.execute("SELECT (SELECT COUNT(*) FROM clients)+(SELECT COUNT(*) FROM orders)+(SELECT COUNT(*) FROM access)").fetchone()[0]
    _state.update(hold=False, best_n=n, changes=-1, ok=None, error="", boot="restored-manual")
    await backup(url, db, force=True)                 # tiklangan holat darhol asosiy nusxaga yoziladi
    return n
