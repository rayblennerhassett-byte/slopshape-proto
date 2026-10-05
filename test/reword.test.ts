import { describe, expect, test } from "bun:test";
import { scoreText } from "../src/detector";
import { rewordDeSignpost, rewordLexical } from "../src/reword";

const aiPost = await Bun.file(new URL("../samples/ai-post.md", import.meta.url)).text();

describe("rewording attacks", () => {
  test("lexical rewording applies real edits", () => {
    const r = rewordLexical(aiPost);
    expect(r.edits.length).toBeGreaterThan(0);
    expect(r.text).not.toBe(aiPost);
    expect(r.text).toContain("stalls"); // claims preserved
    expect(r.text).toContain("buddy"); // claims preserved
  });

  test("structural score is stable under lexical rewording (paper §5.4)", () => {
    const before = scoreText(aiPost).score;
    const after = scoreText(rewordLexical(aiPost).text).score;
    expect(Math.abs(after - before)).toBeLessThan(0.1);
  });

  test("lexical-tell channel collapses under lexical rewording", () => {
    const before = scoreText(aiPost).features.lexicalTellsPer100;
    const after = scoreText(rewordLexical(aiPost).text).features.lexicalTellsPer100;
    expect(after).toBeLessThan(before / 2);
  });

  test("de-signposting strips the roadmap and the thesis-restating close", () => {
    const f = scoreText(rewordDeSignpost(aiPost).text).features;
    expect(f.thesisAnnounced).toBe(false);
    expect(f.summaryClose).toBe(false);
  });

  test("even de-signposted text still reads net AI-ish (redundant AI markers hold)", () => {
    const after = scoreText(rewordDeSignpost(aiPost).text).score;
    expect(after).toBeGreaterThan(0.4);
  });

  test("claims survive both attacks", () => {
    const forTokens = (t: string): string[] =>
      t.toLowerCase().match(/[a-z]+/g) ?? [];
    const tokens = (t: string): Set<string> => new Set(forTokens(t));
    const claims = ["onboarding", "buddy", "checklist", "automation", "retention"];
    for (const reworded of [rewordLexical(aiPost).text, rewordDeSignpost(aiPost).text]) {
      const vocab = tokens(reworded);
      for (const c of claims) expect(vocab.has(c)).toBe(true);
    }
  });
});
