# -*- coding: utf-8 -*-
"""金融智库 v2.0.0 · FastAPI 应用入口。

一个进程同时提供：
  1. 静态站点（dist/，HashRouter，未知路径回落 index.html）
  2. 业务 API（/api/rpc/*，前端不再直连云数据库）
  3. 估值 API（/api/search、/api/valuate，内嵌 Python 引擎）

启动：
    python -m app                 # 读 PORT 环境变量（默认 4173）
    uvicorn app.main:app --port 4173
"""
from __future__ import annotations

import asyncio
import mimetypes
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from . import APP_VERSION, db
from .cache import cache
from .registry import METHODS
from .services import valuation_svc  # noqa: F401  注册/初始化引擎适配
from .services import freshness as fresh_svc
from .services import reads as _reads  # noqa: F401
from .services import writes as _writes  # noqa: F401
from .settings import DIST_DIR, require_db_key

mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("font/woff2", ".woff2")


class CacheHeaderMiddleware(BaseHTTPMiddleware):
    """静态资源缓存策略：带 hash 的 assets 长缓存；index.html 每次校验；API 不缓存。"""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        elif path.startswith("/assets/"):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        elif path in ("/", "/index.html"):
            response.headers["Cache-Control"] = "no-cache"
        return response


@asynccontextmanager
async def lifespan(_: FastAPI):
    # 启动即校验服务端凭据已注入：缺失直接失败，避免「起来了但读不到数据」
    require_db_key()
    # 预热放在后台线程，不阻塞启动（冷启动时首个估值请求会明显更快）
    loop = asyncio.get_running_loop()
    loop.run_in_executor(None, valuation_svc.warmup)
    yield
    await db.close()


app = FastAPI(title="金融智库 API", version=APP_VERSION, lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(CacheHeaderMiddleware)


# ---------------- 健康检查 ----------------

@app.get("/healthz")
async def healthz():
    return {"ok": True, "service": "fin-thinktank", "version": APP_VERSION}


@app.get("/api/health")
async def api_health():
    return {
        "ok": True,
        "version": APP_VERSION,
        "engine": valuation_svc.engine_version(),
        "db": await db.ping(),
        "cache": cache.stats(),
        "valuation_cache": valuation_svc.cached_count(),
    }


@app.get("/api/health/data")
async def api_health_data():
    """数据新鲜度：定时任务是否真的把数据写进来了（结论见 freshness.py 的判定口径）。"""
    return await fresh_svc.snapshot()


@app.get("/api/meta/methods")
async def api_methods():
    return {"ok": True, "count": len(METHODS), "methods": sorted(METHODS)}


# ---------------- 估值 API（路径与旧版保持一致，前端无需改动） ----------------

@app.get("/api/search")
async def api_search(q: str = "", count: int = 8):
    keyword = q.strip()
    if not keyword:
        return {"ok": True, "items": []}
    try:
        items = await valuation_svc.search(keyword)
        return {"ok": True, "items": items}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"搜索失败：{e}") from e


@app.get("/api/valuate")
async def api_valuate(code: str = "", debubble: str = "", cycle: str = ""):
    code = code.strip()
    if not (len(code) == 6 and code.isdigit()):
        raise HTTPException(status_code=400, detail="请输入 6 位股票代码")
    try:
        row = await valuation_svc.valuate(
            code,
            debubble=debubble.strip() in ("1", "true", "yes"),
            cycle=cycle.strip() in ("1", "true", "yes"),
        )
        return {
            "ok": True,
            "row": row,
            "elapsed": row.get("_elapsed"),
            "cached": row.get("_cached", False),
        }
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        hint = ""
        if "quote" in msg.lower() or "NoneType" in msg:
            hint = "（该代码可能不存在、已退市，或数据源暂无覆盖）"
        raise HTTPException(status_code=422, detail=f"计算失败：{msg}{hint}") from e


# ---------------- 业务 API（统一方法分发） ----------------

@app.post("/api/rpc/{name}")
async def api_rpc(name: str, payload: dict[str, Any] | None = None):
    handler = METHODS.get(name)
    if handler is None:
        raise HTTPException(status_code=404, detail=f"未知方法：{name}")
    data = await handler(payload or {})
    return {"ok": True, "data": data}


# ---------------- 静态站点（放最后，避免吃掉 /api） ----------------

def _safe_file(path: str) -> Path | None:
    rel = path.lstrip("/")
    candidate = (DIST_DIR / rel).resolve()
    try:
        candidate.relative_to(DIST_DIR.resolve())
    except ValueError:
        return None
    return candidate if candidate.is_file() else None


@app.get("/{full_path:path}")
async def spa(full_path: str):
    target = _safe_file(full_path)
    if target:
        return FileResponse(target)
    index = DIST_DIR / "index.html"
    if index.is_file():
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
    return JSONResponse(
        status_code=503,
        content={"ok": False, "error": "站点未构建：dist/index.html 不存在，请先执行 npm run build"},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"ok": False, "error": exc.detail})
