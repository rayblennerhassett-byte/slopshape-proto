/**
 * Weekly drift check for the pool-scaling experiment.
 *
 * Usage: bun run experiment/drift.ts <current.txt> <previous.txt>
 *
 * Parses the "Cross-pair validation" table out of two scale outputs
 * and exits 1 if the human-vs-AI direction moved between them: the
 * paper's finding is the human percentile strictly above the AI
 * percentile on every pair. Also fails if the pair set changed, or
 * if any pair's direction is broken in the current output at all.
 */
import { readFileSync } from "node:fs";

interface PairDirection {
  humanPct: number;
  aiPct: number;
}

/** Cross-pair rows are the only 9-field lines with this shape. */
const ROW_FIELDS = 9;

function parseDirections(path: string): Map<string, PairDirection> {
  const directions = new Map<string, PairDirection>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const f = line.trim().split(/\s+/);
    if (
      f.length !== ROW_FIELDS ||
      !/^\d+\.\d+$/.test(f[2]) ||
      !/^\d+\.\d+$/.test(f[4]) ||
      (f[3] !== "MET" && f[3] !== "NO") ||
      (f[5] !== "MET" && f[5] !== "NO")
    ) {
      continue;
    }
    directions.set(f[0], { humanPct: Number(f[2]), aiPct: Number(f[4]) });
  }
  if (directions.size === 0) {
    throw new Error(`no cross-pair validation table found in ${path}`);
  }
  return directions;
}

const [currentPath, previousPath] = process.argv.slice(2);
if (!currentPath || !previousPath) {
  console.error("usage: bun run experiment/drift.ts <current.txt> <previous.txt>");
  process.exit(2);
}

const current = parseDirections(currentPath);
const previous = parseDirections(previousPath);

const currentNames = [...current.keys()].sort().join(",");
const previousNames = [...previous.keys()].sort().join(",");
let failed = false;

if (currentNames !== previousNames) {
  console.error(
    `pair set changed: previous [${previousNames}], current [${currentNames}]`,
  );
  failed = true;
}

for (const [name, now] of current) {
  const held = now.humanPct > now.aiPct;
  if (!held) {
    console.error(
      `${name}: direction broken — human percentile ${now.humanPct} ` +
        `is not above AI percentile ${now.aiPct}`,
    );
    failed = true;
  }
  const before = previous.get(name);
  if (!before) continue;
  const heldBefore = before.humanPct > before.aiPct;
  if (held !== heldBefore) {
    console.error(
      `${name}: direction FLIPPED — previous human ${before.humanPct} ` +
        `vs AI ${before.aiPct} (${heldBefore ? "human-above" : "AI-above"}), ` +
        `now human ${now.humanPct} vs AI ${now.aiPct} ` +
        `(${held ? "human-above" : "AI-above"})`,
    );
    failed = true;
  }
}

if (failed) {
  console.error(
    "drift check FAILED: the human-vs-AI direction flipped " +
      "versus the previous run",
  );
  process.exit(1);
}

console.log(
  `drift check OK: human percentile above AI percentile on all ` +
    `${current.size} pairs, unchanged from the previous run`,
);
