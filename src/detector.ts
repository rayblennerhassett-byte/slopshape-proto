/**
 * SlopShape prototype — a structural AI-content detector.
 *
 * After: J. Madler, "SlopShape: Identifying AI-Generated Commercial Web
 * Content", arXiv:2609.15369v2 (2026).
 *
 * The paper's instrument is 214 LLM-scored features over an 11-dimension
 * commercial template schema. This prototype does NOT reimplement that
 * instrument. It implements ~23 directly observable regex proxies for the
 * paper's core features (Table 6), its top-SHAP features (Figure 3), and its
 * per-source discriminative features (Table F3), weighted by the paper's
 * reported human-AI gaps — plus one deliberately lexical channel so that the
 * rewording demo (src/reword.ts) can reproduce the paper's §5.4 robustness
 * claim: lexical scores collapse under rewording, structural scores hold.
 *
 * Scores are illustrative, not calibrated. See README.md.
 */

export interface Features {
  title: string;
  wordCount: number;
  bylinePresent: boolean;

  // Core instrument features (paper Table 6)
  titlePayoff: boolean; // PUR_OUT_003 — payoff promised in the title
  thesisAnnounced: boolean; // STR_FLW_006 — thesis/flow stated before content
  summaryStage: boolean; // STR_STG_001 — summary/synthesis stage present
  summaryClose: boolean; // STR_STG_008 — close restates the thesis
  externalPathway: boolean; // VOC_PRT_005 — invites reader participation
  legacyContrast: boolean; // STR_FLW_005 — legacy-vs-modern framing
  stakesEscalation: boolean; // AUD_STK_005 — cost-of-getting-it-wrong
  voiceEditorial: boolean; // VOC_VOX_001 — editorial-explainer voice
  firstProblemParagraph: number; // AUD_PRB_002 — ordinal position of problem

  // Observable proxies for top-SHAP and per-source features (Fig. 3, Table F3)
  secondPersonPer100: number; // VOC_ADR_002
  selfReferencePer100: number; // COM_ROL_005
  hedgesPer100: number;
  namedAttributionPer100: number; // EXP_KNW_007
  vagueAttribution: boolean; // "studies show" without named sources
  baselineDisclosure: boolean; // EVD_NUM_004 — numbers anchored to a baseline
  numericPer100: number; // EVD_NUM_001
  ctaCount: number; // VOC_PRT_003
  executionSupport: boolean; // ACT_CHK_025 — checklist/worksheet offered
  headingsPer300: number; // PAG_NAV_005
  bulletsPer300: number;
  numberedProcedure: boolean; // ACT_STP_004
  interviewFormat: boolean; // paper §5.1: interviews/transcripts lean human
  firstPersonAnecdote: boolean; // human-voice marker

  // Deliberately NON-structural channel (kept separate so the demo can show
  // lexical brittleness vs structural robustness)
  lexicalTellsPer100: number; // Kobak et al. 2025-style excess vocabulary
}

export interface Signal {
  name: string;
  paperId: string;
  weight: number;
  signal: number;
  contribution: number;
}

export interface ScoreResult {
  /** 0 = maximally human-shaped, 1 = maximally AI-shaped */
  score: number;
  verdict: string;
  total: number;
  normalizer: number;
  signals: Signal[];
  features: Features;
}

interface Weighted {
  name: string;
  paperId: string;
  weight: number;
  signal: (f: Features) => number;
}

const clamp = (x: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, x));

// ---------------------------------------------------------------------------
// Regex kit. Global regexes are only used with String.match (safe to reuse);
// non-global ones with .test. Never mix.
// ---------------------------------------------------------------------------

/**
 * Regex kit. Global regexes are only used with String.match (safe to reuse);
 * non-global ones with .test. Never mix. Exported so the humanizer tests the
 * same patterns the detector scores with — one source of truth.
 */
export const TITLE_RE = /^#\s+(.+)$/m;
export const HEADING_RE = /^#{2,6}\s+/gm;
export const BULLET_RE = /^[ \t]*[-*•][ \t]+/gm;
export const ORDERED_RE = /^[ \t]*\d+[.)][ \t]+/gm;
export const WORD_RE = /[a-z][a-z'’-]*/gi;
export const NUM_RE = /\b\d+(?:[.,]\d+)?%?\b/g;
export const BYLINE_RE = /^by\s+[A-Z][a-zA-Z]/im;

export const SECOND_PERSON_RE =
  /\byou\b|\byour\b|\byours\b|\byou(?:’|')?(?:re|ll|ve)\b/gi;
export const SELF_REF_RE = /\b(?:we|our|ours|us)\b/gi;
export const HEDGE_RE =
  /\b(?:i think|i suspect|i guess|in my experience|it depends|probably|arguably|possibly|maybe|might|sort of|kind of|honestly|to be fair|often|sometimes|mostly|typically)\b/gi;

export const TELL_RES: RegExp[] = [
  /\bdelve into\b/gi,
  /\ba tapestry of\b/gi,
  /\btestament to\b/gi,
  /\bin today'?s fast-paced (?:world|business environment)\b/gi,
  /\bgame-?changer\b/gi,
  /\bunlock\b/gi,
  /\bthe full potential of\b/gi,
  /\bleverage\b/gi,
  /\bseamless(?:ly)?\b/gi,
  /\brobust\b/gi,
  /\belevate\b/gi,
  /\bembark (?:on|upon)\b/gi,
  /\bnavigate the landscape\b/gi,
  /\bthe landscape of\b/gi,
  /\bit'?s important to note that\b/gi,
  /\bfurthermore\b/gi,
  /\bmoreover\b/gi,
  /\bcrucial\b/gi,
  /\bpivotal\b/gi,
  /\ba vast array of\b/gi,
];

export const ROADMAP_RE =
  /\bin this (?:post|article|guide|essay|piece)\b|\bwe(?:'|’)?ll cover\b|\bwe will cover\b|\bwe(?:'|’)?ll walk you through\b|\bhere(?:'|’)?s what (?:we|you)(?:'|’)?ll (?:cover|learn)\b|\bthis (?:post|guide|article) (?:will|covers)\b/i;
export const SUMMARY_RE =
  /\bin (?:short|conclusion|summary)\b|\bto (?:recap|sum up|summarize)\b|\btl;?dr\b|\bthe bottom line\b/i;
export const SUMMARY_STAGE_RE = /\bkey takeaways?\b|\bfinal thoughts\b/i;
export const STAKES_RE =
  /\bcost of (?:getting|not|missing|choosing)\b|\bmistakes that\b|\bwhat goes wrong\b|\bat (?:your )?risk\b|\bwaste (?:of )?(?:time|money)\b|\bleave (?:money|value) on the table\b|\bexpensive mistakes\b|\bpay(?:ing)? (?:for it|the price)\b/i;
export const LEGACY_RE =
  /\btraditional(?:ly)?\b|\bold (?:way|school)\b|\bused to\b|\bin the past\b|\bno longer\b|\bgone are the days\b|\bunlike\b/i;
export const VOICE_RE =
  /\bhere(?:'|’)?s (?:the thing|why|how)\b|\blet(?:'|’)?s (?:look|dive|break|get|start)\b|\bsimply put\b|\bput simply\b|\bthe key (?:is|to)\b|\bnotice how\b|\bwe(?:'|’)?ll\b/i;
export const ANECDOTE_RE =
  /\bwhen i (?:started|first|joined|was)\b|\bi (?:remember|learned|spent|made the mistake|got it wrong)\b|\bmy first (?:week|month|year|job)\b|\blast (?:year|month|week) i\b/i;
export const INTERVIEW_RE = /\bQ:\s/i;
export const VAGUE_RE =
  /\bstudies (?:show|suggest|have shown)\b|\bresearch (?:shows|suggests)\b|\bexperts (?:say|agree|warn)\b|\bit(?:'|’)?s widely (?:known|accepted)\b|\bindustry reports suggest\b/i;
export const NAMED_RE = /\b(?:according to|said|says|told me|asked|interviewed)\b/gi;
export const PATHWAY_RE =
  /\bcomments?\b|\breply\b|\bemail us\b|\bjoin the newsletter\b|\btell us\b|\bshare your (?:thoughts|experience)\b/i;
export const CTA_RE =
  /\bsign up\b|\bsubscribe\b|\bget started\b|\bbook a (?:call|demo)\b|\bcontact us\b|\btry (?:it )?free\b|\bstart (?:your )?free\b|\brequest a demo\b|\bdownload now\b|\breach out\b/gi;
export const BASELINE_RE = /\bcompared to\b|\bup from\b|\bdown from\b|\bbaseline\b|\bbenchmark\b/i;
export const PROBLEM_RE =
  /\b(?:problems?|struggl(?:e|ing|ed)|pain(?:ful)?|broke|broken|fail(?:ed|ing)|stuck|slow|mistakes?|challenges?)\b/i;
export const EXECUTION_RE =
  /\bchecklist\b|\bworksheet\b|\btemplate\b|\bspreadsheet\b|\bcalculator\b|\bcheat sheet\b/i;
// Title value that "promises the payoff", per the paper's PUR_OUT_003.
export const TITLE_PAYOFF_RE =
  /^(how to\b|how i\b|why (?:you|your|everyone|most)\b|the (?:complete|ultimate|essential|only|right|proven|smart)\b|\d+ (?:ways|tips|steps|things|lessons|secrets|mistakes|reasons)\b|stop\b|master\b|everything you need\b|the (?:art|science) of\b)/i;

const countMatches = (re: RegExp, s: string): number => (s.match(re) ?? []).length;

/** Extract the observable structural features of a post from raw text. */
export function extractFeatures(text: string): Features {
  const titleMatch = text.match(TITLE_RE);
  const title = titleMatch?.[1]?.trim() ?? "";
  const body = titleMatch ? text.replace(TITLE_RE, "") : text;

  const words = body.match(WORD_RE) ?? [];
  const wc = words.length;
  const per100 = (n: number): number => (wc > 0 ? (n / wc) * 100 : 0);
  const per300 = (n: number): number => (wc > 0 ? (n / wc) * 300 : 0);

  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const firstProblemParagraph = paragraphs.findIndex((p) => PROBLEM_RE.test(p));

  const lastTwo = paragraphs.slice(-2).join("\n");
  const tellCount = TELL_RES.reduce((sum, re) => sum + countMatches(re, body), 0);

  return {
    title,
    wordCount: wc,
    bylinePresent: BYLINE_RE.test(text),

    titlePayoff: TITLE_PAYOFF_RE.test(title),
    thesisAnnounced: ROADMAP_RE.test(body),
    summaryStage: SUMMARY_RE.test(body) || SUMMARY_STAGE_RE.test(body),
    summaryClose: SUMMARY_RE.test(lastTwo),
    externalPathway: PATHWAY_RE.test(body),
    legacyContrast: LEGACY_RE.test(body),
    stakesEscalation: STAKES_RE.test(body),
    voiceEditorial: VOICE_RE.test(body),
    firstProblemParagraph,

    secondPersonPer100: per100(countMatches(SECOND_PERSON_RE, body)),
    selfReferencePer100: per100(countMatches(SELF_REF_RE, body)),
    hedgesPer100: per100(countMatches(HEDGE_RE, body)),
    namedAttributionPer100: per100(countMatches(NAMED_RE, body)),
    vagueAttribution: VAGUE_RE.test(body),
    baselineDisclosure: BASELINE_RE.test(body),
    numericPer100: per100(countMatches(NUM_RE, body)),
    ctaCount: countMatches(CTA_RE, body),
    executionSupport: EXECUTION_RE.test(body),
    headingsPer300: per300(countMatches(HEADING_RE, body)),
    bulletsPer300: per300(countMatches(BULLET_RE, body)),
    numberedProcedure: countMatches(ORDERED_RE, body) >= 3,
    interviewFormat: INTERVIEW_RE.test(body),
    firstPersonAnecdote: ANECDOTE_RE.test(body),

    lexicalTellsPer100: per100(tellCount),
  };
}

/**
 * The weighted feature set. Core-feature weights are the human-AI gaps from
 * the paper's Table 6; the paperId field maps each entry back to the
 * instrument. Extra proxies (marked "proxy") carry small hand-set weights.
 * Sign convention: positive contribution => evidence of the AI template.
 */
const SPECS: Weighted[] = [
  // --- The ten core values (Table 6, weighted by reported human-AI gap) ---
  { name: "Payoff first-promise in title", paperId: "PUR_OUT_003", weight: 0.624, signal: (f) => (f.titlePayoff ? 1 : 0) },
  { name: "Conclusion restates thesis", paperId: "STR_STG_008", weight: 0.65, signal: (f) => (f.summaryClose ? 1 : -1) },
  { name: "Summary/synthesis stage present", paperId: "STR_STG_001", weight: 0.609, signal: (f) => (f.summaryStage ? 1 : -1) },
  // Paper lists ABSENCE as the AI-leaning value here.
  { name: "External participation pathway", paperId: "VOC_PRT_005", weight: 0.592, signal: (f) => (f.externalPathway ? -1 : 1) },
  { name: "Legacy-vs-modern contrast", paperId: "STR_FLW_005", weight: 0.497, signal: (f) => (f.legacyContrast ? 1 : -1) },
  { name: "Thesis announced before first section", paperId: "STR_FLW_006", weight: 0.419, signal: (f) => (f.thesisAnnounced ? 1 : -1) },
  { name: "Stakes escalation", paperId: "AUD_STK_005", weight: 0.362, signal: (f) => (f.stakesEscalation ? 1 : -1) },
  { name: "Primary voice: editorial explainer", paperId: "VOC_VOX_001", weight: 0.308, signal: (f) => (f.voiceEditorial ? 1 : f.firstPersonAnecdote ? -1 : 0) },
  { name: "Article length class", paperId: "PAG_FUR_011", weight: 0.274, signal: (f) => (f.wordCount < 800 ? -1 : f.wordCount > 1200 ? 1 : 0) },
  { name: "Problem placement (early leans human)", paperId: "AUD_PRB_002", weight: 0.222, signal: (f) => (f.firstProblemParagraph < 0 ? 0 : f.firstProblemParagraph <= 1 ? -1 : 1) },

  // --- Proxies for top-SHAP / per-source features (Fig. 3, Table F3) ---
  { name: "Lexical tells (non-structural channel)", paperId: "lexical-tell proxy (Kobak et al. 2025)", weight: 0.35, signal: (f) => clamp(f.lexicalTellsPer100 / 0.3, 0, 1) },
  { name: "Vague-only attribution", paperId: "EXP_KNW_007 proxy", weight: 0.2, signal: (f) => (f.vagueAttribution && f.namedAttributionPer100 < 0.1 ? 1 : 0) },
  { name: "Named-source attribution", paperId: "EXP_KNW_007 proxy", weight: 0.25, signal: (f) => -clamp(f.namedAttributionPer100 / 0.3, 0, 1) },
  { name: "First-person anecdote", paperId: "human-voice marker", weight: 0.3, signal: (f) => (f.firstPersonAnecdote ? -1 : 0) },
  { name: "Interview/transcript format", paperId: "paper §5.1 format marker", weight: 0.3, signal: (f) => (f.interviewFormat ? -1 : 0) },
  { name: "Hedge density", paperId: "human-voice marker", weight: 0.2, signal: (f) => -clamp(f.hedgesPer100 / 0.8, 0, 1) },
  { name: "First-person-plural density", paperId: "COM_ROL_005 proxy", weight: 0.2, signal: (f) => -clamp(f.selfReferencePer100 / 1.5, 0, 1) },
  { name: "Second-person address density", paperId: "VOC_ADR_002", weight: 0.25, signal: (f) => clamp((f.secondPersonPer100 - 0.8) / 1.7, -1, 1) },
  { name: "Heading scanability density", paperId: "PAG_NAV_005", weight: 0.15, signal: (f) => clamp((f.headingsPer300 - 1.2) / 0.8, 0, 1) },
  { name: "List density", paperId: "PAG_NAV proxy", weight: 0.15, signal: (f) => clamp((f.bulletsPer300 - 1.0) / 1.0, 0, 1) },
  { name: "Commercial CTA intensity", paperId: "VOC_PRT_003", weight: 0.15, signal: (f) => clamp(f.ctaCount, 0, 1) },
  { name: "Numbers without baseline disclosure", paperId: "EVD_NUM_004", weight: 0.1, signal: (f) => (f.numericPer100 >= 0.5 && !f.baselineDisclosure ? 1 : 0) },
  { name: "Execution-support resource offered", paperId: "ACT_CHK_025 (leans human)", weight: 0.3, signal: (f) => (f.executionSupport ? -1 : 0) },
];

/** Sum of absolute weights: the maximum possible |total|, for normalization. */
export const NORMALIZER: number = SPECS.reduce((sum, s) => sum + s.weight, 0);

export function verdictFor(score: number): string {
  if (score < 0.3) return "very likely human";
  if (score < 0.45) return "likely human";
  if (score < 0.55) return "ambiguous";
  if (score < 0.7) return "likely AI";
  return "very likely AI";
}

export function scoreFeatures(f: Features): ScoreResult {
  const signals: Signal[] = SPECS.map((spec) => {
    const signal = clamp(spec.signal(f), -1, 1);
    return {
      name: spec.name,
      paperId: spec.paperId,
      weight: spec.weight,
      signal,
      contribution: signal * spec.weight,
    };
  });
  const total = signals.reduce((sum, s) => sum + s.contribution, 0);
  const score = clamp(0.5 + (0.5 * total) / NORMALIZER, 0, 1);
  signals.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return {
    score,
    verdict: verdictFor(score),
    total,
    normalizer: NORMALIZER,
    signals,
    features: f,
  };
}

export function scoreText(text: string): ScoreResult {
  return scoreFeatures(extractFeatures(text));
}

export const PAPER = {
  title: "SlopShape: Identifying AI-Generated Commercial Web Content",
  author: "Jochen Madler (Sitefire)",
  arxiv: "2609.15369v2",
  note: "Weight-based prototype over regex proxies; not the released 214-feature instrument. Scores are illustrative, not calibrated.",
} as const;
