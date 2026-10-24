# -*- coding: utf-8 -*-
"""`python -m app` 入口：读平台注入的 PORT 环境变量（沙箱 startCmd 不经 shell）。"""
from __future__ import annotations

import os

import uvicorn


def main() -> None:
    port = int(os.environ.get("PORT", "4173"))
    host = os.environ.get("HOST", "0.0.0.0")
    uvicorn.run("app.main:app", host=host, port=port, log_level=os.environ.get("LOG_LEVEL", "info"))


if __name__ == "__main__":
    main()
