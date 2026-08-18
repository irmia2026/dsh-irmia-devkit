// src/tools.js — tool definitions for the Irmia DevKit port.
// Definitions carry name/description/parameters/output; `execute` is attached
// by index.js so every tool runs through the Python bridge (原样移植,零改造).

const textRender = (_args, value) => [
  { type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) },
];

const jsonOutput = { schema: { type: "json" }, render: textRender };

export const toolDefinitions = [
  // ── 安全编辑链 ──────────────────────────────────────────────
  {
    name: "safe_edit",
    description:
      "安全编辑文件(改代码首选):自动备份 → 精确替换 → 语法检查 → 通过保留/失败自动回滚。支持 mode: replace(默认,old→new 文本替换)/ insert_at_line(在 line 行后插入 new,line=0 为文件开头)/ delete_lines(删除 start_line~end_line 闭区间行)。old 多处匹配时用 occurrence=N 指定第几次,或 replace_all=true 全替换。",
    parameters: {
      filepath: { type: "string", required: true, description: "文件路径" },
      old: { type: "string", description: "要被替换的旧文本(精确匹配,含缩进)。mode=replace 时必填" },
      new: { type: "string", description: "替换后的新文本。mode=replace/insert_at_line 时必填" },
      replace_all: { type: "boolean", description: "是否替换所有匹配项,默认 false" },
      occurrence: { type: "integer", description: "替换第 N 次出现(1-based),多匹配时用于消歧" },
      align_whitespace: { type: "boolean", description: "old 缩进差一两格时自动对齐行首空白后重试,默认 true" },
      mode: { type: "string", enum: ["replace", "insert_at_line", "delete_lines"], description: "编辑模式,默认 replace" },
      line: { type: "integer", description: "insert_at_line 目标行号(1-based,0=文件开头)" },
      start_line: { type: "integer", description: "delete_lines 起始行号(1-based,闭区间)" },
      end_line: { type: "integer", description: "delete_lines 结束行号(1-based,闭区间)" },
    },
    output: jsonOutput,
  },
  {
    name: "safe_rollback",
    description: "回滚文件到指定备份。backup_name 省略时回滚到最近备份;回滚前自动备份当前状态(可再回滚撤销)。",
    parameters: {
      filepath: { type: "string", required: true, description: "目标文件路径" },
      backup_name: { type: "string", description: "备份文件名(见 safe_backups 输出),省略则用最近备份" },
    },
    output: jsonOutput,
  },
  {
    name: "safe_backups",
    description: "列出某文件的备份(默认全部备份)。与 safe_rollback 配合使用。",
    parameters: {
      filepath: { type: "string", description: "按文件过滤;省略则列出全部" },
    },
    output: jsonOutput,
  },
  {
    name: "multi_edit",
    description:
      "跨文件/同文件多处编辑的原子批量工具:全部编辑语法检查通过后一次性提交,任一失败全体回滚。edits 每项 {file, old, new, replace_all?, occurrence?};同文件多项按顺序链式应用(后一项的 old 必须匹配前一项应用后的内容)。",
    parameters: {
      edits: {
        type: "array",
        required: true,
        items: {
          type: "object",
          additionalProperties: true,
          properties: {
            file: { type: "string", description: "文件路径" },
            filepath: { type: "string", description: "文件路径(与 file 二选一)" },
            old: { type: "string", description: "要被替换的旧文本" },
            new: { type: "string", description: "替换后的新文本" },
            replace_all: { type: "boolean", description: "是否替换所有匹配" },
            occurrence: { type: "integer", description: "替换第 N 次出现" },
          },
        },
        description: "编辑列表,至少一项",
      },
      syntax_check: { type: "boolean", description: "提交前对代码文件跑语法检查,默认 true" },
    },
    output: jsonOutput,
  },

  // ── 网络 ────────────────────────────────────────────────────
  {
    name: "http_get",
    description:
      "HTTP GET 请求,内置 SSRF 防护(拒绝内网/保留地址,重定向逐跳复检),响应最大 5MB。format: markdown(默认,HTML 转文本)/ text / html。长文自动分页(offset 翻页)。",
    parameters: {
      url: { type: "string", required: true, description: "目标 URL" },
      headers: { type: "object", additionalProperties: true, description: "自定义请求头(可选)" },
      format: { type: "string", description: "输出格式:markdown/text/html,默认 markdown" },
      extract: { type: "boolean", description: "是否提取正文,默认 false" },
      timeout: { type: "integer", description: "超时秒数,默认 15" },
      offset: { type: "integer", description: "翻页偏移(长文分页),默认 0" },
    },
    output: jsonOutput,
  },
  {
    name: "http_post",
    description: "HTTP POST 请求,内置 SSRF 防护。data 可以是 dict(自动 JSON)或字符串。",
    parameters: {
      url: { type: "string", required: true, description: "目标 URL" },
      data: { type: "json", description: "请求体:dict(自动 JSON)或字符串" },
      headers: { type: "object", additionalProperties: true, description: "自定义请求头(可选)" },
      timeout: { type: "integer", description: "超时秒数,默认 10" },
    },
    output: jsonOutput,
  },

  // ── 代码理解 ────────────────────────────────────────────────
  {
    name: "code_index",
    description:
      "为项目建立符号索引(SQLite,存于项目 .codegraph/ 目录)。首次进项目全量建索引;后续改动少量文件用 incremental=true 增量更新。支持 Python(ast)与 JS/TS/Go/Rust/Java/C/C++(tree-sitter,可选)。",
    parameters: {
      project_dir: { type: "string", description: "项目根目录,默认当前目录" },
      incremental: { type: "boolean", description: "增量更新,默认 false" },
    },
    output: jsonOutput,
  },
  {
    name: "code_explore",
    description:
      "符号语义查询:「X 在哪定义」「谁调用了 X」「从X到Y的调用链」。先 code_index 建索引;查询用符号名(如 _auth_guard)而非自然语言。索引过期会返回 stale_warning。查不到时先 code_status 再考虑 rg_search。",
    parameters: {
      query: { type: "string", required: true, description: "符号名或查询(支持 kind:function 过滤)" },
      project_dir: { type: "string", description: "项目根目录,默认当前目录" },
    },
    output: jsonOutput,
  },
  {
    name: "code_diff_impact",
    description: "改动影响范围分析:输入改动文件列表,输出受影响的符号与文件(反向 BFS,max_depth 层)。commit 前自查用。",
    parameters: {
      filepaths: { type: "array", required: true, items: { type: "string" }, description: "改动的文件路径列表" },
      max_depth: { type: "integer", description: "影响深度,默认 3" },
      project_dir: { type: "string", description: "项目根目录,默认当前目录" },
    },
    output: jsonOutput,
  },
  {
    name: "code_pack",
    description: "打包符号及其依赖链源码:以 target 符号为根沿调用边展开(双向),返回可直接阅读的依赖源码,总行数上限 2000。修 bug 需要完整上下文时用。",
    parameters: {
      target: { type: "string", required: true, description: "目标符号名" },
      depth: { type: "integer", description: "展开深度,默认 2" },
      mode: { type: "string", enum: ["both", "callers", "callees"], description: "展开方向,默认 both" },
      project_dir: { type: "string", description: "项目根目录,默认当前目录" },
    },
    output: jsonOutput,
  },
  {
    name: "code_status",
    description: "索引体检:文件数/符号数/边数/索引时间/DB 大小/FTS 状态/缺失 grammar。code_explore 查不到时先查此工具。",
    parameters: {
      project_dir: { type: "string", description: "项目根目录,默认当前目录" },
    },
    output: jsonOutput,
  },

  // ── 文件删除/移动 ───────────────────────────────────────────
  {
    name: "file_remove",
    description: "安全删除文件或目录:拒绝系统目录与路径穿越;目录删除需 confirm=true 二次确认;目录超过 max_items 个文件时返回提案不执行。",
    parameters: {
      path: { type: "string", required: true, description: "文件或目录路径" },
      confirm: { type: "boolean", description: "目录删除确认,默认 false" },
      max_items: { type: "integer", description: "目录文件数上限,默认 50" },
    },
    output: jsonOutput,
  },
  {
    name: "file_move",
    description: "移动文件/目录到目标目录(自动创建)。同分区 os.rename 原子移动,跨分区自动用 robocopy/rsync/逐文件降级。",
    parameters: {
      sources: { type: "array", required: true, items: { type: "string" }, description: "源路径列表" },
      dest: { type: "string", required: true, description: "目标目录" },
      overwrite: { type: "boolean", description: "覆盖同名文件,默认 false" },
    },
    output: jsonOutput,
  },

  // ── 可选工具 ────────────────────────────────────────────────
  {
    name: "db_query",
    description: "只读查询 SQLite 数据库:仅允许 SELECT/PRAGMA(mode=ro 引擎层只读双保险),参数化查询防注入。不支持写操作。",
    parameters: {
      db_path: { type: "string", required: true, description: "SQLite 数据库文件路径" },
      sql: { type: "string", required: true, description: "SELECT 或 PRAGMA 查询语句" },
      params: { type: "array", items: { type: "json" }, description: "查询参数列表,如 [42, \"active\"]" },
    },
    output: jsonOutput,
  },
  {
    name: "symbol_rename",
    description:
      "多文件符号重命名:token 级替换(不碰字符串/注释/关键字),默认 dry_run 预览;跨文件时需 confirm_multi_file=true;新名冲突自动拒绝;最终经 multi_edit 原子提交+语法检查。需先 code_index。",
    parameters: {
      old: { type: "string", required: true, description: "旧符号名(如 foo 或 Class.method)" },
      new: { type: "string", required: true, description: "新符号名(合法标识符,非 Python 关键字)" },
      project_dir: { type: "string", description: "项目根目录,默认当前目录" },
      dry_run: { type: "boolean", description: "只预览不落盘,默认 true" },
      confirm_multi_file: { type: "boolean", description: "跨文件重命名确认,默认 false" },
    },
    output: jsonOutput,
  },
  {
    name: "lint_runner",
    description: "代码质量检查:auto 自动探测 ruff → pylint → eslint(JS/TS),输出结构化 issues 并附代码上下文。与 syntax_check(能否跑)互补。",
    parameters: {
      filepath: { type: "string", required: true, description: "文件路径" },
      linter: { type: "string", enum: ["auto", "ruff", "pylint", "eslint"], description: "指定 linter,默认 auto" },
    },
    output: jsonOutput,
  },
  {
    name: "test_runner",
    description: "统一测试执行:pytest/go test/cargo test/jest 自动发现(py 项目默认 pytest -q)。test_cmd 覆盖时经白名单校验。返回结构化 passed/failed/skipped。",
    parameters: {
      filepath: { type: "string", description: "用于定位项目根的文件(可选)" },
      project_dir: { type: "string", description: "项目根目录,默认当前目录" },
      test_cmd: { type: "string", description: "自定义测试命令(可选,需在白名单内)" },
      timeout: { type: "integer", description: "超时秒数,默认 120,范围 1-600" },
    },
    output: jsonOutput,
  },
];
