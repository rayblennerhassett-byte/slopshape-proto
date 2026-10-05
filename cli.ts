#!/usr/bin/env bun
/**
 * CLI: score blog posts (files or stdin) with the structural detector.
 *
 *   bun run cli.ts post.md
 *   cat post.md | bun run cli.ts
 *   bun run cli.ts --json post.md
 *
 * Two independent axes are printed: the 0–1 template score
 * (src/detector.ts) and the structural-rarity percentile
 * (src/rarity.ts), the latter scored against a pooled reference
 * corpus built deterministically from the two sample posts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PAPER, scoreText, type ScoreResult } from "./src/detector";
import {
  buildDefaultPool,
  buildReferencePool,
  rarityOf,
  twoAxisReading,
  type DefaultPool,
  type RarityResult,
} from "./src/rarity";

function readInput(): string {
  const args = process.argv.slice(2).filter((a) => a !== "--json");
  if (args.length > 0) return readFileSync(args[0], "utf8");
  try {
    return readFileSync(0, "utf8");
  } catch {
    console.error("usage: bun run cli.ts [--json] <post.md>   (or pipe text on stdin)");
    process.exit(1);
  }
}

/**
 * The default pooled reference corpus, built from the two sample
 * posts. If the samples are unavailable (a stripped install), the
 * pool degrades to the empty pool: scores stay finite — every query
 * lands at the 0.50 percentile with k = 0 — never NaN.
 */
function buildPool(): DefaultPool {
  try {
    const dir = join(import.meta.dir, "samples");
    const human = readFileSync(join(dir, "human-post.md"), "utf8");
    const ai = readFileSync(join(dir, "ai-post.md"), "utf8");
    return buildDefaultPool(human, ai);
  } catch {
    return { pool: buildReferencePool([]), humanIndex: -1, aiIndex: -1 };
  }
}

function printHuman(
  r: ScoreResult,
  rarity: RarityResult,
  twoAxis: string,
): void {
  console.log(`score: ${r.score.toFixed(3)}  (${r.verdict})`);
  console.log(
    `rarity: ${rarity.percentile.toFixed(3)} (${rarity.reading})` +
      ` — mean k-NN distance ${rarity.meanNNDistance.toFixed(3)},` +
      ` k=${rarity.k}, pooled reference ${rarity.poolSize} configs`,
  );
  console.log(`two-axis: ${twoAxis}`);
  console.log(`words: ${r.features.wordCount}`);
  console.log("top signals (positive = AI-templated, negative = human-voice):");
  for (const s of r.signals.slice(0, 8)) {
    const bar = "#".repeat(Math.round(Math.abs(s.contribution) * 40));
    const dir = s.contribution >= 0 ? "+" : "-";
    console.log(`  ${dir} ${s.contribution.toFixed(3).padStart(6)}  ${bar.padEnd(20, " ")} ${s.name} [${s.paperId}]`);
  }
}

function main(): void {
  const text = readInput();
  const json = process.argv.includes("--json");
  const result = scoreText(text);
  const pool = buildPool();
  const rarity = rarityOf(text, pool.pool);
  const twoAxis = twoAxisReading(result.score, rarity.percentile);
  if (json) {
    console.log(
      JSON.stringify(
        { ...result, paper: PAPER, rarity: { ...rarity, twoAxis } },
        null,
        2,
      ),
    );
  } else {
    printHuman(result, rarity, twoAxis);
  }
}

main();
