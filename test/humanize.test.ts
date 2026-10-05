import { describe, expect, test } from "bun:test";
import { scoreText } from "../src/detector";
import { humanize, humanizeWithReport } from "../src/humanize";

const aiPost = await Bun.file(new URL("../samples/ai-post.md", import.meta.url)).text();
const humanPost = await Bun.file(new URL("../samples/human-post.md", import.meta.url)).text();

describe("humanize (Table 6 playbook)", () => {
  test("it flips every mechanically detectable AI core feature", () => {
    const f = scoreText(humanize(aiPost).text).features;
    expect(f.titlePayoff).toBe(false); // PUR_OUT_003
    expect(f.thesisAnnounced).toBe(false); // STR_FLW_006
    expect(f.summaryStage).toBe(false); // STR_STG_001
    expect(f.summaryClose).toBe(false); // STR_STG_008
    expect(f.vagueAttribution).toBe(false);
  });

  test("it drops the AI-style sample out of the AI range — but not to certain-human", () => {
    // The paper's own prediction: surface edits alone cannot beat the full
    // structural signature. The honest outcome is "ambiguous, gaps flagged".
    const { report } = humanizeWithReport(aiPost);
    expect(report!.delta).toBeLessThan(-0.15);
    expect(report!.after).toBeLessThanOrEqual(0.55);
    expect(report!.afterVerdict).not.toBe("very likely AI");
  });

  test("every edit was a real change (no silent no-op rules)", () => {
    const r = humanize(aiPost);
    expect(r.edits.length).toBeGreaterThan(0);
    for (const e of r.edits) expect(e.count).toBeGreaterThan(0);
  });

  test("claims survive: topical vocabulary is preserved", () => {
    const vocab = new Set((humanize(aiPost).text.toLowerCase().match(/[a-z]+/g) ?? []));
    for (const claim of ["onboarding", "buddy", "checklist", "automate", "retention"]) {
      expect(vocab.has(claim)).toBe(true);
    }
  });

  test("nothing is fabricated: the rule set only removes or rewrites", () => {
    // The honest gaps the engine refuses to fake — computed on the output.
    const gaps = humanize(aiPost).flaggedForGaps.join("\n");
    expect(gaps).toContain("anecdote");
    expect(gaps).toContain("byline");
    // The evidence rules erased the vague attribution, so no "sources" gap:
    // that gap only fires when rewrite-attribution leaves something behind.
    expect(gaps).not.toContain("sources");
  });

  test("report residuals name what still leans AI", () => {
    const { report } = humanizeWithReport(aiPost);
    expect(report!.residual.every((s) => s.contribution > 0)).toBe(true);
  });

  test("it does not strip an already-human post", () => {
    const before = scoreText(humanPost).score;
    const { text, report } = humanizeWithReport(humanPost);
    expect(report!.delta).toBeGreaterThanOrEqual(-0.05);
    expect(scoreText(text).score).toBeGreaterThanOrEqual(before - 0.05);
  });
});
