# dsh-irmia-devkit

为 **DeepSeek Harness**(Cordis)移植的 **Irmia DevKit** 精选工具集。

从 DevKit v2.6.4 的 65 个工具中精选 9 个,补齐 Harness 原生缺失的能力;**保留的工具原样移植,零改造**(参数、防呆机制、返回协议全部保留);`safe_backups` 并入 `safe_rollback`(list 动作),`code_status` 并入 `code_index`(status 动作)。

## 保留工具

| 分组 | 工具 | 说明 |
|---|---|---|
| 安全编辑链 | `safe_edit` / `safe_rollback` / `multi_edit` | 自动备份 → 编辑 → 语法检查 → 失败自动回滚;`safe_rollback(list=true)` 列出备份;跨文件原子批量编辑 |
| 网络 | `http_get` / `http_post` | 内置 SSRF 防护(内网拦截 + 重定向逐跳复检) |
| 代码理解 | `code_index` / `code_explore` / `code_diff_impact` | 符号索引(AST + SQLite + FTS5)+ 调用图 BFS 查询;`code_index(status=true)` 索引体检 |
| 只读数据库 | `db_query` | SELECT/PRAGMA 白名单 + mode=ro 引擎层只读 |

**砍掉的 51 个**:Harness 已有等价能力(rg_search→grep、es_search→glob、safe_read→read(原生已支持 offset/limit 翻页与续读 footer)、git 全族→bash git、gh 全族→bash gh、shell_exec→bash、op_log→平台会话记录、dir_*/text_filter/diff_strings…)或一条 bash 命令可替代(file_hash→sha256sum、file_zip→zip、disk_info→df、json_query→jq、encode→base64、lint_runner→ruff check、test_runner→pytest、symbol_rename→grep+multi_edit 组合…)。

## 架构

```
模型 → Cordis 工具 (index.js / src/tools.js)
        │  execFile("python3", python/runner.py <tool> '<json-args>')
        ▼
python/runner.py → tools/*.py (DevKit 原样模块,dispatch 到工具函数)
        ▼
JSON 结果返回模型
```

- JS 层只做工具 schema 定义与子进程桥接;
- Python 核心 `python/tools/` 直接来自 [irmia2026/irmia_devkit_open](https://github.com/irmia2026/irmia_devkit_open) v2.6.4,零改动;
- 零第三方 Python 依赖(纯标准库;chardet / tree-sitter 为可选增强,缺失自动降级)。

## 安装

前置:Node.js ≥ 18,`python3` 在 PATH 中(>= 3.9)。本包以 **bundle** 形式分发,声明 `dsh.bundle`,通过 `dsh plugin` 安装进 profile:

```sh
# 从 npm(推荐,预构建产物直接可用)
npx @deepseek-ai/dsh plugin --profile web add dsh-irmia-devkit

# 从 GitHub(锁定版本)
npx @deepseek-ai/dsh plugin --profile web add github:irmia2026/dsh-irmia-devkit#v0.1.0
```

安装后可先验证配置层再启动:

```sh
npx @deepseek-ai/dsh --profile web --dump-config   # 应出现 "# == dsh-irmia-devkit" 层
npx @deepseek-ai/dsh web
```


## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `pythonPath` | `python3` | 运行 Python 工具的可执行文件 |

## 迭代计划(已确认保留,待实施)

当前版本以 Python 桥承载工具核心(原样移植)。后续迭代方向:**纯 JS 重写,去掉 python3 运行时依赖**。JS 生态对应库已验证可用:

| Python 能力 | JS 对应 | 状态 |
|---|---|---|
| `ast.parse`(Python 语法检查) | tree-sitter-python(ERROR 节点检测) | 需 npm 安装 |
| `sqlite3` + FTS5 + mode=ro | `node:sqlite`(Node 22+ 内置) | ✅ 已验证 |
| urllib + ipaddress(SSRF) | node:http/https + dns.lookup | 原生 |
| trafilatura/markdownify/bs4 | turndown | 宿主已有 |
| difflib / 自研匹配 | diff | 宿主已有 |
| tree-sitter 多语言索引 | tree-sitter 官方 JS 包 | 生态更全 |

附带收益:统一用 tree-sitter 做语法门禁与代码索引,消除原版"ast + tree-sitter 两套解析器"的不一致。

## 测试

```bash
node test/smoke.mjs   # 需 node_modules 含 @deepseek-ai/dsh-tools
```

## 文档

- [`docs/COMPARISON.md`](docs/COMPARISON.md) — DevKit 与 Harness 工具详细设计对比
- [`docs/PORTING.md`](docs/PORTING.md) — 移植蓝图(保留/砍掉清单与理由)
- [`docs/HANDOVER.md`](docs/HANDOVER.md) — 原始交接背景

## 许可

**AGPL-3.0**。Python 工具核心来自 [Irmia DevKit](https://github.com/irmia2026/irmia_devkit_open)(Copyright (C) 2026 伊尔弥亚 / irmia2026),AGPL-3.0;本仓库作为其衍生作品整体采用 AGPL-3.0。
