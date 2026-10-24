# -*- coding: utf-8 -*-
"""服务层聚合：import 即注册全部 /api/rpc 方法。"""
from . import auth_svc, reads, writes  # noqa: F401
