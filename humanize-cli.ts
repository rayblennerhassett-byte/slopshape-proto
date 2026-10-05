#!/usr/bin/env bun
/**
 * Humanizer CLI — runs the Table 6 playbook on a post.
 *
 *   bun run humanize-cli.ts post.md            # humanized text on stdout, report on stderr
 *   bun run humanize-cli.ts --json post.md     # full JSON: text, edits, gaps, before/after scores
 *   cat post.md | bun run humanize-cli.ts
 *
 * Redirect stdout to a file to keep the humanized text; the report always
 * goes to stderr so pipes stay clean.
 */
import { readFileSync } from "node:fs";
import { humanizeWithReport } from "./src/humanize";

function readInput(): string {
  const args = process.argv.slice(2).filter((a) => a !== "--json");
  if (args.length > 0) return readFileSync(args[0], "utf8");
  try {
    return readFileSync(0, "utf8");
  } catch {
    console.error("usage: bun run humanize-cli.ts [--json] <post.md>   (or pipe text on stdin)");
    process.exit(1);
  }
}

const json = process.argv.includes("--json");
const result = humanizeWithReport(readInput());

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(result.text);
  const r = result.report!;
  console.error(
    `score: ${r.before.toFixed(3)} -> ${r.after.toFixed(3)} (${r.delta >= 0 ? "+" : ""}${r.delta.toFixed(3)})`,
  );
  console.error(`verdict: ${r.beforeVerdict} -> ${r.afterVerdict}`);
  console.error("edits:");
  for (const e of result.edits) console.error(`  [${e.phase}] ${e.rule} x${e.count}`);
  if (result.flaggedForGaps.length > 0) {
    console.error("needs a human (true material only — do not fabricate):");
    for (const g of result.flaggedForGaps) console.error(`  - ${g}`);
  }
}
