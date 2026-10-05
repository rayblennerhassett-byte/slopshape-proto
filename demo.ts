#!/usr/bin/env bun
/**
 * Demo: the SlopShape paper's headline findings, reproduced in miniature.
 *
 *  1. Structural detection separates AI from human posts (§5.1).
 *  2. Rewording leaves the structural score unchanged, while word-level
 *     signals collapse (§5.4).
 *  3. The two poles: detector skill vs humanizer skill (Table 6).
 *  4. Structural rarity: human posts occupy rare configurations, AI posts
 *     crowd the common ones — scored against a pooled reference corpus.
 *
 * Run: bun run demo.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scoreText } from "./src/detector";
import { humanizeWithReport } from "./src/humanize";
import { rewordDeSignpost, rewordLexical } from "./src/reword";
import {
  buildDefaultPool,
  memberRarity,
  meanPairwiseDistance,
} from "./src/rarity";

const dir = join(import.meta.dir, "samples");
const ai = readFileSync(join(dir, "ai-post.md"), "utf8");
const human = readFileSync(join(dir, "human-post.md"), "utf8");

const r = (x: number): string => x.toFixed(3);

console.log("=== 1. Structural separation (paper §5.1, Table 3 analogue) ===");
const aiScore = scoreText(ai);
const humanScore = scoreText(human);
console.log(`AI-style sample:    score ${r(aiScore.score)}  (${aiScore.verdict})`);
console.log(`Human-style sample: score ${r(humanScore.score)}  (${humanScore.verdict})`);
const sep = (aiScore.score + humanScore.score) / 2;
const margin = Math.abs(aiScore.score - humanScore.score);
console.log(`separation margin: ${r(margin)} around midpoint ${r(sep)}`);
console.log(
  margin >= 0.2 && aiScore.score > 0.55 && humanScore.score < 0.45
    ? "PASS: samples land on opposite sides of the midpoint with a clear margin"
    : "FAIL: samples did not separate",
);

console.log("\n=== 2. Rewording robustness (paper §5.4, Table 4 analogue) ===");
const lex = rewordLexical(ai);
const de = rewordDeSignpost(ai);
const lexScore = scoreText(lex.text);
const deScore = scoreText(de.text);

const row = (
  label: string,
  structural: number,
  lexical: number,
  edits: number,
): void => {
  console.log(
    `${label.padEnd(24)} structural ${r(structural)}   lexical-tell ${r(lexical)}   edits ${edits}`,
  );
};

console.log("LAMP-style surface rewording (lexicon, intensifiers, attribution):");
row("original", aiScore.score, aiScore.features.lexicalTellsPer100, 0);
row("reworded", lexScore.score, lexScore.features.lexicalTellsPer100, lex.edits.length);
const lexDrift = Math.abs(lexScore.score - aiScore.score);
console.log(
  lexDrift < 0.1
    ? `PASS: structural drift ${r(lexDrift)} < 0.1 — detection unchanged under rewording`
    : `FAIL: structural drift ${r(lexDrift)} >= 0.1`,
);

console.log("\nDe-signposting attack (also strips roadmap + thesis-restating close):");
row("original", aiScore.score, aiScore.features.lexicalTellsPer100, 0);
row("de-signposted", deScore.score, deScore.features.lexicalTellsPer100, de.edits.length);
const deDrift = Math.abs(deScore.score - aiScore.score);
console.log(
  `structural drift under de-signposting: ${r(deDrift)} — score sags toward the middle ` +
    `(the paper's 187-feature signature has far more redundancy than this 23-signal miniature, ` +
    `and still classifies every attacked post as AI at 98.1 macro-F1)`,
);

console.log("\nTop AI-leaning signals on the AI sample (SHAP-style breakdown analogue):");
for (const s of aiScore.signals.slice(0, 5)) {
  console.log(`  ${s.contribution >= 0 ? "+" : ""}${s.contribution.toFixed(3)}  ${s.name}`);
}

console.log("\n=== 3. The two poles: detector skill vs humanizer skill ===");
const h = humanizeWithReport(ai);
const hLex = scoreText(h.text).features.lexicalTellsPer100;
row("humanized", h.report!.after, hLex, h.edits.length);
console.log(
  `verdict ${h.report!.beforeVerdict} -> ${h.report!.afterVerdict}; ` +
    `${h.flaggedForGaps.length} gaps flagged for a human (never fabricated). ` +
    `The detector skill reads the residual AI-leaning signals; the humanizer\n` +
    `skill owns the gaps. Both run the same feature extractor (src/detector.ts),\n` +
    `so neither can score on different terms — see RESEARCH.md §4.`,
);

console.log("\n=== 4. Structural rarity (the paper's rarity finding, miniature) ===");
// The second axis: a post's structural configuration scored against a
// POOLED reference corpus (human + AI posts together) via mean distance to
// its k nearest neighbors in z-scored structural feature space, converted
// to a percentile against the pooled distribution of member k-NN distances.
const { pool, humanIndex, aiIndex } = buildDefaultPool(human, ai);
const armOf = (sources: readonly string[]): number[] =>
  pool.entries
    .map((e, i) => (sources.includes(e.source) ? i : -1))
    .filter((i) => i >= 0);
const humanArm = armOf(["human", "generated-human"]);
const aiArm = armOf(["ai", "generated-ai"]);

const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
const sd = (xs: number[]): number => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
};
const armPcts = (indices: number[]): number[] =>
  indices.map((i) => memberRarity(i, pool).percentile);
const humanPcts = armPcts(humanArm);
const aiPcts = armPcts(aiArm);
const humanMean = mean(humanPcts);
const aiMean = mean(aiPcts);
const humanSamplePct = memberRarity(humanIndex, pool).percentile;
const aiSamplePct = memberRarity(aiIndex, pool).percentile;

// Cohen's d on the arm percentiles (pooled within-group SD) — the
// paper's effect size for the rarity finding, in miniature.
const pooledSd = Math.sqrt(
  ((humanPcts.length - 1) * sd(humanPcts) ** 2 +
    (aiPcts.length - 1) * sd(aiPcts) ** 2) /
    (humanPcts.length + aiPcts.length - 2),
);
const cohensD = (humanMean - aiMean) / pooledSd;

// The rarest fifth of the pooled configurations (paper: the rarest 1%).
const ranked = pool.entries
  .map((_, i) => i)
  .sort((a, b) => memberRarity(b, pool).percentile - memberRarity(a, pool).percentile);
const fifth = Math.max(1, Math.floor(pool.entries.length / 5));
const rarest = ranked.slice(0, fifth);
const humanRarest = rarest.filter((i) => humanArm.includes(i)).length;
const aiRarest = rarest.filter((i) => aiArm.includes(i)).length;

// The mechanism: within-arm crowding in z-space.
const humanSpread = meanPairwiseDistance(pool, humanArm);
const aiSpread = meanPairwiseDistance(pool, aiArm);

console.log(
  `pooled reference: ${pool.entries.length} deterministic configurations ` +
    `(${humanArm.length} human-arm, ${aiArm.length} AI-arm), ` +
    `k = ${pool.k} (paper: 13,500 posts, k = 25)`,
);
console.log(
  `human sample: percentile ${r(humanSamplePct)} (${memberRarity(humanIndex, pool).reading});` +
    `  AI sample: percentile ${r(aiSamplePct)} (${memberRarity(aiIndex, pool).reading})`,
);
console.log(
  `arm mean percentiles: human ${r(humanMean)} vs AI ${r(aiMean)}` +
    `  (paper: 0.838 vs 0.435)`,
);
console.log(`miniature Cohen's d: ${r(cohensD)}  (paper: 1.83)`);
console.log(
  `rarest fifth (${fifth} of ${pool.entries.length}): ${humanRarest} human vs ${aiRarest} AI` +
    `  (paper's rarest 1%: 149 human vs 4 AI)`,
);
console.log(
  `within-arm spread (mean pairwise z-distance): human ${r(humanSpread)} vs AI ${r(aiSpread)}` +
    ` — human configurations spread, AI configurations crowd: the mechanism`,
);
const directionPass =
  humanMean > aiMean + 0.15 && humanSamplePct > aiSamplePct;
console.log(
  directionPass
    ? `PASS: direction reproduced — human arm mean ${r(humanMean)} exceeds AI arm mean ` +
      `${r(aiMean)} by more than 0.15, and the human sample (${r(humanSamplePct)}) ` +
      `is rarer than the AI sample (${r(aiSamplePct)})`
    : `FAIL: direction not reproduced (arm means ${r(humanMean)} vs ${r(aiMean)}; ` +
      `samples ${r(humanSamplePct)} vs ${r(aiSamplePct)})`,
);
console.log(
  `scale honesty: exact values are illustrative. At ${pool.entries.length} configurations ` +
    `percentiles move in 1/${pool.entries.length} steps, and the human sample is the centroid ` +
    `of its own arm — its own diverse mutations out-rare it — so the paper's 0.838 arm mean ` +
    `is only reachable against the full 13,500-post pool. The direction is the finding.`,
);
