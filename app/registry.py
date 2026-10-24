# -*- coding: utf-8 -*-
"""方法注册表：前端 `/api/rpc/{method}` 的唯一入口清单。

为什么用「显式注册表」而不是通用 REST/ORM 暴露：
  - 每个方法都是一段可审查的业务代码，不存在「前端传表名就能查任意表」的面；
  - 前端服务层可以保持 1:1 的函数签名，页面代码零改动。
"""
from __future__ import annotations

from typing import Any, Awaitable, Callable

Handler = Callable[[dict[str, Any]], Awaitable[Any]]
METHODS: dict[str, Handler] = {}


def method(name: str) -> Callable[[Handler], Handler]:
    def deco(fn: Handler) -> Handler:
        if name in METHODS:
            raise RuntimeError(f"重复注册方法：{name}")
        METHODS[name] = fn
        return fn

    return deco
