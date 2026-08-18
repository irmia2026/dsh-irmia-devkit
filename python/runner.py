#!/usr/bin/env python3
"""
runner — JS ↔ Python 桥接入口。

DSH 插件(JS/Cordis)通过 `python3 runner.py <tool> '<json-args>'` 调用保留的
DevKit 工具函数,工具函数原样来自 Irmia DevKit v2.6.4(tools/ 目录,零改造)。
runner 负责:
  1. 初始化配置单例(config.set_config,默认备份目录等);
  2. 按工具名 dispatch 到对应模块函数(等价原 _registry.py 的注册映射);
  3. 空字符串参数清洗为 None(等价原 make_tool 的 clean 步骤);
  4. 结果与异常统一 JSON 序列化到 stdout。
"""

from __future__ import annotations

import json
import os
import sys

# 使本目录下的 tools 包可导入(无论从何处调用)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tools import config as _config  # noqa: E402
from tools import safe_edit  # noqa: E402
from tools import multi_edit  # noqa: E402
from tools import safe_read  # noqa: E402
from tools import http_get  # noqa: E402
from tools import file_remove  # noqa: E402
from tools import db_query  # noqa: E402
from tools import symbol_rename  # noqa: E402
from tools import lint_runner  # noqa: E402
from tools import test_runner  # noqa: E402
from tools.codegraph import CodeGraph  # noqa: E402


# ── codegraph 工具包装(等价原 _registry.py 的 _code_* 薄包装) ──

def _code_index(project_dir: str = ".", incremental: bool = False) -> dict:
    from pathlib import Path
    root = Path(project_dir).resolve()
    db_path = str(root / ".codegraph" / "codegraph.db")
    cg = CodeGraph(db_path)
    try:
        return cg.index(str(root), incremental)
    finally:
        cg.close()


def _code_explore(query: str, project_dir: str = ".") -> dict:
    from pathlib import Path
    root = Path(project_dir).resolve()
    db_path = str(root / ".codegraph" / "codegraph.db")
    cg = CodeGraph(db_path)
    try:
        return cg.explore(query, str(root))
    finally:
        cg.close()


def _code_diff_impact(filepaths: list, max_depth: int = 3, project_dir: str = ".") -> dict:
    from pathlib import Path
    root = Path(project_dir).resolve()
    db_path = str(root / ".codegraph" / "codegraph.db")
    cg = CodeGraph(db_path)
    try:
        return cg.code_diff_impact(filepaths, max_depth)
    finally:
        cg.close()


def _code_pack(target: str, depth: int = 2, mode: str = "both", project_dir: str = ".") -> dict:
    from pathlib import Path
    root = Path(project_dir).resolve()
    db_path = str(root / ".codegraph" / "codegraph.db")
    cg = CodeGraph(db_path)
    try:
        return cg.code_pack(target, depth, mode)
    finally:
        cg.close()


def _code_status(project_dir: str = ".") -> dict:
    from pathlib import Path
    root = Path(project_dir).resolve()
    db_path = str(root / ".codegraph" / "codegraph.db")
    cg = CodeGraph(db_path)
    try:
        return cg.code_status()
    finally:
        cg.close()


# ── 工具注册映射(等价原 _registry.py 的 _ALL_TOOLS 键) ──

DISPATCH = {
    # 安全编辑链
    "safe_edit": safe_edit.edit,
    "safe_rollback": safe_edit.rollback,
    "safe_backups": safe_edit.list_backups,
    "multi_edit": multi_edit.run,
    # 文件系统
    "safe_read": safe_read.read,
    # 网络
    "http_get": http_get.get,
    "http_post": http_get.post,
    # 代码理解
    "code_index": _code_index,
    "code_explore": _code_explore,
    "code_diff_impact": _code_diff_impact,
    "code_pack": _code_pack,
    "code_status": _code_status,
    # 文件删除/移动
    "file_remove": file_remove.remove,
    "file_move": file_remove.move,
    # 可选
    "db_query": db_query.query,
    "symbol_rename": symbol_rename.run,
    "lint_runner": lint_runner.run,
    "test_runner": test_runner.run,
}


def _clean_args(args: dict) -> dict:
    """等价原 make_tool 的 clean 步骤:空字符串 → None。"""
    return {k: (v if v != "" else None) for k, v in args.items()}


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "usage: runner.py <tool> [json-args]"}, ensure_ascii=False))
        return 2
    tool = sys.argv[1]
    fn = DISPATCH.get(tool)
    if fn is None:
        print(json.dumps({"ok": False, "error": f"unknown tool: {tool}"}, ensure_ascii=False))
        return 2
    try:
        raw_args = json.loads(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] else {}
    except json.JSONDecodeError as e:
        print(json.dumps({"ok": False, "error": f"invalid json args: {e}"}, ensure_ascii=False))
        return 2
    if not isinstance(raw_args, dict):
        print(json.dumps({"ok": False, "error": "args must be a JSON object"}, ensure_ascii=False))
        return 2
    try:
        result = fn(**_clean_args(raw_args))
    except Exception as e:  # 工具实现内未捕获的异常,统一兜底
        result = {"ok": False, "error": f"{tool} 执行失败: {e}"}
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    _config.set_config({})
    sys.exit(main())
