import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { extractFeatures, scoreText } from "../src/detector";

const SAMPLES_ROOT = join(import.meta.dir, "..", "samples");

interface Pair {
  name: string;
  human: string;
  ai: string;
}

/**
 * The shipped pair plus every samples/<dir>/ pair on disk.
 * Every fixture pair must satisfy the same profile contract:
 * the AI sample hits the paper's core Table 6 template
 * features, the human sample the human-leaning ones.
 */
function loadPairs(): Pair[] {
  const pairs: Pair[] = [];
  const push = (name: string, dir: string) => {
    const humanPath = join(dir, "human-post.md");
    const aiPath = join(dir, "ai-post.md");
    if (existsSync(humanPath) && existsSync(aiPath)) {
      pairs.push({
        name,
        human: readFileSync(humanPath, "utf8"),
        ai: readFileSync(aiPath, "utf8"),
      });
    }
  };
  push("shipped", SAMPLES_ROOT);
  for (const ent of readdirSync(SAMPLES_ROOT, { withFileTypes: true })) {
    if (ent.isDirectory()) push(ent.name, join(SAMPLES_ROOT, ent.name));
  }
  return pairs;
}

const PAIRS = loadPairs();

describe("sample fixtures", () => {
  test("at least the shipped pair is present", () => {
    expect(PAIRS.length).toBeGreaterThanOrEqual(1);
  });

  for (const p of PAIRS) {
    test(`${p.name}: AI sample hits the core Table 6 template features`, () => {
      const f = extractFeatures(p.ai);
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

    test(`${p.name}: human sample exhibits the human-leaning profile`, () => {
      const f = extractFeatures(p.human);
      expect(f.bylinePresent).toBe(true);
      expect(f.firstPersonAnecdote).toBe(true);
      expect(f.thesisAnnounced).toBe(false);
      expect(f.summaryClose).toBe(false);
      expect(f.titlePayoff).toBe(false);
      expect(f.namedAttributionPer100).toBeGreaterThan(0.1);
      expect(f.hedgesPer100).toBeGreaterThan(0.1);
    });

    test(`${p.name}: AI sample scores above the human sample`, () => {
      const ai = scoreText(p.ai);
      const human = scoreText(p.human);
      expect(ai.score).toBeGreaterThan(0.6);
      expect(human.score).toBeLessThan(0.4);
      expect(ai.score - human.score).toBeGreaterThan(0.2);
    });
  }
});
