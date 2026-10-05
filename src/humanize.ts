/**
 * humanize.ts — the Table 6 playbook, executed.
 *
 * Turns the "tidy, self-announcing blog post" into the human-leaning profile
 * the SlopShape paper's core features describe: the paper's own observation
 * that Table 6 doubles as a humanization playbook, executed deterministically.
 *
 * Two layers of honesty:
 *  - humanize() flips every *mechanically detectable* core feature (title
 *    payoff, roadmap, summary stage/close, editorial-explainer voice) but
 *    cannot invent an authentic anecdote, real named sources, a genuine
 *    participation pathway, or a byline. Instead of fabricating, it returns
 *    `flaggedForGaps` — the list of things a human (or the agent running the
 *    SKILL.md playbook) must fill with true material. This mirrors the
 *    paper's claim-preservation census (Appendix J): edits preserve claims,
 *    facts, and links; rules only remove or rewrite what is already there.
 *  - humanizeWithReport() adds a verification report: before/after scores
 *    from the same detector under attack, plus the residual AI-leaning
 *    signals. The paper predicts the full 187-feature signature still flags
 *    the result — the human profile is not a checklist but a different
 *    writing process — and the report makes that residual visible.
 */

import {
  extractFeatures,
  scoreText,
  TITLE_PAYOFF_RE,
  type Features,
} from "./detector";
import {
  INTENSIFIERS,
  LEXICON,
  STRIP_ROADMAP,
  STRIP_SUMMARY,
  VAGUE_ATTRIBUTION_RULES,
  type LexRule,
} from "./reword";

export interface HumanizeEdit {
  phase: string;
  rule: string;
  count: number;
}

export interface HumanizeReport {
  before: number;
  after: number;
  delta: number;
  beforeVerdict: string;
  afterVerdict: string;
  /** AI-leaning signals that survive the pass — the irreducible residue. */
  residual: Array<{ name: string; contribution: number }>;
}

export interface HumanizeResult {
  text: string;
  edits: HumanizeEdit[];
  flaggedForGaps: string[];
  report?: HumanizeReport;
}

// ---------------------------------------------------------------------------
// Phase 1 — title (PUR_OUT_003: payoff first-promise leans AI). Rewrites the
// frame, keeps the topic. No new claims: the "how we tried" frame is flagged
// for human confirmation rather than asserted silently.
// ---------------------------------------------------------------------------

const GUIDE_SUFFIX_RE =
  /\s*[:\-—]\s*(?:the\s+|a\s+)?(?:complete|ultimate|essential|only|proven|smart)\s+(?:guide|playbook|blueprint|roadmap)\s*$/i;

/**
 * Paragraph-level summary removal (STR_STG_008). Runs BEFORE the
 * sentence-level rules: a restating close is usually a whole paragraph that
 * OPENS with the marker sentence — sentence-level stripping would orphan the
 * rest of the paragraph, which then still reads as a thesis-restating close
 * (and can even masquerade as a byline, "By leveraging automation...").
 */
const SUMMARY_PARAGRAPH_RE =
  /\bin (?:short|conclusion|summary)\b|\bto (?:recap|sum up|summarize)\b|^\s*tl;?dr\b/i;

function stripSummaryParagraphs(text: string): { text: string; count: number } {
  const blocks = text.split(/\n\s*\n/);
  const kept = blocks.filter((b) => !SUMMARY_PARAGRAPH_RE.test(b));
  return { text: kept.join("\n\n"), count: blocks.length - kept.length };
}

function rewriteTitle(text: string): { text: string; count: number } {
  const m = text.match(/^#\s+(.+)$/m);
  if (!m || !TITLE_PAYOFF_RE.test(m[1].trim())) return { text, count: 0 };
  let title = m[1].trim().replace(GUIDE_SUFFIX_RE, "");
  if (/^how to\b/i.test(title)) {
    title =
      "How we tried to " +
      title.replace(/^how to\s*/i, "").replace(/^./, (c) => c.toLowerCase());
  } else {
    title = "Notes: " + title.replace(/^./, (c) => c.toLowerCase());
  }
  return { text: text.replace(m[0], `# ${title}`), count: 1 };
}

// ---------------------------------------------------------------------------
// Phases 2–4 reuse the reword attack rules — same source of truth as the
// demo's rewording arms. Signposts: STR_FLW_006 (roadmap), STR_STG_008
// (summary close), STR_STG_001 (summary stage incl. "Key Takeaways").
// Evidence: vague attribution + empty intensifiers.
// ---------------------------------------------------------------------------

const TAKEAWAYS_RULES: LexRule[] = [
  { rule: "strip-takeaways-stage", re: /^##\s*key takeaways?\s*$/gim, to: "" },
];

const SIGNPOST_RULES: LexRule[] = [
  ...STRIP_ROADMAP,
  ...STRIP_SUMMARY,
  ...TAKEAWAYS_RULES,
];

const EVIDENCE_RULES: LexRule[] = [...VAGUE_ATTRIBUTION_RULES, INTENSIFIERS];

// The full purple-lexicon pass, shared with the rewording attacks (same
// source of truth), so the humanizer output doesn't keep telling on itself.
const LEXICON_RULES: LexRule[] = LEXICON.map(([re, to]) => ({
  rule: "rewrite-lexicon",
  re,
  to,
}));

const VOICE_RULES: LexRule[] = [
  { rule: "rewrite-voice", re: /here's the thing[,:]?\s*/gi, to: "I'll be honest: " },
  { rule: "rewrite-voice", re: /\bhere's why\b/gi, to: "I think" },
  { rule: "rewrite-voice", re: /\blet's look at\b/gi, to: "let me show you" },
  { rule: "rewrite-voice", re: /\blet's break (?:this|it) down\b/gi, to: "here's my read on it" },
  { rule: "rewrite-lexicon", re: /\bdelve into\b/gi, to: "look at" },
  { rule: "rewrite-lexicon", re: /\bleverage\b/gi, to: "use" },
  { rule: "rewrite-lexicon", re: /\brobust\b/gi, to: "solid" },
  { rule: "rewrite-lexicon", re: /\bunlock the full potential of\b/gi, to: "get the most out of" },
];

const PHASES: Array<readonly [string, LexRule[]]> = [
  ["signposts", SIGNPOST_RULES],
  ["evidence", EVIDENCE_RULES],
  ["voice", VOICE_RULES],
  ["lexicon", LEXICON_RULES],
];

function cleanup(text: string): string {
  return text
    .replace(/[ ]{2,}/g, " ")
    .replace(/[ ]+([.,;:!?])/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    // Sentence- and paragraph-initial capitals, to heal the lowercase left
    // behind by prefix-stripping rules ("studies show that X" -> "X").
    .replace(/([.!?]\s+)([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase())
    .replace(/(\n\s*\n)([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
}

// ---------------------------------------------------------------------------
// The honest part: what regex must not fabricate. Computed from the output's
// own features, so the caller sees exactly which Table 6 human-leaners are
// still missing and can only be filled with TRUE material.
// ---------------------------------------------------------------------------

function gapsFor(f: Features, titleRewritten: boolean): string[] {
  const gaps: string[] = [];
  if (!f.firstPersonAnecdote)
    gaps.push("anecdote: none found — add a real one or leave it out; do not invent");
  if (f.vagueAttribution && f.namedAttributionPer100 < 0.1)
    gaps.push("sources: claims rest on vague attribution — name real sources or delete the claims");
  if (!f.executionSupport)
    gaps.push("execution support: no checklist/template offered — add one only if it exists");
  if (!f.externalPathway)
    gaps.push("participation pathway: absent (VOC_PRT_005) — add one only if a human will actually read replies");
  if (!f.bylinePresent)
    gaps.push("byline: no author found — attach a real one");
  if (titleRewritten)
    gaps.push("title: confirm the 'how we tried' frame matches what the post actually delivers");
  return gaps;
}

export function humanize(text: string): HumanizeResult {
  const edits: HumanizeEdit[] = [];
  let out = text;

  const title = rewriteTitle(out);
  out = title.text;
  if (title.count > 0) {
    edits.push({ phase: "title", rule: "strip-payoff-promise (PUR_OUT_003)", count: title.count });
  }

  const summaryParagraphs = stripSummaryParagraphs(out);
  out = summaryParagraphs.text;
  if (summaryParagraphs.count > 0) {
    edits.push({ phase: "signposts", rule: "strip-summary-paragraph (STR_STG_008)", count: summaryParagraphs.count });
  }

  for (const [phase, rules] of PHASES) {
    for (const { rule, re, to } of rules) {
      const count = (out.match(re) ?? []).length;
      if (count > 0) {
        out = out.replace(re, to);
        edits.push({ phase, rule, count });
      }
    }
  }
  out = cleanup(out);

  return { text: out, edits, flaggedForGaps: gapsFor(extractFeatures(out), title.count > 0) };
}

export function humanizeWithReport(text: string): HumanizeResult {
  const before = scoreText(text);
  const result = humanize(text);
  const after = scoreText(result.text);
  const residual = after.signals
    .filter((s) => s.contribution > 0)
    .slice(0, 6)
    .map(({ name, contribution }) => ({ name, contribution }));
  return {
    ...result,
    report: {
      before: before.score,
      after: after.score,
      delta: after.score - before.score,
      beforeVerdict: before.verdict,
      afterVerdict: after.verdict,
      residual,
    },
  };
}
