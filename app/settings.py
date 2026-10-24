# -*- coding: utf-8 -*-
"""运行配置：全部可用环境变量覆盖。

公开仓库不含任何真实凭据——`FT_DB_URL` / `FT_DB_KEY` / `FT_DB_ORIGIN` 三个值
在部署时必须由环境变量注入（见 `requirements.txt` 同级的 `.env.example`）；
沿用占位默认值会在启动时报错退出，避免「跑起来了但读不到数据」的假象。
"""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# 前端构建产物目录（FastAPI 托管静态站点）
DIST_DIR = Path(os.environ.get("FT_DIST", str(ROOT / "dist")))

# 云数据库 PostgREST 网关
# 占位值：部署时用 FT_DB_URL 覆盖为「你的应用域名 + /.cloud/database/rest」
DB_URL = os.environ.get(
    "FT_DB_URL",
    "https://your-app.example.com/.cloud/database/rest",
).rstrip("/")

# 服务端凭据：只允许后端持有，绝不下发到浏览器。
# 公开仓库不含真实值；部署时用 FT_DB_KEY 注入（控制台下发，绑定域名与额度）。
DB_KEY = os.environ.get("FT_DB_KEY", "")

# 请求来源头：PostgREST 网关会校验，需与 DB_URL 的域名一致
DB_ORIGIN = os.environ.get("FT_DB_ORIGIN", "https://your-app.example.com")


def require_db_key() -> str:
    """启动时校验服务端凭据已注入，避免读到空 key 后报出难以定位的 401。

    在 `app.main` 的 lifespan 里调用一次即可；缺失时直接抛错退出。
    """
    if not DB_KEY or DB_KEY.startswith("wbpk_your") or "your_server_key" in DB_KEY:
        raise RuntimeError(
            "缺少云数据库服务端凭据：请设置环境变量 FT_DB_KEY"
            "（控制台下发，勿提交真实值到仓库）。参见 .env.example。"
        )
    return DB_KEY

# 估值引擎目录
ENGINE_DIR = Path(os.environ.get("FT_ENGINE_DIR", str(ROOT / "stock_value_estimator-main")))

# HTTP 连接池
HTTP_TIMEOUT = float(os.environ.get("FT_HTTP_TIMEOUT", "30"))
HTTP_MAX_CONN = int(os.environ.get("FT_HTTP_MAX_CONN", "24"))
HTTP_MAX_KEEPALIVE = int(os.environ.get("FT_HTTP_MAX_KEEPALIVE", "12"))

# 公共数据缓存（秒）：PE/温度/指数等一天只变一次，缓存足够长也不会过期太久
CACHE_TTL_PUBLIC = int(os.environ.get("FT_CACHE_TTL_PUBLIC", "180"))
CACHE_TTL_SESSION = int(os.environ.get("FT_CACHE_TTL_SESSION", "300"))
CACHE_MAX_ITEMS = int(os.environ.get("FT_CACHE_MAX_ITEMS", "512"))

# 单页行数：与云库 1000 行硬上限对齐（超出会静默截断）
DB_PAGE_SIZE = 1000
