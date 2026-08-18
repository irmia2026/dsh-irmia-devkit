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
      "Edit code files safely: auto-backup, exact replace, syntax gate, and rollback on failure. Prefer this over the plain edit tool for code — it cannot leave a broken file behind. Modes: replace / insert_at_line / delete_lines.",
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
    description:
      "Restore a file from an auto-backup created by safe_edit, or list backups with list=true. Omit backup_name to restore the most recent one; the current state is snapshotted first so the rollback itself can be undone.",
    parameters: {
      filepath: { type: "string", required: true, description: "目标文件路径" },
      backup_name: { type: "string", description: "备份文件名(见 list=true 的输出),省略则用最近备份" },
      list: { type: "boolean", description: "列出该文件的备份(不执行回滚),默认 false" },
    },
    output: jsonOutput,
  },
  {
    name: "multi_edit",
    description:
      "Apply many edits across files in one atomic call: all files are syntax-checked before anything is written, and any failure rolls everything back. One call replaces a chain of edit calls. Each item: {file, old, new, replace_all?}.",
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
      "Fetch a URL with built-in SSRF protection (blocks internal/private addresses and re-checks every redirect). The only network fetch tool with safety guards — use instead of raw curl. format: markdown / text / html.",
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
    description: "POST to a URL with the same SSRF protection as http_get. data accepts a JSON object (auto-serialized) or a raw string.",
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
      "Build the symbol index a project needs for code_explore (stored in .codegraph/). Run once per project, then incremental=true for small changes; status=true reports index health without re-indexing. Python via ast; other languages via optional tree-sitter.",
    parameters: {
      project_dir: { type: "string", description: "项目根目录,默认当前目录" },
      incremental: { type: "boolean", description: "增量更新,默认 false" },
      status: { type: "boolean", description: "只输出索引体检(不建索引),默认 false" },
    },
    output: jsonOutput,
  },
  {
    name: "code_explore",
    description:
      "Semantic symbol queries: where X is defined, who calls X, and call paths X→Y. Requires code_index first. Use exact symbol names (e.g. _auth_guard), not natural language. Far more precise than grep for large repositories.",
    parameters: {
      query: { type: "string", required: true, description: "符号名或查询(支持 kind:function 过滤)" },
      project_dir: { type: "string", description: "项目根目录,默认当前目录" },
    },
    output: jsonOutput,
  },
  {
    name: "code_diff_impact",
    description: "Analyze what a change breaks: given changed files, returns affected symbols and files via reverse BFS. Run before committing to catch hidden callers that grep would miss.",
    parameters: {
      filepaths: { type: "array", required: true, items: { type: "string" }, description: "改动的文件路径列表" },
      max_depth: { type: "integer", description: "影响深度,默认 3" },
      project_dir: { type: "string", description: "项目根目录,默认当前目录" },
    },
    output: jsonOutput,
  },

  // ── 只读数据库 ─────────────────────────────────────────────
  {
    name: "db_query",
    description: "Read-only SQLite queries: only SELECT/PRAGMA allowed with engine-level read-only enforcement and parameterized queries. The safe way to inspect local databases — cannot modify data.",
    parameters: {
      db_path: { type: "string", required: true, description: "SQLite 数据库文件路径" },
      sql: { type: "string", required: true, description: "SELECT 或 PRAGMA 查询语句" },
      params: { type: "array", items: { type: "json" }, description: "查询参数列表,如 [42, \"active\"]" },
    },
    output: jsonOutput,
  },
];
