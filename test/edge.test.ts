import { describe, expect, test } from "bun:test";
import { extractFeatures, scoreText } from "../src/detector";

const aiPost = await Bun.file(new URL("../samples/ai-post.md", import.meta.url)).text();

describe("edge cases", () => {
  test("empty string scores neutral-ish without crashing", () => {
    const r = scoreText("");
    expect(Number.isFinite(r.score)).toBe(true);
  });

  test("unicode and emoji do not crash extraction", () => {
    const r = scoreText("# 🚀 Görüntülenecek bir şey yok\n\nМы тестируем юникод — and robust unlocks. 🎉");
    expect(Number.isFinite(r.score)).toBe(true);
  });

  test("a text of only headings is scored", () => {
    const r = scoreText("# Title\n\n## A\n\n## B\n\n## C");
    expect(r.features.headingsPer300).toBeGreaterThan(0);
  });

  test("extremely long single line is handled", () => {
    const text = "word ".repeat(50_000);
    expect(Number.isFinite(scoreText(text).score)).toBe(true);
  });

  test("AI post title detected from H1", () => {
    expect(extractFeatures(aiPost).title).toContain("Onboarding");
  });
});
