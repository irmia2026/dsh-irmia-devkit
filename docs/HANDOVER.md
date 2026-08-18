# 交接文件：Irmia DevKit 能力缺口 → 创造模式工作区

> 本工作区是为“创造模式（Cordis）”会话准备的。
> 进入创造模式后，请先阅读本文件，再决定如何把 Irmia DevKit 的能力补进 DeepSeek Harness。

## 1. 背景

- 用户希望评估 Irmia DevKit（`irmia2026/irmia_devkit_open`）与当前 DeepSeek Harness 各 Agent 模式之间的能力差距。
- 已克隆仓库到：
  - `/media/rinzi/hdd-sda5/DshBlock1/irmia_devkit_open`
- 远程地址：
  - `https://github.com/irmia2026/irmia_devkit_open.git`
- 本机 AstrBot 已安装同款插件：
  - `~/data/plugins/astrbot_plugin_irmia_devkit`
- 当前工作区（极简模式会话）已完成的讨论：
  - 本机环境、内存状况、Harness 源码位置、Agent 模式区别、网络/GitHub 可达性、DevKit 仓库 clone、能力缺口分析。

## 2. Irmia DevKit 是什么

AstrBot 插件，提供 **65 个开发工具 + 1 个 Skill**，面向 LLM Agent。

主要能力分组：

| 分组 | 代表性工具 |
|---|---|
| 安全编辑链 | safe_edit, safe_write, safe_rollback, safe_backups, multi_edit, syntax_check, lint_runner, test_runner |
| Git & GitHub | git_status, git_diff, git_commit, git_push, gh_pr, gh_issue, gh_release, gh_repo |
| 文件系统 | safe_read, es_search, rg_search, dir_tree, dir_list, file_zip, file_unzip, file_remove, config_diff |
| 系统信息 | port_check, proc_list, sys_snapshot, tool_stats |
| 执行与审计 | shell_exec, op_log |
| 网络 | http_get, http_post, http_download |
| 文本处理 | html_extract, json_query, text_filter, csv_parse, csv_gen, md_strip, log_parse |
| 编码/时间 | encode_decode, time |
| 扩展 | semver_compare, uuid_gen, project_init, git_changelog, db_query, dep_scan |
| 代码理解 | code_index, code_explore, code_diff_impact, code_pack, code_status, symbol_rename |

Skill：`dev-workflow`
- 强调：先 git_status / safe_read，再 safe_edit，改完 syntax_check / lint_runner，提交前 code_diff_impact。
- 完整文档在 `irmia_devkit_open/skills/dev-workflow/SKILL.md`。

## 3. Harness 模式现状

| 模式 | 原生能力 |
|---|---|
| 极简模式 | 仅 bash + str_replace_editor |
| 标准模式 | bash、文件 read/write/edit、glob/grep、后台任务、Skills、Goal、计划模式、子代理、工作流、web_search、TODO、ask_user |
| PTC 模式 | 标准模式 + TypeScript Code Mode SDK（run_code 组合多步） |
| 创造模式 | 标准模式 + tool-cordis（可读/改/挂载运行时插件、创作 Agent preset） |

## 4. 已识别能力缺口（按优先级）

### 高优先级
1. 安全编辑链
   - Harness 无 safe_edit 的备份 → 替换 → 语法检查 → 自动回滚。
   - 无 multi_edit 多文件原子编辑。
2. 结构化 Git/GitHub 操作
   - Harness 无原生 git_status/git_commit/gh_pr 等结构化工具。
   - 只能通过 bash 调 git/gh，无统一返回、无安全护栏。
3. 代码语义理解
   - Harness 无 code_index/code_explore/code_diff_impact/code_pack/symbol_rename。
   - 大型仓库查找符号、调用链、影响范围主要靠 grep 近似。
4. 内置 Web Fetch
   - 标准/PTC/创造模式默认 `web_search` 开启，但 `web_fetch` 被 `fetch: false` 关闭。
   - DevKit 有 http_get/http_post/http_download + SSRF 防护。

### 中优先级
5. 文件系统增强工具（safe_read 编码检测/hex/行范围、dir_tree、file_zip、file_hash、config_diff）
6. 文本/数据解析工具（json_query、csv_parse、log_parse、html_extract、md_strip）
7. 系统运维类（port_check、proc_list、sys_snapshot、disk_info、shell_exec 白名单、op_log 审计）
8. DB 查询/依赖分析（db_query 只读 SQLite、dep_scan）

### 低优先级
9. 小工具（encode_decode、time、semver_compare、uuid_gen、project_init）

## 5. 创造模式下一步建议

进入创造模式后，建议优先做：

1. 阅读相关源码：
   - Harness 基础配置：`/opt/Dsh-white/resources/dsh/node_modules/@deepseek-ai/dsh-base/cordis.patch.yml`
   - Web 配置：`/opt/Dsh-white/resources/dsh/node_modules/@deepseek-ai/dsh-web-app/cordis.patch.yml`
   - 标准模式预设：`/opt/Dsh-white/resources/dsh/config/agent-presets/standard/agent.cordis.yml`
   - 创造模式预设：`/opt/Dsh-white/resources/dsh/config/agent-presets/cordis/agent.cordis.yml`
   - DevKit 源码：`/media/rinzi/hdd-sda5/DshBlock1/irmia_devkit_open`

2. 设计如何移植/桥接：
   - 方式 A：把 DevKit 的 Python 工具作为外部命令/服务，让 Harness bash 调用并解析 JSON。
   - 方式 B：用创造模式的 Cordis 工具集在 Harness 内创建新的 Agent preset / 插件，注册原生工具。
   - 方式 C：先做一个最小闭环：safe_edit + multi_edit + code_explore + web_fetch。

3. 注意安全边界：
   - 创造模式的 `cordis_mount` 会执行模型编写的 JS，等同 shell 访问。
   - 不要直接改 `/opt/Dsh-white/resources/dsh/config/agent-presets/` 下的官方预设。
   - 自定义预设应放在 `$DSH_HOME/.agent-presets/<id>/`，或先复制官方预设再改。
   - 如需启用 web_fetch，可考虑复制标准/创造模式预设后把 `fetch: false` 改为 `fetch: true`。

## 6. 交付物期望

用户希望最终得到一份“能力缺口报告”，以及后续在创造模式中实际补齐这些能力。

本文件由极简模式会话留下，作为创造模式会话的起始上下文。
