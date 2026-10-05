/**
 * rarity.ts — the structural-rarity axis (the SlopShape paper's
 * rarity finding), as a second, independent axis alongside the
 * 0–1 template score in src/detector.ts.
 *
 * The paper's finding: human posts occupy RARE structural
 * configurations. For every post in a pooled corpus (human + AI
 * posts together), they measure the mean Euclidean distance to
 * its 25 nearest neighbors in the z-scored structural feature
 * space, and convert that distance to a percentile against the
 * pooled reference distribution. Human posts average the 0.838
 * percentile, AI posts 0.435 (Cohen's d = 1.83); the rarest 1%
 * of configurations holds 149 human posts against 4 AI posts.
 *
 * The reference pool MUST be pooled. The effect is
 * human-diversity-vs-AI-crowding: human writers spread across
 * configurations while AI generation crowds into a tight cluster.
 * A human-only pool would invert the axis into mere atypicality
 * from the human norm — an AI post would look "rare" for being
 * far from human writing, which is the opposite of the paper's
 * result.
 *
 * scoreText() stays pure and untouched; this module reads the
 * same feature extractor (extractFeatures) but never feeds back
 * into the template score. The deliberately non-structural
 * lexical channel (lexicalTellsPer100) is EXCLUDED from the
 * vector on purpose: the rarity axis is the paper's structural
 * finding, and a reworded post must not change it.
 *
 * Scale honesty: the paper pools 13,500 posts with k = 25. The
 * default pool (src/pool.ts) is 17 configurations built
 * deterministically from the two samples, so k is capped at
 * pool size - 1 and
 * percentiles move in 1/n steps. The direction is the finding;
 * exact values are illustrative, not calibrated.
 */

import { extractFeatures, type Features } from "./detector";

/** The paper's neighbor count. Capped at pool size - 1 in practice. */
export const K_NEIGHBORS = 25;

export type PoolSource = "human" | "generated-human" | "ai" | "generated-ai";

export interface PoolEntry {
  label: string;
  source: PoolSource;
  text: string;
}

export interface ReferencePool {
  /** Feature names of the structural vector, in z-scored order. */
  readonly dims: readonly string[];
  /** The pool's own entries, texts included — the pool is self-contained. */
  readonly entries: ReadonlyArray<{
    label: string;
    source: PoolSource;
    text: string;
  }>;
  /** Per-dimension mean / sd over the pool — the z-scoring basis. */
  readonly means: readonly number[];
  readonly sds: readonly number[];
  /** Z-scored structural vectors, one per entry. */
  readonly vectors: ReadonlyArray<readonly number[]>;
  /** Mean distance to the k nearest other members, one per entry (self excluded). */
  readonly nnDistances: readonly number[];
  /** Effective neighbor count: min(K_NEIGHBORS, poolSize - 1). */
  readonly k: number;
}

export interface RarityResult {
  /**
   * 0..1 — where the post's k-NN distance sits in the pooled
   * reference distribution of k-NN distances. Higher = rarer
   * configuration (the human-diverse region in the paper's data).
   */
  percentile: number;
  /** Mean Euclidean distance to the k nearest reference configurations (z-space). */
  meanNNDistance: number;
  k: number;
  poolSize: number;
  reading: string;
}

/**
 * The structural feature vector. Booleans enter as 0/1, densities
 * as their per-100 / per-300 values, wordCount and
 * firstProblemParagraph raw (z-scoring absorbs the scale).
 * lexicalTellsPer100 is deliberately absent — see the module
 * header.
 */
const VECTOR: ReadonlyArray<readonly [string, (f: Features) => number]> = [
  ["wordCount", (f) => f.wordCount],
  ["byline", (f) => (f.bylinePresent ? 1 : 0)],
  ["titlePayoff", (f) => (f.titlePayoff ? 1 : 0)],
  ["thesisAnnounced", (f) => (f.thesisAnnounced ? 1 : 0)],
  ["summaryStage", (f) => (f.summaryStage ? 1 : 0)],
  ["summaryClose", (f) => (f.summaryClose ? 1 : 0)],
  ["externalPathway", (f) => (f.externalPathway ? 1 : 0)],
  ["legacyContrast", (f) => (f.legacyContrast ? 1 : 0)],
  ["stakesEscalation", (f) => (f.stakesEscalation ? 1 : 0)],
  ["voiceEditorial", (f) => (f.voiceEditorial ? 1 : 0)],
  ["firstProblemParagraph", (f) => f.firstProblemParagraph],
  ["secondPersonPer100", (f) => f.secondPersonPer100],
  ["selfReferencePer100", (f) => f.selfReferencePer100],
  ["hedgesPer100", (f) => f.hedgesPer100],
  ["namedAttributionPer100", (f) => f.namedAttributionPer100],
  ["vagueAttribution", (f) => (f.vagueAttribution ? 1 : 0)],
  ["baselineDisclosure", (f) => (f.baselineDisclosure ? 1 : 0)],
  ["numericPer100", (f) => f.numericPer100],
  ["ctaCount", (f) => f.ctaCount],
  ["executionSupport", (f) => (f.executionSupport ? 1 : 0)],
  ["headingsPer300", (f) => f.headingsPer300],
  ["bulletsPer300", (f) => f.bulletsPer300],
  ["numberedProcedure", (f) => (f.numberedProcedure ? 1 : 0)],
  ["interviewFormat", (f) => (f.interviewFormat ? 1 : 0)],
  ["firstPersonAnecdote", (f) => (f.firstPersonAnecdote ? 1 : 0)],
];

function vectorOf(text: string): number[] {
  const f = extractFeatures(text);
  return VECTOR.map(([, get]) => get(f));
}

function zscore(
  vec: readonly number[],
  means: readonly number[],
  sds: readonly number[],
): number[] {
  // A constant dimension (sd = 0) contributes nothing to any
  // distance — z = 0 for every member, by construction.
  return vec.map((x, i) => (sds[i] > 0 ? (x - means[i]) / sds[i] : 0));
}

function euclidean(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Exact structural equality. Because vectors and z-scoring are
 * deterministic, a query re-scored from a pool member's text
 * produces a bit-identical vector — so this identifies the
 * query's own membership (and structural duplicates of it).
 */
function sameVector(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function meanNearestNeighborDistance(
  v: readonly number[],
  others: ReadonlyArray<readonly number[]>,
  k: number,
): number {
  if (k <= 0 || others.length === 0) return 0;
  const distances = others.map((o) => euclidean(v, o)).sort((x, y) => x - y);
  const take = Math.min(k, distances.length);
  return distances.slice(0, take).reduce((s, d) => s + d, 0) / take;
}

/** Percentile of a k-NN distance against the pooled reference distribution. */
function percentileIn(pool: ReferencePool, meanNN: number): number {
  const ref = pool.nnDistances;
  if (ref.length === 0) return 0.5; // no reference population: no information
  return ref.filter((d) => d <= meanNN).length / ref.length;
}

/**
 * Build a reference pool from raw entries: z-score every member's
 * structural vector against the pool's own per-dimension mean/sd,
 * then record each member's mean distance to its k nearest other
 * members (self excluded). Those distances are the pooled
 * reference distribution that queries are percentile-ranked against.
 */
export function buildReferencePool(
  entries: ReadonlyArray<PoolEntry>,
): ReferencePool {
  const dims = VECTOR.map(([name]) => name);
  if (entries.length === 0) {
    return { dims, entries: [], means: [], sds: [], vectors: [], nnDistances: [], k: 0 };
  }
  const raw = entries.map((e) => vectorOf(e.text));
  const means = dims.map((_, i) => raw.reduce((s, v) => s + v[i], 0) / raw.length);
  const sds = dims.map(
    (_, i) => Math.sqrt(raw.reduce((s, v) => s + (v[i] - means[i]) ** 2, 0) / raw.length),
  );
  const vectors = raw.map((v) => zscore(v, means, sds));
  const k = Math.max(0, Math.min(K_NEIGHBORS, entries.length - 1));
  const nnDistances = vectors.map((v, i) =>
    meanNearestNeighborDistance(
      v,
      vectors.filter((_, j) => j !== i),
      k,
    ),
  );
  return {
    dims,
    entries: entries.map(({ label, source, text }) => ({
      label,
      source,
      text,
    })),
    means,
    sds,
    vectors,
    nnDistances,
    k,
  };
}

/**
 * Score a post against a reference pool. The query's k-NN
 * distance is measured against the members, then
 * percentile-ranked against the members' own k-NN distances.
 *
 * Leave-self-out: a member whose z-vector equals the query's is
 * the query itself (or a structural duplicate), not a neighbor —
 * the paper ranks every post against OTHER posts. Without this,
 * scoring a pool member's own text would include a distance-0
 * self-match, deflating its k-NN distance and understating its
 * rarity. Truly external queries have no exact match and keep
 * every member as a neighbor.
 */
export function rarityOf(text: string, pool: ReferencePool): RarityResult {
  const z = zscore(vectorOf(text), pool.means, pool.sds);
  const neighbors = pool.vectors.filter((v) => !sameVector(z, v));
  const meanNN = meanNearestNeighborDistance(z, neighbors, pool.k);
  const percentile = percentileIn(pool, meanNN);
  return {
    percentile,
    meanNNDistance: meanNN,
    k: pool.k,
    poolSize: pool.entries.length,
    reading: rarityReading(percentile),
  };
}

/**
 * Score a pool member against the pool's own distribution. The
 * member's recorded k-NN distance (self excluded at build time)
 * is ranked against every member's distance — self included in
 * the reference distribution, exactly as the paper ranks every
 * post against the pooled corpus.
 */
export function memberRarity(index: number, pool: ReferencePool): RarityResult {
  const meanNN = pool.nnDistances[index] ?? 0;
  const percentile = percentileIn(pool, meanNN);
  return {
    percentile,
    meanNNDistance: meanNN,
    k: pool.k,
    poolSize: pool.entries.length,
    reading: rarityReading(percentile),
  };
}

/**
 * Bands for a rarity percentile. High percentile = rare
 * configuration (where human posts live in the paper's data);
 * low percentile = crowded configuration (where AI posts live).
 */
export function rarityReading(percentile: number): string {
  if (percentile >= 0.8) return "rare";
  if (percentile >= 0.6) return "uncommon";
  if (percentile >= 0.4) return "typical";
  return "crowded";
}

/**
 * The two axes read together: the 0–1 template score (which side
 * of the AI/human template a post is on) against the rarity
 * percentile (how crowded the post's structural configuration is).
 * The four corners are the interesting cells; middling values on
 * either axis are reported as such rather than forced into a cell.
 */
export function twoAxisReading(templateScore: number, percentile: number): string {
  const aiShaped = templateScore >= 0.55;
  const humanShaped = templateScore < 0.45;
  const rare = percentile >= 0.7;
  const crowded = percentile < 0.4;
  if (aiShaped && crowded) {
    return "AI-shaped template in a crowded structural region — the paper's AI profile: the tidy template in a common configuration";
  }
  if (aiShaped && rare) {
    return "AI-shaped template in a rare structural region — atypical: the template fired, but the configuration is unusual (inspect, don't assume)";
  }
  if (humanShaped && rare) {
    return "Human-shaped template in a rare structural region — the paper's human profile: an individual configuration, not the crowded AI one";
  }
  if (humanShaped && crowded) {
    return "Human-shaped template in a crowded structural region — atypical: a human-shaped post in a common configuration (inspect, don't assume)";
  }
  if (!aiShaped && !humanShaped) {
    return `Template score ambiguous (${templateScore.toFixed(2)}); structural rarity ${percentile.toFixed(2)} (${rarityReading(percentile)})`;
  }
  return `Template ${aiShaped ? "AI" : "human"}-shaped; structural rarity middling (${percentile.toFixed(2)}) — between the paper's rare-human and crowded-AI profiles`;
}

/**
 * The crowding measure behind the rarity finding: mean pairwise
 * Euclidean distance between the z-scored vectors of the members
 * at the given indices. Small = the arm crowds into a tight
 * cluster (the AI profile); large = the arm spreads across
 * configurations (the human profile).
 */
export function meanPairwiseDistance(
  pool: ReferencePool,
  indices: ReadonlyArray<number>,
): number {
  const valid = indices.filter((i) => i >= 0 && i < pool.vectors.length);
  if (valid.length < 2) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      sum += euclidean(pool.vectors[valid[i]], pool.vectors[valid[j]]);
      count += 1;
    }
  }
  return count > 0 ? sum / count : 0;
}
