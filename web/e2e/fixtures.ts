import { test as base } from "@playwright/test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// ADR 006, decisions 3, 4 and 7: for each test, a fresh sample vault in the system temporary folder and the real Python
// server on a free port, serving the built web/dist/. The owner's vault is never named here.
const ROOT = resolve(import.meta.dirname, "..", "..");
const PYTHON = join(ROOT, ".venv", "bin", "python");
const START_TIMEOUT_MS = 15_000;

export interface Board {
  /** Where the server listens, e.g. http://127.0.0.1:41234 */
  url: string;
  /** The sample vault's folder, for checking what the server wrote. */
  vault: string;
}

function start(vault: string): Promise<{ child: ChildProcess; url: string }> {
  return new Promise((done, fail) => {
    const child = spawn(PYTHON, ["-m", "board", "--vault", vault, "--port", "0"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      fail(new Error(`the server did not start within ${START_TIMEOUT_MS} ms; output: ${out}${err}`));
    }, START_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
      const found = /listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(out);
      if (found?.[1]) {
        clearTimeout(timer);
        done({ child, url: found[1] });
      }
    });
    child.stderr.on("data", (chunk: Buffer) => (err += chunk.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      fail(e);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      fail(new Error(`the server exited with ${code} before it listened; output: ${out}${err}`));
    });
  });
}

export const test = base.extend<{ board: Board }>({
  // Playwright reads the first parameter's pattern to know what a fixture needs, so it must be a pattern, even an empty one.
  // oxlint-disable-next-line no-empty-pattern
  board: async ({}, provide) => {
    if (!existsSync(PYTHON)) throw new Error(`no ${PYTHON}: create the virtual environment (README)`);
    if (!existsSync(join(ROOT, "web", "dist", "index.html"))) throw new Error("web/dist is not built: run `npm run build` first");
    const temp = mkdtempSync(join(tmpdir(), "board-e2e-"));
    try {
      const vault = join(temp, "vault");
      const made = spawnSync(PYTHON, [join(ROOT, "scripts", "sample_vault.py"), vault], { encoding: "utf8" });
      if (made.status !== 0) throw new Error(`the sample vault was not made: ${made.stderr}`);
      const { child, url } = await start(vault);
      try {
        await provide({ url, vault });
      } finally {
        child.removeAllListeners("exit");
        child.kill();
      }
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  },
});

export { expect } from "@playwright/test";
