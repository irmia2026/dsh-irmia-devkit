# DevKit → DSH 移植蓝图(修订版):原样移植精选清单

> 决策背景:DevKit 是 2025-05 的老设计。用户决定:**精简掉大部分工具,只保留有用且好用的;保留的工具原样移植,不做任何改造**(防呆机制、参数、命名、返回协议一律保留)。
> 移植粒度:**以模块(.py 文件)为单位**。选中一个模块 = 原样搬入 + 注册该模块的所有工具 + 带上其依赖的共享支撑模块。

---

## 一、保留清单(原样移植,不改造)

### 核心 4 模块(真实缺口,Harness 没有)

| 模块 | 注册工具数 | 工具 | 保留理由(有用且好用) |
|---|---|---|---|
| `safe_edit.py` | 2 | safe_edit / safe_rollback(含 safe_backups 的 list 动作) | Harness 无备份-回滚-语法门禁能力 |
| `multi_edit.py` | 1 | multi_edit | 跨文件原子批量编辑,Harness 无 |
| `http_get.py` + `_http_utils.py` | 2 | http_get / http_post | SSRF 防护的取网能力,Harness 无(web_fetch 未启用) |
| `codegraph.py` | 5 | code_index / code_explore / code_diff_impact / code_pack / code_status | 大仓库符号语义查询,Harness 只有 grep |

> 注 1:`safe_read.py` 已从保留清单移除——原生 read 已支持 offset/limit 翻页与续读 footer,safe_read 的增量(编码检测/hex/skeleton)均可由一条 bash 命令覆盖,保留会造成模型在 read/safe_read 间选择的负担。
> 注 2:`file_remove.py` 已从保留清单移除——file_move 是 `mv` 一条命令可替代;file_remove 的路径沙箱价值被平台层(安全编辑链路径校验保留,`_FORBIDDEN_PREFIXES` 黑名单迁入 `_file_utils.py`)覆盖,删除操作交还 bash `rm`。

### 可选 1 模块(要不要由你定)

| 模块 | 注册工具数 | 工具 | 说明 |
|---|---|---|---|
| `db_query.py` | 1 | db_query | 只读 SQLite,防手滑写坏本地库 |

> 注:`symbol_rename.py` / `lint_runner.py` / `test_runner.py` 已从保留清单移除——均属"bash 一条命令可替代 + 无安全属性"类别(symbol_rename 可 grep+multi_edit 组合;lint_runner 即 `ruff check`;test_runner 即 `pytest`),且 test_runner 连带的 `shell_exec.py` 一并清理。

---

## 二、支撑模块(保留工具的共同依赖,必须随迁)

| 模块 | 作用 |
|---|---|
| `_file_utils.py` | 编码检测 / 路径沙箱 / 原子写 / 备份命名与清理 / 匹配辅助 |
| `_helpers.py` | `_run_cmd` / `proposal_reply` / `unwrap` / `run_sync` |
| `_registry.py` | `make_tool` 工厂 / TOOL_GROUPS / _ALL_TOOLS 注册表 |
| `config.py` | 模块级配置单例(备份目录等) |
| `syntax_check.py` | safe_edit / multi_edit / safe_write 内部依赖的语法判定器 |
| `file_patch.py` | safe_edit 内部委托的精确替换(patch/preview) |
| `_auth.py` | 工具调用层鉴权守卫(可选——DSH 有平台级审批,可跳过) |

> 注意:保留模块的**内部依赖会带来连带工具**。例如 safe_edit 依赖 syntax_check 与 file_patch,原样搬入时这两个模块也必须随迁(它们的注册工具会顺带存在,但只是"随迁",不作为主动保留项;若你要求严格,可将注册名剔除,仅保留内部函数)。

---

## 三、砍掉清单(48 个工具,不再赘述改造理由)

按三大类:Harness 已有等价(git 全族/gh 全族/rg_search/es_search/safe_read/dir_*/shell_exec/op_log/text_filter/diff_strings)、一条 bash 命令可替代(file_hash/file_zip/disk_info/port_check/proc_list/sys_snapshot/encode/time/uuid/semver/json_query/csv_*/html_extract/log_parse/md_strip/http_download/file_move)、低价值或冗余(project_init/git_changelog/dep_scan/config_diff/tool_stats/lint_runner/test_runner/encode_decode)。

---

## 四、移植方式

| 项 | 方案 |
|---|---|
| 形态 | 每个模块作为独立 cordis 插件(host 侧)注册原生工具;或合并为一个"devkit"插件,内部按模块组织 |
| 依赖 | 零第三方(原样);codegraph 的 tree-sitter 为可选依赖,缺省降级只支持 Python,符合原设计 |
| 备份目录 | 沿用原默认 `~/.irmia/backups`(或改 `~/.dsh/.irmia/backups`,待定) |
| 鉴权 | `_auth.py` 的 admin/sender_id 守卫在 DSH 场景意义不大,可跳过(工具仍可正常调用) |

---

## 五、工作量估算(原样移植,含随迁依赖)

| 批次 | 内容 | 复杂度 |
|---|---|---|
| 批 1 | safe_edit 家族 + multi_edit(+随迁 _file_utils/_helpers/syntax_check/file_patch) | 中(依赖链长,但纯 Python 搬运) |
| 批 2 | http_get/http_post(+_http_utils) | 低 |
| 批 3 | codegraph 五件套 | 高(1522 行,SQLite schema + FTS5 + BFS) |
| 批 4 | (file_remove/file_move 已砍,无需移植) | — |
| 批 5(可选) | db_query | 低 |

> 建议顺序:批 1 → 批 2 → 批 4 → 批 3(codegraph 最重放后)。
