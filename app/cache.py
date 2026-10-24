# -*- coding: utf-8 -*-
"""进程内 TTL 缓存。

为什么放在进程内而不是 Redis：部署沙箱不提供数据库/缓存服务，且使用规模只有
十几人——单进程缓存足够，且没有额外运维成本。多 worker 部署时每个 worker 各有一份，
属于可接受的副本（数据只有一天一次的变化频率）。
"""
from __future__ import annotations

import threading
import time
from typing import Any, Awaitable, Callable

from .settings import CACHE_MAX_ITEMS


class TTLCache:
    def __init__(self, max_items: int = CACHE_MAX_ITEMS) -> None:
        self._data: dict[str, tuple[float, Any]] = {}
        self._lock = threading.Lock()
        self._max = max_items
        self.hits = 0
        self.misses = 0

    def get(self, key: str) -> Any | None:
        with self._lock:
            item = self._data.get(key)
            if not item:
                self.misses += 1
                return None
            expire_at, value = item
            if expire_at < time.time():
                self._data.pop(key, None)
                self.misses += 1
                return None
            self.hits += 1
            return value

    def set(self, key: str, value: Any, ttl: int) -> None:
        with self._lock:
            if len(self._data) >= self._max:
                # 简易淘汰：清掉最早到期的一批，避免无界增长
                for k in sorted(self._data, key=lambda k: self._data[k][0])[: max(1, self._max // 10)]:
                    self._data.pop(k, None)
            self._data[key] = (time.time() + ttl, value)

    def clear(self, prefix: str | None = None) -> None:
        with self._lock:
            if prefix is None:
                self._data.clear()
                return
            for k in [k for k in self._data if k.startswith(prefix)]:
                self._data.pop(k, None)

    def stats(self) -> dict[str, int]:
        with self._lock:
            return {"items": len(self._data), "hits": self.hits, "misses": self.misses}


cache = TTLCache()


async def cached(key: str, ttl: int, loader: Callable[[], Awaitable[Any]]) -> Any:
    """读缓存；未命中则执行 loader 并写入。"""
    hit = cache.get(key)
    if hit is not None:
        return hit
    value = await loader()
    if value is not None:
        cache.set(key, value, ttl)
    return value
