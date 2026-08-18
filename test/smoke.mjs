// test/smoke.mjs — node-level smoke test (no Cordis runtime required).
// Verifies: tool definitions compile through defineTool, and the Python bridge
// executes real tools. Requires node_modules with @deepseek-ai/dsh-tools.
import { defineTool } from "@deepseek-ai/dsh-tools";
import { toolDefinitions } from "../src/tools.js";
import { runTool } from "../src/runner.js";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PYTHON = process.env.PYTHON ?? "python3";
let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`FAIL  ${name}: ${e.message}`);
  }
}

// 1. Every definition compiles through defineTool (schemas are valid).
for (const def of toolDefinitions) {
  check(`schema: ${def.name}`, () => {
    const tool = defineTool({ ...def, execute: async () => ({ ok: true }) });
    assert.strictEqual(tool.name, def.name);
    assert.ok(tool.parameters, "parameters missing");
  });
}

// 2. Python bridge executes real tools.
check("bridge: safe_edit backup + syntax + rollback", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "dk-smoke-"));
  const f = path.join(dir, "m.py");
  writeFileSync(f, "def foo():\n    return 1\n", "utf8");
  const r = await runTool(PYTHON, "safe_edit", { filepath: f, old: "return 1", new: "return 2" });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.syntax_ok, true);
  assert.strictEqual(readFileSync(f, "utf8").includes("return 2"), true);
  const rb = await runTool(PYTHON, "safe_rollback", { filepath: f });
  assert.strictEqual(rb.ok, true);
  assert.strictEqual(readFileSync(f, "utf8").includes("return 1"), true);
  rmSync(dir, { recursive: true, force: true });
});

check("bridge: multi_edit atomic", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "dk-smoke-"));
  const f1 = path.join(dir, "a.py");
  const f2 = path.join(dir, "b.py");
  writeFileSync(f1, "x=1\n", "utf8");
  writeFileSync(f2, "y=2\n", "utf8");
  const r = await runTool(PYTHON, "multi_edit", {
    edits: [
      { file: f1, old: "x=1", new: "x=10" },
      { file: f2, old: "y=2", new: "y=20" },
    ],
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.total_applied, 2);
  assert.strictEqual(readFileSync(f1, "utf8").includes("x=10"), true);
  rmSync(dir, { recursive: true, force: true });
});

check("bridge: http_get SSRF blocked", async () => {
  const r = await runTool(PYTHON, "http_get", { url: "http://127.0.0.1/" });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /内网|禁止/);
});

check("bridge: db_query read-only", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "dk-smoke-"));
  const db = path.join(dir, "t.db");
  const { execFileSync } = await import("node:child_process");
  execFileSync(PYTHON, ["-c", `import sqlite3; c=sqlite3.connect('${db}'); c.execute('create table t(a)'); c.execute('insert into t values (1)'); c.commit()`]);
  const r = await runTool(PYTHON, "db_query", { db_path: db, sql: "select * from t" });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.count, 1);
  const bad = await runTool(PYTHON, "db_query", { db_path: db, sql: "delete from t" });
  assert.strictEqual(bad.ok, false);
  rmSync(dir, { recursive: true, force: true });
});

check("bridge: path sandbox guards safe_edit (system dir)", async () => {
  const r = await runTool(PYTHON, "safe_edit", { filepath: "/etc/passwd", old: "x", new: "y" });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /禁止|拒绝/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
