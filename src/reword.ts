/**
 * Rewording attacks for the SlopShape prototype demo.
 *
 * The paper's §5.4 rewords every AI post with the model that wrote it,
 * following the editing protocol of Chakrabarty et al. (2025) (the LAMP
 * taxonomy of AI-writing artifacts), while preserving every claim, fact, and
 * link. We cannot call frontier models from a self-contained demo, so these
 * are deterministic, rule-based approximations of two arms:
 *
 *  - rewordLexical(): LAMP-style surface edits only — purple lexicon, empty
 *    intensifiers, vague attribution, em-dash overuse, ordinal signposts.
 *    The paper's claim: the structural score is unchanged by this.
 *  - rewordDeSignpost(): the lexical arm PLUS removal of the tidy
 *    signposting (roadmap sentence, thesis-restating close). This attacks
 *    the paper's core features directly — the strongest edit most
 *    "humanizer" tools actually make. The paper's claim: even then, the
 *    full structural signature still identifies the post as AI-generated.
 */

export interface Edit {
  rule: string;
  count: number;
}

export interface RewordResult {
  text: string;
  edits: Edit[];
}

export type LexRule = { rule: string; re: RegExp; to: string };

export const LEXICON: Array<[RegExp, string]> = [
  [/\bthe full potential of\b/gi, ""],
  [/\bdelve into\b/gi, "look at"],
  [/\ba tapestry of\b/gi, "a mix of"],
  [/\btestament to\b/gi, "evidence of"],
  [/\bin today'?s fast-paced (?:world|business environment)\b/gi, "these days"],
  [/\bgame-?changer\b/gi, "big deal"],
  [/\bunlock\b/gi, "tap"],
  [/\bleverage\b/gi, "use"],
  [/\bseamlessly\b/gi, "smoothly"],
  [/\bseamless\b/gi, "smooth"],
  [/\brobust\b/gi, "solid"],
  [/\belevate\b/gi, "lift"],
  [/\bembark (?:on|upon)\b/gi, "start"],
  [/\bnavigate the landscape of\b/gi, "find your way around"],
  [/\bthe landscape of\b/gi, "the world of"],
  [/\bit'?s important to note that\b/gi, "note that"],
  [/\bfurthermore\b/gi, "also"],
  [/\bmoreover\b/gi, "also"],
  [/\bcrucial\b/gi, "key"],
  [/\bpivotal\b/gi, "key"],
  [/\ba vast array of\b/gi, "many"],
];

export const INTENSIFIERS: LexRule = {
  rule: "empty-intensifiers",
  re: /\b(?:incredibly|truly|remarkably|absolutely|extremely|hugely|massively)\s+/gi,
  to: "",
};

export const VAGUE_ATTRIBUTION_RULES: LexRule[] = [
  { rule: "vague-attribution", re: /\bstudies (?:show|suggest|have shown) that\s*/gi, to: "" },
  { rule: "vague-attribution", re: /\bstudies (?:show|suggest|have shown)\s*/gi, to: "" },
  { rule: "vague-attribution", re: /\bresearch (?:shows|suggests) that\s*/gi, to: "" },
  { rule: "vague-attribution", re: /\bresearch (?:shows|suggests)\s*/gi, to: "" },
  { rule: "vague-attribution", re: /\bexperts (?:say|agree|warn) that\s*/gi, to: "" },
  { rule: "vague-attribution", re: /\bexperts (?:say|agree|warn)\s*/gi, to: "" },
  { rule: "vague-attribution", re: /\bit'?s widely (?:known|accepted) that\s*/gi, to: "" },
];

const EM_DASH: LexRule[] = [
  { rule: "em-dash", re: / — /g, to: ", " },
  { rule: "em-dash", re: /—/g, to: "," },
];

const ORDINAL_OPENERS: LexRule[] = [
  { rule: "ordinal-openers", re: /\bFirst,\s*/g, to: "" },
  { rule: "ordinal-openers", re: /\bSecond,\s*/g, to: "Also, " },
  { rule: "ordinal-openers", re: /\bThird,\s*/g, to: "And, " },
  { rule: "ordinal-openers", re: /\bFinally,\s*/g, to: "Last thing: " },
];

export const STRIP_ROADMAP: LexRule[] = [
  {
    rule: "strip-roadmap",
    re: /[^\n.!?]*(?:\bin this (?:post|article|guide|essay|piece)\b|\bhere'?s what (?:we|you)'?ll (?:cover|learn)\b|\bthis (?:post|guide|article) (?:will|covers)\b)[^.!?]*[.!?]\s*/gi,
    to: "",
  },
];

export const STRIP_SUMMARY: LexRule[] = [
  {
    rule: "strip-summary-close",
    re: /[^\n.!?]*\bin (?:short|conclusion|summary)\b[^.!?]*[.!?]\s*/gi,
    to: "",
  },
  {
    rule: "strip-summary-close",
    re: /[^\n.!?]*\bto (?:recap|sum up|summarize)\b[^.!?]*[.!?]\s*/gi,
    to: "",
  },
  { rule: "strip-summary-close", re: /\btl;?dr:?\s*[^\n]*/gi, to: "" },
];

function applyRules(text: string, rules: LexRule[]): RewordResult {
  let out = text;
  const edits: Edit[] = [];
  for (const { rule, re, to } of rules) {
    if (rule === "purple-lexicon") {
      let count = 0;
      for (const [pattern, replacement] of LEXICON) {
        count += (out.match(pattern) ?? []).length;
        out = out.replace(pattern, replacement);
      }
      if (count > 0) edits.push({ rule, count });
      continue;
    }
    const count = (out.match(re) ?? []).length;
    if (count > 0) {
      out = out.replace(re, to);
      edits.push({ rule, count });
    }
  }
  // Cosmetic cleanup: collapse doubled spaces introduced by deletions and
  // fix punctuation spacing. Only horizontal spaces, so paragraphs survive.
  out = out
    .replace(/[ ]{2,}/g, " ")
    .replace(/[ ]+([.,;:!?])/g, "$1")
    .replace(/[ \t]+\n/g, "\n");
  return { text: out, edits };
}

function rulesLexical(): LexRule[] {
  // The leading "purple-lexicon" marker activates the LEXICON pass inside
  // applyRules (see AGENTS.md lesson: a silently-skipped rule looks like a
  // clean run — verify the mutation applied).
  return [{ rule: "purple-lexicon", re: /(?:)/, to: "" }, ...VAGUE_ATTRIBUTION_RULES, INTENSIFIERS, ...EM_DASH, ...ORDINAL_OPENERS];
}

/** LAMP-style surface rewording: edits wording, preserves structure. */
export function rewordLexical(text: string): RewordResult {
  return applyRules(text, rulesLexical());
}

/** Lexical rewording plus removal of tidy signposting (roadmap + close). */
export function rewordDeSignpost(text: string): RewordResult {
  return applyRules(text, [...STRIP_ROADMAP, ...STRIP_SUMMARY, ...rulesLexical()]);
}

export const REWORD_RULE_NAMES = [
  "purple-lexicon",
  "empty-intensifiers",
  "vague-attribution",
  "em-dash",
  "ordinal-openers",
  "strip-roadmap",
  "strip-summary-close",
] as const;
