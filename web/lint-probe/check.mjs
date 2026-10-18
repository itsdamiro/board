// ADR 007, decision 3: the lint gate must be able to fail. Run the linter on the faulty fixtures next to this file and
// fail unless it exits non-zero and names each of the rules the page relies on.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
const run = spawnSync("oxlint", ["--type-aware", "--deny-warnings", dir], { encoding: "utf8" });
const output = `${run.stdout}${run.stderr}`;
const expected = ["react(no-danger)", "react-hooks(rules-of-hooks)", "react-hooks(exhaustive-deps)", "jsx-a11y(alt-text)", "typescript(no-floating-promises)"];
const missing = expected.filter((rule) => !output.includes(rule));

if (run.error) {
  console.error(`could not run oxlint: ${run.error.message}`);
  process.exit(1);
}
if (run.status === 0 || missing.length > 0) {
  console.error(`the linter no longer catches the probe: exit ${run.status}, silent on ${missing.join(", ") || "nothing"}`);
  console.error(output);
  process.exit(1);
}
console.log(`lint probe: the linter reports all ${expected.length} rules`);
