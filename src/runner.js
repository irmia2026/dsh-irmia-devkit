// src/runner.js — spawn the Python bridge and return the tool result as JSON.
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const RUNNER = path.join(here, "..", "python", "runner.py");

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024; // 64MB; code_pack can be large

/**
 * Invoke one DevKit tool through the Python runner.
 * @param {string} pythonPath - python3 executable (from plugin config).
 * @param {string} toolName - dispatch key, e.g. "safe_edit".
 * @param {object} args - JSON-able tool arguments.
 * @param {{signal?: AbortSignal}} [exec] - harness execution context for cancellation.
 * @returns {Promise<any>} the tool's JSON result.
 */
export function runTool(pythonPath, toolName, args, exec = {}) {
  const input = JSON.stringify(args ?? {});
  return new Promise((resolve, reject) => {
    execFile(
      pythonPath,
      [RUNNER, toolName, input],
      {
        encoding: "utf8",
        maxBuffer: MAX_OUTPUT_BYTES,
        signal: exec.signal,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          if (error.killed || error.signal) {
            reject(new Error(`${toolName}: python runner ${error.signal ? `cancelled (${error.signal})` : "timed out"}`));
            return;
          }
          reject(new Error(`${toolName}: runner failed: ${error.message}`));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error(`${toolName}: runner returned non-JSON output`));
        }
      },
    );
  });
}
