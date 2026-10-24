# -*- coding: utf-8 -*-
"""估值引擎适配：直接 import 引擎（不再经子进程/独立端口）。

引擎本身是同步 urllib 实现并自带「串行锁 + 10 分钟缓存」，这里用线程池执行，
避免阻塞事件循环；缓存与限流语义与线上 v3.0.2 完全一致。
"""
from __future__ import annotations

import sys
from functools import lru_cache
from typing import Any

from starlette.concurrency import run_in_threadpool

from ..settings import ENGINE_DIR

# api/server.py 内部会把自己需要的 src 加进 sys.path
_API_DIR = ENGINE_DIR / "api"
if str(_API_DIR) not in sys.path:
    sys.path.insert(0, str(_API_DIR))

import server as engine_api  # noqa: E402


@lru_cache(maxsize=1)
def engine_version() -> str:
    src = ENGINE_DIR / "src"
    if str(src) not in sys.path:
        sys.path.insert(0, str(src))
    try:
        import stock_value_estimator as pkg  # noqa: PLC0415

        return getattr(pkg, "__version__", "unknown")
    except Exception:  # noqa: BLE001
        return "unknown"


async def search(q: str) -> list[dict[str, Any]]:
    return await run_in_threadpool(engine_api._search, q)


async def valuate(code: str, *, debubble: bool = False, cycle: bool = False) -> dict[str, Any]:
    return await run_in_threadpool(
        lambda: engine_api._valuate(code, debubble=debubble, cycle=cycle)
    )


def cached_count() -> int:
    try:
        return len(engine_api._CACHE)
    except Exception:  # noqa: BLE001
        return 0


def warmup() -> None:
    """预热：把最慢的导入（pipeline/依赖树）放到启动阶段完成。"""
    try:
        engine_version()
        import stock_value_estimator.pipeline  # noqa: F401,PLC0415
    except Exception:  # noqa: BLE001  预热失败不影响启动，首个请求会再试
        pass
