"""Ma'lumotlarni (mijozlar, zakaslar, ruxsatlar, birlik sozlamalari...) deploydan keyin yo'qolmasligi uchun
SQLite bazasining nusxasini Postgres (DATABASE_URL) ga saqlaydi va server yangidan turganda tiklaydi."""
import asyncio
import logging
import os
import sqlite3
import tempfile
import zlib
from pathlib import Path

log = logging.getLogger("persist")
TABLE = "oz_backup"
_state = {"changes": -1, "slot": 0, "ok": None, "ts": "", "size": 0, "error": ""}

DDL = f"CREATE TABLE IF NOT EXISTS {TABLE}(slot INT PRIMARY KEY, data BYTEA, ts TIMESTAMPTZ DEFAULT now(), size INT)"


async def _conn(url):
    import asyncpg
    return await asyncpg.connect(url, statement_cache_size=0, timeout=20)


def restore(url: str, path: str) -> str:
    """Server yuklanishidan OLDIN chaqiriladi. Mahalliy baza yo'q bo'lsagina tiklaydi."""
    if not url or os.path.exists(path):
        return "local" if os.path.exists(path) else "none"

    async def go():
        c = await _conn(url)
        try:
            await c.execute(DDL)
            row = await c.fetchrow(f"SELECT data FROM {TABLE} WHERE data IS NOT NULL ORDER BY ts DESC LIMIT 1")
            return row["data"] if row else None
        finally:
            await c.close()
    try:
        data = asyncio.run(go())
        if data:
            Path(path).parent.mkdir(parents=True, exist_ok=True)
            Path(path).write_bytes(zlib.decompress(bytes(data)))
            log.info("baza Postgres nusxasidan tiklandi (%s bayt)", os.path.getsize(path))
            return "restored"
    except Exception as e:
        log.warning("tiklash xato: %s", e)
        _state["error"] = str(e)[:200]
    return "none"


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
    if not force and db.total_changes == _state["changes"]:
        return False
    try:
        # bo'sh bazani yaxshi nusxa ustiga yozib yubormaslik
        n = db.execute("SELECT (SELECT COUNT(*) FROM clients)+(SELECT COUNT(*) FROM orders)+(SELECT COUNT(*) FROM access)").fetchone()[0]
        if n == 0:
            return False
        changes = db.total_changes
        blob = _snapshot(db)
        c = await _conn(url)
        try:
            await c.execute(DDL)
            _state["slot"] = 1 - _state["slot"]          # 2 ta slot navbat bilan: bittasi doim butun qoladi
            await c.execute(f"INSERT INTO {TABLE}(slot,data,ts,size) VALUES($1,$2,now(),$3) "
                            f"ON CONFLICT(slot) DO UPDATE SET data=$2, ts=now(), size=$3", _state["slot"], blob, len(blob))
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
