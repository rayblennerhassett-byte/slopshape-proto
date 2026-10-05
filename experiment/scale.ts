#!/usr/bin/env bun
/**
 * experiment/scale.ts — the pool-scaling experiment.
 *
 * Question: the plan's original test thresholds were sample-level —
 * human sample rarity >= 0.7, AI sample rarity <= 0.6 — modelled on
 * the paper's arm means (0.838 vs 0.435). At the default 17-config
 * pool the human sample sits at 0.412: unreachable. Is that a
 * SCALE problem (too few configurations) or a STRUCTURAL one?
 *
 * Method: keep the plan's own construction rule — both arms built
 * from the same two samples with the same mutation machinery — but
 * grow the mutation vocabulary combinatorially. Tiers add deeper
 * mutation combinations: single-feature (the shipped 17-config
 * design), pairs, triples, quads, and the full 2^6-1 = 63-combination
 * space (131 configurations). Every configuration is deterministic:
 * no model calls, no randomness.
 *
 * A second probe holds the human arm at the shipped single-feature
 * breadth but grows the AI arm to the full combination space, which
 * drops the human share of the pool to ~11% — the paper's pooled
 * corpus is ~85% AI / ~15% human — to test whether arm balance,
 * not size, is the binding constraint.
 *
 * Validation: with no argument this runs on the shipped pair and
 * every samples/<dir>/ pair on disk, then reports a cross-pair
 * table — does the composition finding (probe passes both
 * thresholds, mechanism inverts at combinatorial depth, the
 * single-feature tier reproduces the paper's direction) hold
 * beyond the shipped pair? Pass a pair name or directory to
 * run one pair.
 *
 * Run: bun run scale [pairName|dir]
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { humanize } from "../src/humanize";
import {
  buildReferencePool,
  memberRarity,
  meanPairwiseDistance,
  type PoolEntry,
} from "../src/rarity";
import { rewordDeSignpost, rewordLexical } from "../src/reword";
import { MUTATIONS } from "../src/pool";

const SAMPLES_ROOT = join(import.meta.dir, "..", "samples");

interface PairSpec {
  name: string;
  dir: string;
  human: string;
  ai: string;
}

function loadPair(name: string, dir: string): PairSpec {
  return {
    name,
    dir,
    human: readFileSync(join(dir, "human-post.md"), "utf8"),
    ai: readFileSync(join(dir, "ai-post.md"), "utf8"),
  };
}

/**
 * The shipped pair plus every samples/<dir>/ pair on disk — or one
 * pair when a pair name (or explicit directory) is passed on the
 * command line.
 */
function discoverPairs(arg?: string): PairSpec[] {
  if (arg) {
    // Accept a pair name under samples/ or an explicit path.
    const named = join(SAMPLES_ROOT, arg);
    const dir = existsSync(named) ? named : resolve(arg);
    return [loadPair(basename(dir), dir)];
  }
  const hasBoth = (d: string) =>
    existsSync(join(d, "human-post.md")) && existsSync(join(d, "ai-post.md"));
  const pairs: PairSpec[] = [];
  if (hasBoth(SAMPLES_ROOT)) pairs.push(loadPair("shipped", SAMPLES_ROOT));
  for (const ent of readdirSync(SAMPLES_ROOT, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const d = join(SAMPLES_ROOT, ent.name);
    if (hasBoth(d)) pairs.push(loadPair(ent.name, d));
  }
  if (pairs.length === 0) {
    throw new Error(
      `no sample pairs (human-post.md + ai-post.md) under ${SAMPLES_ROOT}`,
    );
  }
  return pairs;
}

/**
 * The mutation vocabulary in application order. "truncated" is
 * applied FIRST: truncating after an append would cut the appended
 * tail off, collapsing every combination that contains both into a
 * bare truncated post and silently removing the diversity the
 * deeper tiers exist to measure.
 */
const ORDERED: ReadonlyArray<readonly [string, (t: string) => string]> = [
  MUTATIONS[5], // truncated
  ...MUTATIONS.slice(0, 5),
];

/** Apply the mutations selected by a bitmask, in canonical order. */
function applyCombo(text: string, mask: number): string {
  let out = text;
  for (let i = 0; i < ORDERED.length; i++) {
    if (mask & (1 << i)) out = ORDERED[i][1](out);
  }
  return out;
}

/** All non-empty mutation subsets of size <= maxSize, ascending. */
function comboMasks(maxSize: number): number[] {
  const masks: number[] = [];
  for (let mask = 1; mask < (1 << ORDERED.length); mask++) {
    let bits = 0;
    for (let i = 0; i < ORDERED.length; i++) {
      if (mask & (1 << i)) bits += 1;
    }
    if (bits <= maxSize) masks.push(mask);
  }
  return masks;
}

/**
 * Build a pooled reference corpus with independent arm breadth:
 * the human arm takes combinations up to humanMax, the AI arm up
 * to aiMax. Equal values reproduce the plan's symmetric design.
 */
function buildScaledPool(
  human: string,
  ai: string,
  humanMax: number,
  aiMax: number,
) {
  const entries: PoolEntry[] = [];
  entries.push({ label: "human sample", source: "human", text: human });
  entries.push({
    label: "humanized AI sample",
    source: "generated-human",
    text: humanize(ai).text,
  });
  for (const mask of comboMasks(humanMax)) {
    entries.push({
      label: `human sample + combo ${mask.toString(2).padStart(6, "0")}`,
      source: "human",
      text: applyCombo(human, mask),
    });
  }
  const aiIndex = entries.length;
  entries.push({ label: "AI sample", source: "ai", text: ai });
  entries.push({
    label: "AI sample + lexical rewording",
    source: "generated-ai",
    text: rewordLexical(ai).text,
  });
  entries.push({
    label: "AI sample + de-signposted",
    source: "generated-ai",
    text: rewordDeSignpost(ai).text,
  });
  for (const mask of comboMasks(aiMax)) {
    entries.push({
      label: `AI sample + combo ${mask.toString(2).padStart(6, "0")}`,
      source: "ai",
      text: applyCombo(ai, mask),
    });
  }
  return { pool: buildReferencePool(entries), humanIndex: 0, aiIndex };
}

interface TierResult {
  name: string;
  poolSize: number;
  k: number;
  humanShare: number;
  humanSamplePct: number;
  aiSamplePct: number;
  humanMean: number;
  aiMean: number;
  cohensD: number;
  humanSpread: number;
  aiSpread: number;
  rarestFifth: string;
}

const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
const sd = (xs: number[]): number => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
};

function measure(pair: PairSpec, humanMax: number, aiMax: number): TierResult {
  const { pool, humanIndex, aiIndex } = buildScaledPool(
    pair.human,
    pair.ai,
    humanMax,
    aiMax,
  );
  const armOf = (sources: readonly string[]): number[] =>
    pool.entries
      .map((e, i) => (sources.includes(e.source) ? i : -1))
      .filter((i) => i >= 0);
  const humanArm = armOf(["human", "generated-human"]);
  const aiArm = armOf(["ai", "generated-ai"]);

  const humanPcts = humanArm.map((i) => memberRarity(i, pool).percentile);
  const aiPcts = aiArm.map((i) => memberRarity(i, pool).percentile);
  const humanMean = mean(humanPcts);
  const aiMean = mean(aiPcts);
  const pooledSd = Math.sqrt(
    ((humanPcts.length - 1) * sd(humanPcts) ** 2 +
      (aiPcts.length - 1) * sd(aiPcts) ** 2) /
      (humanPcts.length + aiPcts.length - 2),
  );

  const ranked = pool.entries
    .map((_, i) => i)
    .sort((a, b) => memberRarity(b, pool).percentile - memberRarity(a, pool).percentile);
  const fifth = Math.max(1, Math.floor(pool.entries.length / 5));
  const rarest = ranked.slice(0, fifth);
  const humanRarest = rarest.filter((i) => humanArm.includes(i)).length;

  return {
    name: pair.name,
    poolSize: pool.entries.length,
    k: pool.k,
    humanShare: humanArm.length / pool.entries.length,
    humanSamplePct: memberRarity(humanIndex, pool).percentile,
    aiSamplePct: memberRarity(aiIndex, pool).percentile,
    humanMean,
    aiMean,
    cohensD: (humanMean - aiMean) / pooledSd,
    humanSpread: meanPairwiseDistance(pool, humanArm),
    aiSpread: meanPairwiseDistance(pool, aiArm),
    rarestFifth: `${humanRarest}/${rarest.length}`,
  };
}

const f3 = (x: number): string => x.toFixed(3);

const TIERS: ReadonlyArray<readonly [string, number]> = [
  ["single-feature (shipped design)", 1],
  ["pairs", 2],
  ["triples", 3],
  ["quads", 4],
  ["full combinatorial (2^6-1)", 6],
];

/** What the cross-pair validation needs from one pair's run. */
interface PairVerdict {
  name: string;
  probePoolSize: number;
  probeHumanShare: number;
  probeHumanPct: number;
  probeAiPct: number;
  probeHumanMean: number;
  probeAiMean: number;
  probeCohensD: number;
  probeHumanMet: boolean;
  probeAiMet: boolean;
  /** Any symmetric tier flips both sample-level thresholds. */
  flippedTier: string | null;
  /** Human spread contracts, AI spread grows, AI mean leads from pairs on. */
  inverted: boolean;
  /** Single-feature tier reproduces the paper's direction (human > AI). */
  shippedDirection: boolean;
  /** The single-feature tier's human-minus-AI arm-mean margin. */
  shippedMargin: number;
  /** That margin clears the 0.15 the shipped tests assert. */
  marginMet: boolean;
}

function verdictFor(name: string, results: TierResult[], probe: TierResult): PairVerdict {
  const single = results[0];
  const full = results[results.length - 1];
  const flipped = results.find((r) => r.humanSamplePct >= 0.7 && r.aiSamplePct <= 0.6);
  return {
    name,
    probePoolSize: probe.poolSize,
    probeHumanShare: probe.humanShare,
    probeHumanPct: probe.humanSamplePct,
    probeAiPct: probe.aiSamplePct,
    probeHumanMean: probe.humanMean,
    probeAiMean: probe.aiMean,
    probeCohensD: probe.cohensD,
    probeHumanMet: probe.humanSamplePct >= 0.7,
    probeAiMet: probe.aiSamplePct <= 0.6,
    flippedTier: flipped ? flipped.name : null,
    inverted:
      full.humanSpread < single.humanSpread &&
      full.aiSpread > single.aiSpread &&
      results.slice(1).every((r) => r.aiMean > r.humanMean),
    shippedDirection: single.humanMean > single.aiMean,
    shippedMargin: single.humanMean - single.aiMean,
    marginMet: single.humanMean - single.aiMean > 0.15,
  };
}

function printTierTables(results: TierResult[], probe: TierResult): void {
  console.log(
    [
      "tier".padEnd(30),
      "pool".padStart(5),
      "k".padStart(3),
      "human%".padStart(7),
      "AI%".padStart(6),
      "armMean H".padStart(10),
      "armMean A".padStart(10),
      "d".padStart(6),
      "H>=0.7".padStart(7),
      "AI<=0.6".padStart(8),
    ].join(""),
  );
  for (const r of results) {
    const humanMet = r.humanSamplePct >= 0.7 ? "yes" : "NO";
    const aiMet = r.aiSamplePct <= 0.6 ? "yes" : "NO";
    console.log(
      [
        r.name.padEnd(30),
        String(r.poolSize).padStart(5),
        String(r.k).padStart(3),
        f3(r.humanSamplePct).padStart(7),
        f3(r.aiSamplePct).padStart(6),
        f3(r.humanMean).padStart(10),
        f3(r.aiMean).padStart(10),
        f3(r.cohensD).padStart(6),
        humanMet.padStart(7),
        aiMet.padStart(8),
      ].join(""),
    );
  }

  console.log("\n=== Mechanism columns (why) ===");
  console.log(
    [
      "tier".padEnd(30),
      "human share".padStart(12),
      "human spread".padStart(13),
      "AI spread".padStart(10),
      "rarest 5th (human)".padStart(19),
    ].join(""),
  );
  for (const r of results) {
    console.log(
      [
        r.name.padEnd(30),
        f3(r.humanShare).padStart(12),
        f3(r.humanSpread).padStart(13),
        f3(r.aiSpread).padStart(10),
        r.rarestFifth.padStart(19),
      ].join(""),
    );
  }

  console.log("\n=== Probe: the paper's arm balance at full scale ===");
  console.log(
    `pool ${probe.poolSize} configs, human share ${f3(probe.humanShare)} ` +
      `(paper's pooled corpus: ~15% human / ~85% AI)`,
  );
  console.log(
    `human sample percentile ${f3(probe.humanSamplePct)} ` +
      `(threshold >= 0.7: ${probe.humanSamplePct >= 0.7 ? "MET" : "not met"}); ` +
      `AI sample percentile ${f3(probe.aiSamplePct)} ` +
      `(threshold <= 0.6: ${probe.aiSamplePct <= 0.6 ? "MET" : "not met"})`,
  );
  console.log(
    `arm means ${f3(probe.humanMean)} vs ${f3(probe.aiMean)} ` +
      `(paper: 0.838 vs 0.435); Cohen's d ${f3(probe.cohensD)} (paper: 1.83)`,
  );
}

console.log("=== Pool-scaling experiment ===");
console.log(
  "Construction rule held fixed (both arms from the same two samples);",
);
console.log("only the mutation vocabulary grows. k caps at the paper's 25.\n");

const pairs = discoverPairs(process.argv[2]);
const verdicts: PairVerdict[] = [];
for (const pair of pairs) {
  console.log(`\n=== Pair: ${pair.name} (${pair.dir}) ===\n`);
  const results = TIERS.map(([, maxSize]) => measure(pair, maxSize, maxSize));
  const probe = measure(pair, 1, 6);
  printTierTables(results, probe);
  verdicts.push(verdictFor(pair.name, results, probe));
}

console.log("\n=== Cross-pair validation ===");
console.log(
  [
    "pair".padEnd(10),
    "probe pool".padStart(11),
    "probe H%".padStart(9),
    "H>=0.7".padStart(7),
    "probe AI%".padStart(10),
    "AI<=0.6".padStart(8),
    "probe d".padStart(8),
    "inverted".padStart(9),
    "dir margin".padStart(11),
  ].join(""),
);
for (const v of verdicts) {
  console.log(
    [
      v.name.padEnd(10),
      String(v.probePoolSize).padStart(11),
      f3(v.probeHumanPct).padStart(9),
      (v.probeHumanMet ? "MET" : "NO").padStart(7),
      f3(v.probeAiPct).padStart(10),
      (v.probeAiMet ? "MET" : "NO").padStart(8),
      f3(v.probeCohensD).padStart(8),
      (v.inverted ? "yes" : "NO").padStart(9),
      (f3(v.shippedMargin) + (v.marginMet ? "" : "*")).padStart(11),
    ].join(""),
  );
}
console.log("(* direction holds, but the margin is below the tests' 0.15)");

console.log("\n=== Verdict ===");
const held = verdicts.filter(
  (v) => v.probeHumanMet && v.probeAiMet && v.inverted && v.shippedDirection,
);
const failed = verdicts.filter((v) => !held.includes(v));
const anyFlipped = verdicts.find((v) => v.flippedTier !== null);
const marginShortfalls = verdicts.filter((v) => v.shippedDirection && !v.marginMet);

if (anyFlipped) {
  console.log(
    `Unexpected: the ${anyFlipped.name} pair flips both sample-level ` +
      `thresholds at the ${anyFlipped.flippedTier} tier — the plan's ` +
      `thresholds are reachable under symmetric scaling for this pair.`,
  );
} else {
  console.log(
    `The plan's original sample-level thresholds never flip under the plan's ` +
      `own construction rule, on any pair. Human-sample percentile across ` +
      `tiers, per pair:`,
  );
  for (const v of verdicts) {
    console.log(`  ${v.name.padEnd(8)}: never (probe reaches ${f3(v.probeHumanPct)} only at paper balance)`);
  }
}

if (failed.length === 0) {
  console.log(
    `\nThe composition finding holds on all ${held.length} pairs. ` +
      `At the paper's arm balance the same machinery passes both ` +
      `thresholds on every pair:`,
  );
  for (const v of verdicts) {
    console.log(
      `  ${v.name.padEnd(8)} human ${f3(v.probeHumanPct)} / AI ${f3(v.probeAiPct)} ` +
        `(share ${f3(v.probeHumanShare)}), arm means ${f3(v.probeHumanMean)} vs ` +
        `${f3(v.probeAiMean)}, d ${f3(v.probeCohensD)} (paper: 0.838 vs 0.435, d 1.83)`,
    );
  }
  console.log(
    `  And on every pair the mechanism inverts with vocabulary depth: ` +
      `the human arm converges (each dimension is activated at most once) ` +
      `while the AI arm stacks on the AI sample's high baseline and spreads ` +
      `into the pool's rare region, so from the pairs tier the AI arm mean ` +
      `exceeds the human's — and the single-feature tier is the only one ` +
      `that reproduces the paper's direction.`,
  );
  if (marginShortfalls.length > 0) {
    const shortfalls = marginShortfalls
      .map((v) => `${v.name} ${f3(v.shippedMargin)}`)
      .join(", ");
    const shipped = verdicts.find((v) => v.name === "shipped");
    const detail = shipped
      ? ` below the tests' 0.15; shipped pair ${f3(shipped.shippedMargin)}). The direction holds on every ` +
        `pair, but the margin the tests assert is widest on the shipped ` +
        `pair — a third pair could plausibly fall below it while still ` +
        `pointing the right way.`
      : ` below the tests' 0.15). The direction holds on every pair in ` +
        `this run, but the margin is pair-dependent — a pair outside ` +
        `this run could plausibly fall below the tests' 0.15 while ` +
        `still pointing the right way.`;
    console.log(
      `  Caveat: the single-feature direction margin is pair-dependent ` +
        `(${shortfalls}${detail}`,
    );
  }
  console.log(
    `  Conclusion: the plan's thresholds were mis-specified twice — against ` +
      `the wrong statistic (the percentile of two sample posts, where the ` +
      `paper reports arm means over 13,500 posts) and the wrong pool ` +
      `composition (a 50/50 synthetic balance, where the paper pools ~85% ` +
      `AI). The shipped 17-config design is the only symmetric tier where ` +
      `the paper's direction and mechanism hold; the tests' direction-based ` +
      `assertions (arm means with a 0.15 margin, human sample rarer than ` +
      `AI sample) are the correct miniature, and this experiment — now on ` +
      `${held.length} independent sample pairs — is the evidence that the ` +
      `literal thresholds were mis-specified, not unimplemented.`,
  );
} else {
  console.log(
    `\nThe composition finding does NOT hold on every pair. Deviations:`,
  );
  for (const v of failed) {
    const issues: string[] = [];
    if (!v.probeHumanMet) issues.push(`probe human percentile ${f3(v.probeHumanPct)} < 0.7`);
    if (!v.probeAiMet) issues.push(`probe AI percentile ${f3(v.probeAiPct)} > 0.6`);
    if (!v.inverted) issues.push("mechanism does not invert at combinatorial depth");
    if (!v.shippedDirection) issues.push("single-feature tier does not reproduce the paper's direction");
    console.log(`  ${v.name}: ${issues.join("; ")}`);
  }
  console.log(
    `  So composition, not size, is the binding constraint on the pairs ` +
      `where the finding held, but the result is sample-dependent: a pair ` +
      `whose human and AI samples are structurally closer (or whose human ` +
      `sample carries template features) does not reproduce the paper's ` +
      `mechanism. Treat the 17-config design's direction as the shipped ` +
      `claim, and this table as the boundary of its generalization.`,
  );
}
