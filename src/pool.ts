/**
 * pool.ts — the default pooled reference corpus for the rarity
 * axis (src/rarity.ts owns the method).
 *
 * 17 deterministic configurations built from the two sample
 * posts — no model calls, no randomness:
 *
 *  - human arm: the human sample, the humanizer's output on the
 *    AI sample, and six single-feature mutations of the human
 *    sample;
 *  - AI arm: the AI sample, its two rewording variants, and the
 *    same six mutations of the AI sample.
 *
 * Both arms are present by necessity: the axis measures
 * human-diversity-vs-AI-crowding, so a pool of only one arm
 * would invert it into mere atypicality (see the module header
 * of src/rarity.ts).
 *
 * The pool is small on purpose and honest about it: the paper
 * pools 13,500 posts, so here percentiles move in 1/17 steps.
 * The direction is the finding; exact values are illustrative.
 */

import { humanize } from "./humanize";
import {
  buildReferencePool,
  type PoolEntry,
  type ReferencePool,
} from "./rarity";
import { rewordDeSignpost, rewordLexical } from "./reword";

export interface DefaultPool {
  pool: ReferencePool;
  /** Index of the human sample inside pool.entries. */
  humanIndex: number;
  /** Index of the AI sample inside pool.entries. */
  aiIndex: number;
}

/**
 * Title + byline (when present) + the first N body paragraphs.
 * Headings are not paragraphs: counting them would let a
 * sectioned post degenerate into a title plus a bare heading
 * stub, which measures length, not structure. Only prose
 * blocks count toward the budget; headings and front matter
 * that precede the last kept paragraph are kept, in document
 * order, so the truncated post still reads as sections.
 */
function truncateAfterParagraphs(text: string, bodyParagraphs: number): string {
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
  const kept: string[] = [];
  let paragraphs = 0;
  for (const b of blocks) {
    const isFrontMatter = /^#\s/.test(b) || /^by\s+/i.test(b);
    const isHeading = /^#{2,6}\s+/.test(b);
    if (isFrontMatter || isHeading) {
      // A heading past the paragraph budget is where the
      // truncation stops.
      if (paragraphs >= bodyParagraphs) break;
      kept.push(b);
      continue;
    }
    kept.push(b);
    paragraphs += 1;
    if (paragraphs === bodyParagraphs) break;
  }
  return kept.join("\n\n");
}

/**
 * Fold an addition into the post's final block instead of
 * appending a new one. A new final block would push a
 * thesis-restating close out of the detector's last-two-
 * paragraph window and flip `summaryClose` — a second
 * feature — which would make every tail mutation measure
 * two things at once and would systematically push the
 * arm whose template carries the close (the AI sample's)
 * away from its own cluster. Folding into the final block
 * keeps the close in place, so each mutation changes
 * exactly one feature, as designed.
 */
function appendToFinalBlock(text: string, addition: string): string {
  const blocks = text.split(/\n\s*\n/);
  if (blocks.length === 0) return text + addition;
  const last = blocks.length - 1;
  blocks[last] = `${blocks[last]}${addition}`;
  return blocks.join("\n\n");
}

/**
 * The six structural mutations. Each flips (at most) one feature
 * dimension, so the pool spans the axes the detector scores
 * without inventing new content: a list section, an extra heading,
 * a hedged tail, a named-source tail, a participation tail, and a
 * truncated body. The additions are short on purpose — a mutation
 * is a single-feature probe, not new content.
 *
 * The asymmetry the paper's mechanism runs on is visible here:
 * the human sample lacks bullets, headings, and a participation
 * pathway, so adding one moves it far in z-space; the AI sample
 * already carries all three, so the same addition barely moves
 * it. One mutation, opposite effects — the human arm spreads,
 * the AI arm crowds.
 */
export const MUTATIONS: ReadonlyArray<readonly [string, (text: string) => string]> = [
  [
    "list-section",
    (t) =>
      appendToFinalBlock(
        t,
        "\n- the first point\n- the second point\n- the third point",
      ),
  ],
  [
    "extra-heading",
    (t) => appendToFinalBlock(t, "\n## A closer look\nMore on this below."),
  ],
  [
    "hedged-tail",
    (t) =>
      appendToFinalBlock(
        t,
        " I think this probably covers most of it, or at least maybe the parts that matter.",
      ),
  ],
  [
    "named-source-tail",
    (t) =>
      appendToFinalBlock(
        t,
        " According to a recent industry report, retention improves.",
      ),
  ],
  [
    "participation-tail",
    (t) =>
      appendToFinalBlock(
        t,
        " Share your thoughts in the comments, or reply with your own experience.",
      ),
  ],
  ["truncated", (t) => truncateAfterParagraphs(t, 2)],
];

/**
 * The default 17-configuration pooled reference corpus, built
 * deterministically from the two sample posts:
 *
 *  - human arm: the human sample, the humanized AI sample, and
 *    the six mutations of the human sample;
 *  - AI arm: the AI sample, its lexical rewording, its
 *    de-signposted rewording, and the same six mutations of the
 *    AI sample.
 *
 * Both arms are present by necessity (see the module header): the
 * axis measures diversity-vs-crowding, so a pool of only one arm
 * would invert it.
 */
export function buildDefaultPool(
  humanSample: string,
  aiSample: string,
): DefaultPool {
  const entries: PoolEntry[] = [];
  // Human arm: the sample, the humanizer's output on the AI
  // sample (a "generated-human" configuration), then the
  // single-feature mutations.
  entries.push({ label: "human sample", source: "human", text: humanSample });
  const humanIndex = 0;
  entries.push({
    label: "humanized AI sample",
    source: "generated-human",
    text: humanize(aiSample).text,
  });
  for (const [label, apply] of MUTATIONS) {
    entries.push({
      label: `human sample + ${label}`,
      source: "human",
      text: apply(humanSample),
    });
  }
  // AI arm: the sample, the two rewording attacks, then the same
  // single-feature mutations.
  const aiIndex = entries.length;
  entries.push({ label: "AI sample", source: "ai", text: aiSample });
  entries.push({
    label: "AI sample + lexical rewording",
    source: "generated-ai",
    text: rewordLexical(aiSample).text,
  });
  entries.push({
    label: "AI sample + de-signposting",
    source: "generated-ai",
    text: rewordDeSignpost(aiSample).text,
  });
  for (const [label, apply] of MUTATIONS) {
    entries.push({
      label: `AI sample + ${label}`,
      source: "ai",
      text: apply(aiSample),
    });
  }
  return { pool: buildReferencePool(entries), humanIndex, aiIndex };
}
