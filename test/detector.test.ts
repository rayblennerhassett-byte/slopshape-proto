import { describe, expect, test } from "bun:test";
import { extractFeatures, NORMALIZER, scoreText, verdictFor } from "../src/detector";

const aiPost = await Bun.file(new URL("../samples/ai-post.md", import.meta.url)).text();
const humanPost = await Bun.file(new URL("../samples/human-post.md", import.meta.url)).text();

describe("feature extraction", () => {
  test("AI sample hits the core Table 6 template features", () => {
    const f = extractFeatures(aiPost);
    expect(f.titlePayoff).toBe(true); // PUR_OUT_003
    expect(f.thesisAnnounced).toBe(true); // STR_FLW_006
    expect(f.summaryStage).toBe(true); // STR_STG_001
    expect(f.summaryClose).toBe(true); // STR_STG_008
    expect(f.legacyContrast).toBe(true); // STR_FLW_005
    expect(f.stakesEscalation).toBe(true); // AUD_STK_005
    expect(f.voiceEditorial).toBe(true); // VOC_VOX_001
    expect(f.vagueAttribution).toBe(true);
    expect(f.ctaCount).toBeGreaterThanOrEqual(2); // VOC_PRT_003
    expect(f.externalPathway).toBe(false); // VOC_PRT_005: absence leans AI
  });

  test("human sample exhibits the human-leaning profile", () => {
    const f = extractFeatures(humanPost);
    expect(f.bylinePresent).toBe(true);
    expect(f.firstPersonAnecdote).toBe(true);
    expect(f.thesisAnnounced).toBe(false);
    expect(f.summaryClose).toBe(false);
    expect(f.titlePayoff).toBe(false);
    expect(f.namedAttributionPer100).toBeGreaterThan(0.1);
    expect(f.hedgesPer100).toBeGreaterThan(0.1);
  });

  test("density features scale with text length", () => {
    const short = extractFeatures("You should sign up now.");
    const long = extractFeatures(aiPost);
    expect(long.wordCount).toBeGreaterThan(short.wordCount);
    // Normalized densities must not exceed their clamps.
    expect(short.secondPersonPer100).toBeGreaterThan(long.secondPersonPer100 / 10);
  });

  test("empty input is handled without NaN", () => {
    const f = extractFeatures("");
    expect(Number.isNaN(f.secondPersonPer100)).toBe(false);
    expect(f.wordCount).toBe(0);
  });
});

describe("scoring", () => {
  test("AI-style post scores above the human-style post", () => {
    const ai = scoreText(aiPost);
    const human = scoreText(humanPost);
    expect(ai.score).toBeGreaterThan(0.6);
    expect(human.score).toBeLessThan(0.4);
    expect(ai.score - human.score).toBeGreaterThan(0.2);
  });

  test("verdicts land on opposite sides", () => {
    expect(verdictFor(0.95)).toBe("very likely AI");
    expect(verdictFor(0.5)).toBe("ambiguous");
    expect(verdictFor(0.05)).toBe("very likely human");
  });

  test("contributions are bounded and sum to the total", () => {
    const r = scoreText(aiPost);
    for (const s of r.signals) {
      expect(Math.abs(s.signal)).toBeLessThanOrEqual(1);
      expect(Math.abs(s.contribution)).toBeLessThanOrEqual(s.weight);
    }
    const sum = r.signals.reduce((acc, s) => acc + s.contribution, 0);
    expect(sum).toBeCloseTo(r.total, 10);
    expect(r.normalizer).toBe(NORMALIZER);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(1);
  });

  test("scoring is deterministic", () => {
    expect(scoreText(aiPost).score).toBe(scoreText(aiPost).score);
  });
});
