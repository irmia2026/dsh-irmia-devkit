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

参数传输:JSON args 可经 argv[2] 传入(向后兼容、便于手工调试),也可经
stdin 传入(JS 桥默认方式——大体积 safe_edit/multi_edit 的 JSON 会超过
Windows ~32K 命令行上限)。stdin 按 UTF-8 解码,与 JS 侧固定 UTF-8 编解码一致。
"""

from __future__ import annotations

import json
import os
import sys


def _force_utf8_stdio() -> None:
    """强制 stdout/stderr 使用 UTF-8,与 JS 侧的固定 UTF-8 解码保持一致。

    Windows 中文区域设置下 Python stdio 默认 GBK;工具结果一旦含 GBK 不支持的
    字符(如 code_index 状态输出里的 ✅),print 会直接抛 UnicodeEncodeError,
    整个工具调用失败。在 tools 包导入之前执行,连导入期的告警输出也覆盖。
    """
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8", errors="replace")


_force_utf8_stdio()

# 使本目录下的 tools 包可导入(无论从何处调用)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tools import config as _config  # noqa: E402
from tools import safe_edit  # noqa: E402
from tools import multi_edit  # noqa: E402
from tools import http_get  # noqa: E402
from tools import db_query  # noqa: E402
from tools.codegraph import CodeGraph  # noqa: E402


# ── codegraph 工具包装(等价原 _registry.py 的 _code_* 薄包装) ──

def _code_index(project_dir: str = ".", incremental: bool = False, status: bool = False) -> dict:
    """code_index 合并工具:status=true 时输出索引体检(原 code_status),否则建/更新索引。"""
    from pathlib import Path
    root = Path(project_dir).resolve()
    db_path = str(root / ".codegraph" / "codegraph.db")
    cg = CodeGraph(db_path)
    try:
        if status:
            return cg.code_status()
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


# ── safe_rollback / safe_backups 合并路由(list 动作) ──

def _safe_rollback(filepath: str, backup_name: str | None = None, list: bool = False) -> dict:
    """safe_rollback 合并工具:list=true 时列出备份(原 safe_backups),否则执行回滚(原 safe_rollback)。"""
    if list:
        return safe_edit.list_backups(filepath)
    return safe_edit.rollback(filepath, backup_name)


# ── 工具注册映射(等价原 _registry.py 的 _ALL_TOOLS 键) ──

DISPATCH = {
    # 安全编辑链
    "safe_edit": safe_edit.edit,
    "safe_rollback": _safe_rollback,
    "multi_edit": multi_edit.run,
    # 网络
    "http_get": http_get.get,
    "http_post": http_get.post,
    # 代码理解
    "code_index": _code_index,
    "code_explore": _code_explore,
    "code_diff_impact": _code_diff_impact,
    # 可选
    "db_query": db_query.query,
}


def _clean_args(args: dict) -> dict:
    """等价原 make_tool 的 clean 步骤:空字符串 → None。"""
    return {k: (v if v != "" else None) for k, v in args.items()}


def _read_args() -> tuple[dict | None, str | None]:
    """读取 JSON 参数对象:优先 argv[2](向后兼容),否则读 stdin(UTF-8)。

    stdin 途径规避 Windows ~32K 命令行长度上限;显式按 UTF-8 解码,
    不受系统区域设置(如 GBK)影响。返回 (args, error),二者恰其一为 None。
    """
    if len(sys.argv) > 2 and sys.argv[2]:
        raw = sys.argv[2]
    elif sys.stdin.isatty():
        # 交互式终端无输入来源,按空参数处理(避免挂起等待输入)
        return {}, None
    else:
        raw = sys.stdin.buffer.read().decode("utf-8")
    if not raw.strip():
        return {}, None
    try:
        args = json.loads(raw)
    except json.JSONDecodeError as e:
        return None, f"invalid json args: {e}"
    if not isinstance(args, dict):
        return None, "args must be a JSON object"
    return args, None


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "usage: runner.py <tool> [json-args]"}, ensure_ascii=False))
        return 2
    tool = sys.argv[1]
    fn = DISPATCH.get(tool)
    if fn is None:
        print(json.dumps({"ok": False, "error": f"unknown tool: {tool}"}, ensure_ascii=False))
        return 2
    raw_args, error = _read_args()
    if error is not None:
        print(json.dumps({"ok": False, "error": error}, ensure_ascii=False))
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
