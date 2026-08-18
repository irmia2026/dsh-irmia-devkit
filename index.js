// index.js — Cordis plugin entry: registers the Irmia DevKit tools.
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { toolDefinitions } from "./src/tools.js";

/** Cordis plugin name used by loader diagnostics. */
const name = "tool-irmia-devkit";

/** Services required by this plugin. */
const inject = ["tools", "systemPrompt"];

const Config = z.object({
  /** python3 executable used to run the bundled Python tools. */
  pythonPath: z.string().default("python3"),
});

function apply(ctx, config) {
  const resolved = config;
  for (const definition of toolDefinitions) {
    ctx.tools.register(defineTool({ ...definition, execute: withRunner(resolved.pythonPath, definition) }));
  }
  ctx.systemPrompt.section({
    name: "tool:irmia-devkit",
    order: 150,
    text: "This plugin ports a curated set of tools from Irmia DevKit. Prefer safe_edit (auto backup + syntax gate + rollback) over plain edit for code files; use multi_edit for batched cross-file edits; use safe_read when encoding detection or hex preview is needed; use code_explore/code_index for symbol-level queries in large repositories.",
  });
}

/** Wrap a definition's business function with the Python bridge. */
function withRunner(pythonPath, definition) {
  return async (args, exec) => {
    const { runTool } = await import("./src/runner.js");
    return runTool(pythonPath, definition.name, args, exec);
  };
}

export { name, inject, apply, Config };
