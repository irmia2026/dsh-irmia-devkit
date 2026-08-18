# Irmia DevKit 与 DeepSeek Harness 工具详细设计对比

> 分析日期:2025-08-18
> 对比对象:Irmia DevKit v2.6.4(`irmia2026/irmia_devkit_open`,AstrBot 插件,65 工具 + 1 Skill) vs DeepSeek Harness 创造模式(cordis)会话工具集
> 方法:DevKit 侧逐模块源码精读(8 个核心模块全文 + 全组并行子代理分析);Harness 侧按本会话实际挂载工具规格
> 相关文件:本工作区 `HANDOVER.md`(交接背景)

---

## 0. 对比框架

| 维度 | 含义 |
|---|---|
| 设计哲学 | "护栏优先"(工具内置安全链) vs "裸操作优先"(沙箱在进程层,工具保持原子简单) |
| 接口形态 | 参数风格、返回协议、多匹配消歧手段 |
| 安全模型 | 路径 / 编码 / 大小 / 网络 / 命令 / 审计 各层防护 |
| 失败语义 | 失败时返回什么、是否自动修复、如何引导续作 |
| 自动化程度 | 工具内部替 LLM 做了多少决策、替 LLM 承担多少判断 |
| 覆盖面 | 单 agent 工作台(DevKit) vs 多 agent 编排平台(Harness) |

---

## 1. 双方工具集全景

### 1.1 Irmia DevKit(11 组、65 个注册工具)

| 分组 | 工具 |
|---|---|
| 安全编辑链(10) | safe_edit, safe_rollback, safe_backups, file_patch, file_preview, safe_write, syntax_check, lint_runner, test_runner, multi_edit |
| Git & GitHub(11) | git_status, git_diff, git_log, git_commit, git_branch, git_remote, git_push, gh_pr, gh_issue, gh_release, gh_repo |
| 文件系统(13) | es_search, rg_search, dir_tree, dir_list, file_diff, file_hash, file_zip, file_unzip, disk_info, file_remove, file_move, config_diff, safe_read |
| 系统信息(4) | port_check, proc_list, sys_snapshot, tool_stats |
| 执行与审计(2) | shell_exec, op_log |
| 网络(3) | http_get, http_post, http_download |
| 文本处理(8) | html_extract, json_query, text_filter, diff_strings, csv_parse, csv_gen, md_strip, log_parse |
| 编码/时间(2) | encode_decode, time |
| 扩展(6) | semver_compare, uuid_gen, project_init, git_changelog, db_query, dep_scan |
| 代码理解(6) | code_index, code_explore, code_diff_impact, code_pack, code_status, symbol_rename |

- 附带 1 个 Skill:`dev-workflow`(强制"先 git_status → safe_read → safe_edit → syntax_check → code_diff_impact"的安全工作流,含代码智能工具组决策树与反模式清单)。

### 1.2 DeepSeek Harness(创造模式会话,本会话实际可用)

| 类别 | 工具 |
|---|---|
| 执行 | bash(含后台任务 job_list/job_output/job_kill、超时、沙箱权限) |
| 文件系统 | read(行号分页)、write、edit(字面替换)、glob、grep、read_image |
| 检索 | web_search(web_fetch 未启用) |
| 编排 | subagent、subagent_fork、send_message、list_agents、interrupt_agent、workflow、ralph |
| 目标/计划 | create_goal/get_goal/update_goal、exit_plan_mode(计划模式)、todo_write |
| 交互 | ask_user_question、skill |
| 元能力(创造模式特有) | cordis_inspect_list/query/self、cordis_define、cordis_run、cordis_stop、cordis_undefine |
| 会话技能 | cordis-plugin-development、editing-cordis-compositions |

---

## 2. 逐组详细设计对比

## 2.1 安全编辑链:DevKit safe_edit 家族 ↔ Harness edit/write

### DevKit 侧详细设计

**safe_edit(核心,强制入口)**
- 执行流水线(顺序不可颠倒):前置闸门(路径沙箱 → 存在性 → 20MB 上限 → 磁盘剩余 ≥100MB)→ 编码探测读入 + CRLF 归一化 → 匹配消歧 → **备份**(`~/.irmia/backups/`,命名 `{文件名}.{父目录sha256[:8]}.{微秒时间戳}.bak`,copy2 保留元数据)→ 执行编辑 → 语法检查(仅代码后缀)→ **通过保留 / 失败自动回滚** → 惰性备份清理(每源文件保留 10 份、总量 500MB LRU)。
- 参数:`filepath/old/new/occurrence/replace_all/align_whitespace/mode/line/start_line/end_line`
- 三种编辑模式:`replace`(默认,old→new 精确替换)/ `insert_at_line`(行号插入,0=文件开头)/ `delete_lines`(闭区间删行)——后两者无需复制文本,直接行号寻址。
- **四级匹配降级管线**(防 LLM 复制粘贴出错):精确匹配(CRLF 归一)→ **行号前缀剥除**(safe_read 的 `  123│` 前缀自动剥除)→ **空白容错对齐**(对标 Aider `replace_part_with_missing_leading_whitespace`,缩进增量法保留嵌套 def/class 内部缩进)→ **最近行提示**(difflib ratio>0.5 返回最接近行)。
- **多匹配消歧**:`old_count>1` 且未指定 occurrence/replace_all → 返回全部匹配位置证据(前 20 条,line/col/preview)+ `occurrence=N` 选项,绝不猜测。
- **失败语义分级**:匹配失败→不动文件+最近行提示;语法失败→自动回滚+分类 hint(缩进/语法/eof)+ 可选修复参数;回滚失败→保留备份+引导 safe_rollback/file_diff;非代码后缀→跳过语法检查。
- 注册 3 个工具:safe_edit(edit)/ safe_rollback(rollback,回滚前先备份当前状态使回滚可撤销)/ safe_backups(list_backups)。

**multi_edit(跨文件原子编排)**
- 五阶段:`规划(纯内存,同文件 edits 链式匹配)` → `全量备份(每文件 .multi.bak)` → `临时文件语法检查(先备份后检查,防 TOCTOU)` → `原子提交(全部 mkstemp 同目录临时文件→chmod 保留权限→逐个 os.replace)` → `失败全体回滚(rolled_back_all 完整性标记 + rollback_errors 明细)`。
- 参数:`edits=[{file, old, new, replace_all?, occurrence?}]` 数组 + `syntax_check` 开关。
- 与 safe_edit 共享同一套匹配降级/消歧/备份规则(单一事实源)。

**safe_write(新建/整体覆盖)**:`overwrite=False` 时已存在文件不写(返回 evidence+选项);覆盖先备份(`.write.bak`)→ UTF-8 写入 → 语法检查失败回滚到覆盖前;新建文件语法失败保留+指引(无旧版可回滚)。

**file_patch(无保护精简版)**:无备份/无语法检查/无行号模式,定位非代码文件;含 file_preview(只算 diff 不落盘)。

**syntax_check(判定器)**:Python=`ast.parse`(无副作用,异常兜底 py_compile)、Nim=`nim check`、Go=`gofmt -e`、JS/TS=`node --check`;工具未装返回 `skipped` 不阻塞;错误带行/列 + 前后 2 行上下文(`→` 标记,与 safe_read 行号前缀同构)。

**lint_runner**:ruff → pylint → eslint 自动探测与回退链,JSON 输出解析 + 前 5 个 issue 附加代码上下文。
**test_runner**:pytest/go test/cargo test/jest 四框架统一封装,自动发现(go.mod/Cargo.toml/package.json 判断),`test_cmd` 覆盖时走 shell_exec 白名单校验;四套输出解析器统一为 `{ok, passed, failed, skipped, errors, duration_s, returncode, timeout}`。

### Harness 侧详细设计(我方)

**edit**
- 字面字符串替换:`old_string` 必须精确出现且**默认必须唯一**(多匹配报错,无 occurrence 消歧参数);`replace_all` 可全替换。
- 前置约束:fs-observation-policy 要求编辑前先 read(防止盲改);UTF-8 文本。
- **无备份、无语法检查、无自动回滚、无行号模式、无空白容错、无"未找到时最近行提示"**(仅报 old_string 不匹配)。
- 失败语义:唯一性/匹配失败 → 返回错误,由我(LLM)自行重新读取上下文再试。

**write**:整文件创建/覆盖;覆盖已有文件前要求先读;无备份无回滚无语法检查。

**bash(可补位的执行能力)**:可自由调用 git/sed/python/jq 等实现 DevKit 任何工具的功能,但每次全新 shell、无内置护栏、无结构化返回。

### 关键差异

| 维度 | DevKit safe_edit | Harness edit |
|---|---|---|
| 备份/回滚 | 自动备份,语法失败自动回滚,可撤销回滚 | 无 |
| 语法门禁 | 内置(6 语言),失败回滚 | 无 |
| 消歧 | occurrence + 匹配位置证据 | 仅"必须唯一",多匹配即报错 |
| 容错 | 行号前缀剥除 / 空白对齐 / 最近行提示 | 无 |
| 编辑模式 | replace/insert_at_line/delete_lines | 仅替换 |
| 原子性 | 原子写 + 磁盘/大小闸门 | 直接写(平台层原子性未承诺) |
| 多文件 | multi_edit 原子编排 + 全体回滚 | 无(需 bash 脚本自行实现) |
| 结果协议 | ok/proposal/options/evidence/next_call | 错误文案 |

> **本质差异**:DevKit 把"编辑事故的预防与自愈"做进工具本身(为易出错的 LLM 设计);Harness 的 edit 是原子简单操作,把判断(是否安全、改对了没)留给模型与进程级沙箱。Harness 的补偿机制在**层外**:bash 可调用 git 做快照、可跑 pytest 验证——但那是模型的责任,不是工具的内置承诺。

---

## 2.2 Git/GitHub:DevKit git_smart/gh_cli ↔ Harness bash git

### DevKit 侧详细设计

**git_smart(7 个注册工具,全部结构化返回)**
- `git_status`: `git status --porcelain` → `{clean, changes[:200], changed_count, changes_truncated}`。
- `git_diff`: 同时跑 `git diff [--staged] [-- file]` + `git diff --stat`,返回 `{diff, files_changed, added, removed, total_changes}`;>500 行截断并附 `diff_truncated/diff_total_lines`。
- `git_log`: `--oneline --decorate`,count 钳制 ≤30。
- `git_commit`: **全自动链**——内部强制先跑 status(干净即拒绝)→ message 非空 → `files` 参数拒绝绝对路径与 `..` → **>10 文件触发 proposal 拦截**(按 Code/Config/Other 分组,唯一确认点)→ 默认 `git add -A`(**含未跟踪文件**)→ commit(30s)→ 补查 hash;**绝不自动 push**。
- `git_branch/git_remote/git_push`:push 前预检 `remote/branch..HEAD` 有无未推送提交。
- 底座 `_run_cmd`:list 参数无 shell 注入、超时、错误统一映射(未安装/超时/非零退出)、`LC_ALL=C` 保证输出可解析。

**gh_cli(4 个复合工具:gh_pr/gh_issue/gh_release/gh_repo)**
- gh 定位优先级:`config.gh_path` → PATH → Windows 常见路径;无 REST API 兜底,失败降级为安装/配置引导。
- 正文一律走临时文件 `--body-file` 防命令行注入;JSON 解析失败降级 raw 原样返回。
- 覆盖 PR 增删查改、Issue 增删查、Release 创建/列表、Repo 查看/创建、CI run 列表/查看/日志、auth_status。

**git_changelog**:纯解析层,按 feat→fix→docs→…→other 固定分类,count 默认 30。

### Harness 侧详细设计(我方)

- **无结构化 git 工具**;git 一切操作靠 `bash` 直接调 CLI。
- bash 的形态:全新 shell、`workdir` 可指定、返回 stdout/stderr + exit code、可后台运行;当前会话 `danger-full-access` 无沙箱限制。
- 护栏来源:无(模型自己负责 `git status` 前置、审查 diff、写规范 message、`--` 分隔防选项注入等)。
- 结构化信息(clean 布尔、stat 统计、PR 列表)需要我自己解析文本输出。

### 关键差异

| 维度 | DevKit git_smart | Harness bash git |
|---|---|---|
| 结构化返回 | 统一 JSON(clean/stat/hash) | 原始文本,需模型解析 |
| 护栏 | 自动 status 前置、>10 文件拦截、路径校验、不自动 push | 无 |
| 自动化 | commit 全自动链(add -A + 查 hash) | 需模型逐条敲命令 |
| 确认点 | proposal 协议(LLM 选 options) | 无(模型自觉) |
| GitHub 操作 | gh_pr/gh_issue/gh_release 结构化工具 | 无(仅 bash gh) |

> **本质差异**:DevKit 把 git 工作流编码为"安全协议"(先查后改、大批量拦截、commit 自动链),Harness 把它留作模型的纪律。DevKit 的 git_commit 甚至自动 `add -A` 含未跟踪文件——这是主动替模型兜底的自动化设计。

---

## 2.3 代码智能:DevKit codegraph 家族 ↔ Harness grep/glob/read

### DevKit 侧详细设计

**code_index(建索引)**
- 解析器:Python 用标准库 `ast`;JS/TS/Go/Rust/Java/C/C++ 用 **tree-sitter**(可选依赖,缺失静默降级)。
- 存储:SQLite(WAL),`<project>/.codegraph/codegraph.db`;三表 `symbols/edges/meta` + **FTS5 全文索引**(name/file/signature)。
- 符号:全限定名(`mod.Cls.method`)、kind、签名、源码片段、可见性、is_async。
- 边 6 类:`calls`(调用)/ `triggers`(检测 register/add_tool/on_event 等触发方法,回调反连)/ `references`(属性访问)/ `overrides`(装饰器)/ `extends`(继承)/ `imports`(导入)。
- 增量:`meta['mtimes']` 只解析变更文件;FTS 重建一致性兜底(变更 ≥50% 全量重建)。
- 并行:`ThreadPoolExecutor(min(cpu//2, 8))`,SQLite 写单线程,批 50。
- 护栏:忽略目录(.git/node_modules/.venv…)、>1MB 文件跳过。

**code_explore(查询)**
- 意图路由:`从X到Y`→trace 路径;`调用链`→trace;`X在哪/谁调用`→符号搜索;自然语言→explore。
- **三级搜索**:`LIKE`(支持 `kind:` 过滤)→ **FTS5**(token 化:CamelCase/snake_case 拆分 + 中文 2-gram)→ 宽 LIKE;排序 public 优先→定义优先→被调多优先。
- 调用图:BFS 现算(edges 表),"谁调用它"= 反向边查询;"从X到Y的调用链"= BFS 深度 6→10 重试→partial 深度 8(断点 + "可能经回调/动态调用"提示);附 `blast_radius`(反向 BFS 爆炸半径)。
- 未找到:返回 candidates + 引导 rg_search;索引过期:stale_warning。

**code_diff_impact(影响范围)**:以**文件**为输入,文件内全部符号反向 BFS(max_depth=3),输出受影响符号/文件 + 深度;设计上结果可直接构造成 edits 喂给 multi_edit。

**code_pack(打包上下文)**:以符号为根双向 BFS 沿 calls 边展开,visited 防环,层 LIMIT 20、总行数 2000 上限,源码智能截断(≤30 行全给,否则 15 头+5 尾);"修 bug 要完整依赖链源码"的直达通道。

**code_status(索引体检)**:files_indexed/symbols_total/edges_total/last_index_at/db_size/fts5_ok/missing_grammars+install_hint。

**symbol_rename(保守重命名)**
- 依赖索引定位 + 冲突检测(新名已存在即拒绝);替换用 **tokenize 流式扫描**(仅 NAME token 替换,字符串/注释/关键字天然不碰),比 AST 重写保真,不做作用域消歧。
- 默认 `dry_run=true`;跨文件必须 `confirm_multi_file=true` 确认(proposal 协议);最终经 **multi_edit 原子提交**(语法全过才落盘,失败全回滚)。

**dep_scan(Python 依赖图)**:ast 解析 Import/ImportFrom,只保留**项目内**模块间依赖边(内聚性分析,不解析 requirements 等清单);DFS 环检测(去重);timeout 保护(partial 结果 + 提案)。

### Harness 侧详细设计(我方)

- 检索栈:`grep`(ripgrep 正则,250 条内联上限,include 过滤)+ `glob`(模式找文件,100 条上限)+ `read`(行号分页读)。
- 语义查询(符号定义/调用者/影响范围/依赖链)只能靠 grep 模式 + 我自己的阅读推理近似,无索引、无符号表、无调用图、无 FTS、无 BFS。
- 无 rename 工具(只能 edit 逐处替换,靠我自己判断作用域)。
- 无依赖图/环检测工具。

### 关键差异

| 维度 | DevKit codegraph 家族 | Harness grep/glob |
|---|---|---|
| 符号级理解 | AST/tree-sitter 索引 + FTS5 | 无(纯文本正则) |
| 调用图 | 6 类边 + BFS 路径/爆炸半径 | 无 |
| 影响范围 | code_diff_impact(文件→符号反向BFS) | 无(手工 grep 推断) |
| 上下文打包 | code_pack(依赖链源码) | 无(手工 read 多个文件) |
| 重命名 | token 级 + 冲突检测 + 原子提交 | 无 |
| 中文/驼峰检索 | FTS5 token 化(中文 2-gram) | 无(正则直搜) |
| 建索引成本 | 一次性 + 增量 | 零成本(无索引) |

> **本质差异**:DevKit 把"读代码"从文本层提升到**语义层**(符号图 + 全文检索 + BFS),为 LLM 提供"图优先,grep 兜底"的决策心智(其 dev-workflow Skill 明确:能用 code_explore 就不要 rg_search);Harness 停留在文本层,语义理解全靠模型推理——对大型仓库这是最大的单项差距,也正是交接文件标注的高优先级缺口之一。

---

## 2.4 文件系统与搜索:DevKit safe_read/rg_search/es_search 家族 ↔ Harness read/glob/grep

### DevKit 侧详细设计

**safe_read(重点)**
- 参数:`path` 必填;`start_line/end_line`(1-based 行范围)、`max_lines=200`、`head/tail`(前/后 N 行)、`mode=auto/text/binary/hex/skeleton`、`encoding=auto/utf-8/gbk/latin-1`、`line_numbers`(行号前缀)、`include_metadata`。
- **编码检测 6 级确定性策略**:BOM 前置匹配 → 零值分布分析(疑似 UTF-16/32 才尝试)→ 按序尝试 9 种编码(utf-8→gb18030→utf-16*→utf-32*)且通过文本特征验证(控制字符 <2%、可打印 ≥85%)→ 样本末尾截断重试 → chardet 兜底(置信度>0.7)→ latin-1 无损回退。
- **大小限制**:10MB 硬拒绝;每次返回 128KB 字节 + 200 行硬上限(整行边界 + 字符边界二分截断);100KB 触发自动截断提示。
- **分页体验**:返回 `header/footer/next_call`(下一分页参数),连续翻页零思考成本;大文件 tail 精确统计、head 用 8KB 样本线性外推行数估算。
- **hex 模式**:xxd 风格 `%08x: hex ASCII`,1KB/64 行上限;**skeleton 模式**:按扩展名正则提取 imports/classes/functions + 行号(512KB/5000 行上限)。
- 护栏:路径沙箱(`..` 段 + 系统目录黑名单 + **symlink 目标复检**)、二进制自动转 hex 预览不抛异常。

**rg_search(内容搜索)**
- 直接调 ripgrep 二进制:`--line-number --no-heading --color never`,`-m max_results+1`(**多读 1 条仅用于判定 truncated**),`--` 分隔防选项注入;30s 超时;返回码 0/1 均成功(1=无匹配)。
- 带 `context_lines`(钳制 [0,10])时解析 `file:line:content` 与 `file-line-content` 两种格式,上下文行缓冲进匹配项。
- **Python 兜底降级**:无 rg 时 os.walk(5000 文件/500k 步上限)、utf-8 errors=replace;**ReDoS 防护**:pattern >1000 字符拒绝、嵌套量词 `(a+)+` 拒绝、whole_word 用 `\b(?:…)\b` 包装。
- 返回 `{engine: rg|python, count, matches, truncated, files_searched}`。

**es_search(文件名搜索)**:Windows 走 Everything(`es.exe`,防 `/`/`-` 前缀选项劫持);POSIX 三层降级 locate → fd → Python os.walk(10000 文件);支持 Everything 语法(`*.py`/`size:>1mb`/`folder:`)、regex、类型/大小/扩展名过滤、8 种排序。

**dir_tree/dir_list**:递归目录浏览,深度限制、fnmatch 过滤、inode 环检测(symlink 循环防死循环)、每层 100 条/总 200 条截断、PermissionError 不中断。

**file_zip/file_unzip**:ZIP_DEFLATED;**解压 Zip-slip 防护**(成员 resolve 后必须落在目标目录内,否则整包拒绝);压缩侧 SymlinkGuard;无解压炸弹上限(已识别弱项)。

**file_hash**:md5/sha1/sha256,8KB 分块流式。
**config_diff**:JSON/YAML **按 key 结构化对比**(added/removed/changed/unchanged),值 >500 字符截断。
**file_remove/file_move**:`_FORBIDDEN_PREFIXES` 系统目录黑名单(13 项,全插件共用);目录删除需 `confirm` 二次确认 + max_items 批量确认;move 同分区 os.rename 原子、跨分区 robocopy/rsync/逐文件降级。

### Harness 侧详细设计(我方)

**read**:UTF-8 文本、行号输出、offset/limit 分页(默认 2000 行/次);无编码检测(GBK/UTF-16 会乱码)、无 hex/skeleton/head/tail 模式、无大小硬限(靠我自觉控制)、无 next_call 分页协议(我手动算 offset)。

**glob**:模式发现文件(不返回目录),隐藏+忽略文件也返回,按修改时间排序,100 条上限(超出截断存文件);无类型/大小过滤参数。

**grep**:ripgrep 正则,首 250 条内联(超出存文件),include 过滤;无 context_lines 参数、无 truncated 判定标志、无 ReDoS 防护(ripgrep 本身有防护,但无显式拒绝策略)、无引擎降级说明。

**bash(补位)**:可跑 `ls/find/fd/zip/hash` 等,但每次全新 shell、输出原始文本。

### 关键差异

| 维度 | DevKit | Harness |
|---|---|---|
| 编码处理 | 6 级探测 + gb18030 + latin-1 兜底 | 仅 UTF-8 |
| 读文件模式 | head/tail/行范围/hex/skeleton/分页 | 行范围(offset/limit) |
| 输出控制 | 128KB/200 行硬限 + next_call 翻页 | 2000 行软限 |
| 内容搜索 | rg + context + truncated + ReDoS 防护 + Python 降级 | grep(无 context/truncated) |
| 文件名搜索 | Everything 语法 + 大小/类型过滤 | glob(仅模式) |
| 大小/条数钳制 | 全面(文件/行/步/条目) | 部分(glob 100 条、grep 250 条) |
| 二进制 | 自动 hex 预览 | 无(会乱码) |

> **本质差异**:DevKit 的读/搜工具是"LLM 友好"的——编码、二进制、超限、分页这些噪音全部在工具层消化,返回干净、有限、可直接使用的数据;Harness 的 read/glob/grep 是通用原语,假设模型自己处理编码与分页。safe_read 的 hex/skeleton/next_call 与 rg_search 的 truncated 判定,是"替 LLM 想好下一步"的典型设计。

---

## 2.5 网络 / 执行 / 数据:DevKit http/shell_exec/op_log/db_query 家族 ↔ Harness bash/web_search

### DevKit 侧详细设计

**http_get / http_post(网络请求)**
- **SSRF 三重校验**(`_http_utils.py`):① 字面 IP 私网检查;② IPv4-mapped-IPv6(`::ffff:10.0.0.1` 形式)解映射检查;③ 域名先 DNS 解析再对**每个解析结果**做私网检查(loopback/链路本地/保留段全拦)。
- 重定向 `SafeRedirectHandler` **逐跳复检**(每跳新 URL 重新过 SSRF,防重定向到内网);5MB 响应截断;15s 超时。
- 长文/markdown 响应:**8000 字符/页的 LRU 翻页缓存**(连续翻页零重复请求);HTML→文本用 trafilatura→markdownify→bs4 降级链。
- http_download:二进制下载,目标**固定沙箱 `~/.irmia/downloads/`** 且仅取 basename 防路径遍历;500MB 上限(Content-Length 预检 + 实际字节数双保险);失败自动清理残留;无断点续传(明确取舍:简单可靠优先)。

**shell_exec(命令执行)**
- `shell=False` 直接 list 参数传递(**无 shell 解释层**);控制字符黑名单;`/dev` 引用拒绝。
- **命令白名单**(`_SAFE_COMMANDS`):仅测试/构建类命令,子命令级约束(如 `python` 只允许 `-m pytest`);路径类参数校验(cwd 逃逸拦截,`..` 解析后必须仍在 cwd 内)。
- **高风险命令二次确认**:需 `allow_high_risk=true` 显式开启,返回 proposal 协议(`dry_run=true / allow_high_risk=true / cancel` 三选项)。
- 环境变量白名单重建(不继承用户完整环境);cwd 由 project_dir 解析并校验;超时 1–600s 可配;输出 500 行截断。
- test_runner 的 `test_cmd` 覆盖也复用这套校验。

**db_query(数据库查询)**
- **仅 SQLite**;SQL 白名单 `SELECT/PRAGMA`(**无 INSERT/UPDATE/DELETE/DROP**);`mode=ro` URI **引擎层只读双保险**;参数化查询防注入;`fetchmany(201)` 防内存爆;定位本地开发库,明确不支持 MySQL/Postgres。

**op_log(审计日志)**
- SQLite 审计库(存 `<插件目录>/.irmia/op_log.db`),每次工具调用记录(工具名/参数/结果/耗时);**敏感键 `<redacted>` 脱敏**、正文超 80 字符存长度摘要、会话轮换;查询支持 recent/errors/file/stats 四种 action——配合 `tool_stats`(内存计数)形成"全量持久审计 + 实时计数"双轨。

**文本/数据处理工具组**:json_query(jq 风格)、csv_parse/csv_gen、log_parse(Nginx/Apache/syslog/JSONL)、html_extract(HTML→text/links/tables/CSS selector)、md_strip、text_filter、diff_strings、encode_utils(b64/url/hex)、time_utils、semver、uuid_gen——均为纯内存、标准库实现,零外部依赖。

**系统信息**:port_check(纯 socket,TCP 连通性)、proc_list(psutil→tasklist/ps 降级,跨平台)、sys_snapshot(/proc 与 systeminfo 双路径,CPU/内存/uptime)、disk_info(分区用量);Windows 中文系统 gbk 编码自适应。

### Harness 侧详细设计(我方)

- **web_search**:有搜索(60s 超时),`fetch: false` 无网页抓取;http_get/post/download 无对应工具——bash 可调 `curl/wget` 但**无 SSRF 防护、无重定向复检、无大小截断**。
- **bash**:无白名单、无控制字符拦截、无 cwd 逃逸校验(沙箱在进程层);环境变量继承;`danger-full-access` 下全权。
- **db/审计**:无 db_query(可 bash sqlite3,但无只读强制、无参数化强制);审计由平台会话 JSONL 承担(工具调用/结果全程记录,但模型不可查询)。
- **文本处理**:无专用工具(json_query/csv/log 需 bash 调 jq/python);编码工具靠 `base64`/`date` 命令。

### 关键差异

| 维度 | DevKit | Harness |
|---|---|---|
| 网络安全 | SSRF 三重校验 + 重定向复检 + 截断 | 无(web_fetch 未开;curl 裸奔) |
| 命令安全 | 白名单 + 高危确认 + 无 shell + 环境重建 | 无白名单(沙箱/审批层兜底) |
| 只读数据库 | SELECT/PRAGMA + mode=ro 双保险 + 参数化 | 无(依赖模型自律) |
| 审计 | op_log 可查询 + 脱敏 | 平台会话 JSONL(模型不可查询) |
| 文本解析 | 8 个专用解析工具 | bash jq/python 手动拼 |

> **本质差异**:DevKit 的"执行与数据"工具把**安全策略嵌入工具语义**(SSRF 校验、白名单、只读强制、审计脱敏),Harness 把安全放在平台层(沙箱/审批/会话记录),工具本身不承诺。DevKit 的取舍也很明确:http_download 不做断点续传、db_query 只支持 SQLite——简单可靠优先,为本地开发场景而非通用平台设计。

---

## 3. 横向设计哲学对比

### 3.1 返回协议:DevKit "提案协议" vs Harness "裸结果"

DevKit 几乎所有工具统一返回 `{ok, ...}` + 错误时附带 **`proposal/options/evidence/next_call` 协议字段**(`_helpers.proposal_reply`):
- `proposal`:人类可读的下一步建议;
- `options`:可直接执行的候选动作(含 tool+params 完整调用,如 `occurrence=2`、`confirm_delete`);
- `evidence`:LLM 做决策所需的结构化证据(匹配位置、分组统计);
- `next_call`:建议的下一工具调用(如分页的 safe_read 参数)。

效果:失败不是终点而是岔路口——LLM 只需在 options 里选一个继续,零猜测。Harness 的错误是"诊断文本"(old_string 不匹配、exit code),续作路径完全由模型自行推理。

### 3.2 安全模型:层内护栏 vs 层外沙箱

| 层面 | DevKit | Harness |
|---|---|---|
| 路径 | 工具内:.. 段 + 系统目录黑名单 + symlink 复检 | 进程级文件沙箱(策略拒绝) |
| 编码 | 工具内 6 级探测 | 无(仅 UTF-8) |
| 大小 | 工具内 20MB/10MB/128KB 等闸门 | bash 无限制、read 无硬限 |
| 网络 | SSRF 防护(待 2.5 详述) | web_fetch 未启用 |
| 命令 | shell_exec 白名单 + 高危确认(待 2.5 详述) | bash 无白名单(沙箱兜底) |
| 审计 | op_log 全量 SQLite 审计(工具名/参数/结果/耗时) | 会话 JSONL 记录(平台层) |
| 用户鉴权 | admin/sender_id 双层防线 | 审批流/沙箱权限(当前 danger-full-access) |

DevKit 的护栏**嵌在每个工具里**(因为 AstrBot 环境没有进程级沙箱,平台不可信);Harness 的护栏**在平台层**(沙箱/审批/会话记录),工具保持简单。这是两种架构的必然分工,不是优劣。

### 3.3 失败语义:自动自愈 vs 模型自理

DevKit:语法失败自动回滚、备份可撤销、mult_edit 全体回滚、skipped 不阻塞——工具承诺"改了不会改坏"。Harness:edit 失败只是报错,写坏了靠 git 或备份(模型自己安排)。

### 3.4 自动化程度

DevKit 主动替 LLM 决策:git_commit 自动 add -A、safe_edit 自动消歧提示、code_explore 自动意图路由、safe_read 自动翻页参数。Harness 把决策权完整留给模型,工具是"忠实执行器"。

---

## 4. 结论:能力差距与桥接方向

### 差距矩阵(按交接文件优先级映射)

| 优先级 | 能力 | DevKit | Harness | 差距 |
|---|---|---|---|---|
| 高 | 安全编辑链(备份/回滚/语法门禁) | 完整 | 无 | **大** |
| 高 | 结构化 Git/GitHub | 完整(proposal 确认点) | bash 裸调 | 中 |
| 高 | 代码语义理解(code_index/explore/pack/impact) | AST+FTS5+BFS | grep 近似 | **大** |
| 高 | 内置 Web Fetch | http_get/post/download + SSRF | fetch:false | 中(可配置) |
| 中 | 文件系统增强(safe_read 编码/hex、dir_tree、file_zip、config_diff) | 完整 | read/glob/bash | 中 |
| 中 | 文本/数据解析(json_query/csv/log/html) | 完整 | bash jq/python | 中 |
| 中 | 系统运维(port/proc/snapshot/shell_exec/op_log) | 完整 | bash | 中 |
| 中 | DB/依赖分析(db_query 只读、dep_scan) | 完整 | bash sqlite3 | 小-中 |
| 低 | 小工具(encode/time/semver/uuid) | 完整 | 无 | 小 |

### Harness 的独特优势(DevKit 没有)

- **多 agent 编排**:subagent/workflow/ralph——DevKit 是单 agent 工作台。
- **持久目标与计划**:goal 系统、plan mode——跨轮次长任务管理。
- **运行时自修改**:cordis 动态插件、预设创作——Harness 能改自己,DevKit 不能。
- **后台任务**:bash 后台 + job 收集。
- **平台级沙箱/审批/会话审计**:比插件级护栏更彻底。

### 桥接方向(供创造模式后续实施)

1. **方式 B(推荐)**:用 cordis 工具集注册原生 Harness 工具——优先做 safe_edit 链(safe_edit/multi_edit/safe_rollback 三件套,带备份+回滚+语法门禁)、code_explore 语义查询(可先做符号索引简化版)、结构化 git_status/git_commit。
2. **方式 C 最小闭环**:safe_edit + multi_edit + code_explore + 启用 fetch:true。
3. **方式 A**:把 DevKit Python 工具作为外部命令,通过 bash 调用解析 JSON(依赖 AstrBot 环境,耦合重,不推荐为长期方案)。
4. 启用 web_fetch:复制标准/创造模式预设,`fetch: false` 改 `true`。
