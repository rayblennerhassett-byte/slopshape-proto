# Empirical research review — SlopShape prototype

**Date:** October 2026. **Method:** every load-bearing claim below was checked
against an online expert source this month. Sources are labeled **(primary)** —
I read the paper or page itself — or **(as cited)** — second-hand via the
SlopShape paper's related-work section. Academic, developer, and enthusiast
sources are separated, because they disagree in instructive ways.

## 1. Academic (peer-reviewed / preprint, 2024–2026)

**The detection problem has moved from words to structure.** SlopShape
(Madler, Sitefire; [arXiv:2609.15369v2](https://arxiv.org/abs/2609.15369),
17 Sep 2026) — **(primary)** — is the anchor: 2,250 pre-ChatGPT B2B blog
posts from 268 company domains vs 11,250 AI mirrors from five 2026 frontier
models (gpt-5.4, claude-sonnet-4.6, gemini-3-flash, deepseek-v3.2,
kimi-k2.5). A 214-feature LLM-scored instrument (187 structural features)
reaches **98.0 macro-F1** on held-out companies, **unchanged at 98.1 when
every AI post is reworded by its own model** under the Chakrabarty LAMP
editing protocol (73% of 13-grams destroyed; 98.2% of posts preserve all
claims). Human–human kappa 0.928, human–model 0.946. Ten core features
(Table 6) carry 27.6% of total attribution and alone reach 93.5 F1; the
core-only + model-specific set (33 features) reaches 95.9. Attribution:
79.3% correct source vs 16.7% chance. Rarity: human posts occupy rare
structural configurations (mean percentile 0.838 vs 0.435 for AI, Cohen's
d = 1.83; rarest 1% = 149 human vs 4 AI). Per-model rarity orders
deepseek 0.547 > claude 0.483 > gemini 0.461 > kimi 0.356 > gpt 0.329 —
DeepSeek sits closest to humans, matching its status as the hardest source
to attribute.

**Word-level detection is near-perfect on unedited text and brittle under
attack** — all **(as cited)** in SlopShape §2: fine-tuned ModernBERT
(Warner et al. 2024) and stylometric classifiers hit 100.0 macro-F1 on the
unedited corpus, but DetectGPT collapses from 70.3% to 4.6% at 1% false
positives under paraphrasing (Krishna et al. 2023), trained classifiers fall
as low as 26% accuracy on AI-paraphrased text (Weber-Wulff et al. 2023),
all likelihood-family detectors have documented rewording failure modes
(Sadasivan et al. 2023), and lexical-tell estimators are defeated by simply
avoiding the tell words (Kobak et al. 2025).

**Kobak et al. 2025** ([Science Advances](https://www.science.org/doi/10.1126/sciadv.adt3813),
"Delving into LLM-assisted writing in biomedical publications through excess
vocabulary", cited 313+) — **(primary, search-verified)** — is the lexical
channel's foundation: excess vocabulary ("delve" ~25×, "meticulous",
"commendable") marks LLM-assisted writing at population level, but the marker
is only visible when the writer does *not* edit it away. This is why the
prototype keeps `lexicalTellsPer100` as a separate, deliberately
non-structural channel with a modest weight.

**Chakrabarty et al. (LAMP taxonomy)**,
[arXiv:2409.14509](https://arxiv.org/abs/2409.14509) / ACM DL
10.1145/3706598.3713559 — **(primary, search-verified)** — 1,057
LLM-generated paragraphs edited by professional writers, 8,000+ fine-grained
edits, taxonomy of edit categories grounded in established writing practice.
LAMP is both the paper's rewording protocol and the natural edit taxonomy for
the humanizer.

**Masrour et al. 2025 (DAMAGE)**,
[arXiv:2501.03437](https://arxiv.org/abs/2501.03437) — **(primary,
search-verified)** — documents the humanizer-tool ecosystem as a new class of
detection-evasion software. SlopShape cites it (with Perkins et al. 2024) as
the industrialized form of the rewording attack.

**Provider-side signals are the new front line** (as cited): Anthropic's
August 2026 watermark survives light editing but not complete rewording, by
Anthropic's own account. Google's scaled-content-abuse policy (2024) targets
outcomes, not methods; YouTube uses structural signals — account
coordination, upload pacing, templated narrative patterns (Mathur et al.
2026).

**The skeptic camp is real:** Hadra et al. 2026
([Springer](https://link.springer.com/article/10.1007/s40979-026-00213-1),
cited 46+) evaluates two commercial detectors on 192 authentic EFL student
texts and finds reliability problems; Xiang et al. 2026's
[comprehensive review](https://www.sciencedirect.com/org/science/article/pii/S1546221826000482)
catalogs how lexical-only features (word frequency, diversity, repetition)
fail to generalize; Botes et al. 2026
([SAGE](https://journals.sagepub.com/doi/full/10.1177/25152459261472842))
and McCreery et al. 2026 (ScienceDirect) confirm the "delve" marker
generalizes across fields but co-occurs and drifts over time.

**The structural lineage:** StoryScope (Russell et al. 2026a, as cited) showed
AI fiction is separable by narrative structure alone at 93.2 macro-F1, built
on the NarraBench taxonomy (Hamilton et al. 2025). SlopShape is a declared
domain-transfer replication of it, with a 16-row deviation register.

## 2. Developer / practitioner (2025–2026)

- **Pangram** (vendor engineering blog, [Mar 2025](https://www.pangram.com/blog/why-perplexity-and-burstiness-fail-to-detect-ai) /
  [Aug 2025](https://www.pangram.com/blog/humanizers-aug-25)) — **(primary,
  search-verified)** — argues perplexity and burstiness "can't reliably
  detect AI writing at a low false positive rate," and benchmarks humanizers:
  some internal models detect humanized text near-perfectly "but exhibit
  higher false positive rates."
- **False-positive folklore:** a widely-shared r/PromptEngineering post
  (≈Mar 2026) claims ~15% practical false-positive rates, with GPTZero
  flagging most of a human-written sample; Pangram's internal benchmark
  calls GPTZero's claimed 1% FPR "2× worse than Turnitin." Turnitin
  publishes 98%+ accuracy with <1% FPR on documents with >20% AI-generated
  text (third-party summary, Apr 2026).
- **UMD TRAILS** ([Jun 2026](https://www.trails.umd.edu/news/detecting-ai-may-be-impossible-thats-a-big-problem-for-teachers)) —
  **(primary, search-verified)** — "Detecting AI May Be Impossible. That's a
  Big Problem For Teachers": the education-facing conclusion that no current
  detector is reliable enough to accuse on.
- **Adoption numbers** (as cited in SlopShape §1): ~9% of new US newspaper
  articles (Russell et al. 2026b), up to 24% of corporate press releases
  (Liang et al. 2025), >5% of new English Wikipedia articles (Brooks et al.
  2024); industry estimates run higher — Graphite (2025/26) ~half of newly
  published English web articles primarily AI-written, Ahrefs (2025) some AI
  involvement in ~three quarters of newly crawled pages.
- **Humanizer rankings** (walterwrites.ai, Sep 2026; proofreaderpro.ai) —
  enthusiast-grade testing: humanizers "work well against weaker and
  mid-tier detectors," with peer-reviewed tests showing "leading detectors
  can drop below 50% effectiveness on humanized text."

## 3. Critical review

**What holds up.**

1. The field's direction: structure over words, because words are cheap to
   change and structure is not. Three independent lines converge — SlopShape
   (commercial posts), StoryScope (fiction), NarraBench (taxonomy).
2. The rewording-robustness claim is the paper's strongest result and the
   one this prototype demos: 98.0 → 98.1 macro-F1 under a protocol that
   destroys 73% of 13-grams while preserving claims.
3. The lexical channel is real but fragile — Kobak's own framing ("defeated
   by avoiding the tell words") is exactly why the prototype weights it at
   0.35 and keeps it in a separate channel.

**What to hold with caution.**

1. The 98.0 F1 is on *single-pass* generation from five named 2026 models,
   English B2B blog posts, 600–2,500 words, informational genre. It does
   not claim to catch humanized text, mixed authorship, or other domains.
2. F1 vs FPR confusion is endemic: a 98-F1 detector and a <1%-FPR detector
   are different claims. The enthusiast tests ("humanizers beat leading
   detectors") and the academic result ("structure survives rewording") are
   compatible only because they test different channels — humanizers scrub
   words, not structure.
3. The skeptic camp (UMD TRAILS, Hadra) is mostly about *word-level*
   detectors in education. SlopShape's structural claim is narrower and
   stronger, but its instrument is an LLM judge over 214 features — this
   prototype's ~23 regex proxies are a teaching miniature, not a validation.
4. Rarity (d = 1.83) is a characterization, not a detector: it needs a
   reference population. The prototype now ships one in miniature —
   `src/rarity.ts` scores against a 17-configuration pooled corpus
   (human + AI arms together, because a human-only pool would invert the
   axis into mere atypicality). At that scale percentiles move in 1/17
   steps and the human sample is the centroid of its own arm, so only
   the *direction* (human arm mean > AI arm mean, reproduced with
   margin in `bun run demo` panel 4) transfers — not the paper's
   absolute values (0.838 vs 0.435, d = 1.83).

**Contradictions worth naming.** "Detecting AI may be impossible" (TRAILS)
vs "98.0 macro-F1" (SlopShape) vs "humanizers beat detectors" (enthusiast
tests). Resolution: the three statements concern different detectors
(word-level classroom tools vs structural instruments vs attacked text),
different bases (per-document accusation vs corpus-level screening), and
different threat models (naive student vs professional humanizer). The
honest summary: *unedited* AI text is easy to flag; *attacked* AI text is
still structurally visible in this paper's data; *human* text written
formally gets falsely flagged at rates that make accusation unsafe.

## 4. Optimal tool & skills choice for this workspace

- **Detector tool (regex, deterministic, offline).** Chosen over: (a) a
  fine-tuned encoder — perfect on unedited text, brittle under rewording,
  needs training data; (b) the paper's 214-feature LLM instrument — needs
  the released prompts and an LLM call per dimension per post; (c)
  zero-shot likelihood (DetectGPT/Binoculars) — collapses under paraphrase.
  Regex proxies are observable, testable, and honest about being
  uncalibrated. They are the right *prototype* size: the paper's ten core
  features are directly expressible as regex-checkable structure (title
  payoff, roadmap, summary stage/close, participation absence, legacy
  contrast, stakes, voice, length class, problem placement).
- **Two polar-opposite skills.** The detector skill
  (`.agents/skills/detect-ai-content/`) and the humanizer skill
  (`.agents/skills/humanize-blog-post/`) share one feature extractor
  (`src/detector.ts`), so neither can score on different terms. The
  humanizer executes Table 6 as a playbook (the attack); the detector
  surfaces Table 6 as evidence (the defense). This is the paper's own
  framing — Table 6 doubles as a humanization playbook — made into two tools
  that check each other.
- **What not to do:** never iterate the humanizer against the detector score
  (overfitting the miniature); never present the score as proof (FPR
  literature); never fabricate the human-only material (anecdotes, bylines,
  named sources) — the LAMP corpus shows professional editors *edit*, they
  do not invent.

## 5. What changed in the project (final form)

- Added `.agents/skills/detect-ai-content/SKILL.md` — the detector skill,
  polar opposite of the humanizer skill.
- Added this review (`RESEARCH.md`).
- README: both skills documented as the two poles; literature folded into
  the honesty notes.
- `demo.ts`: third panel showing the poles in action (detect → humanize →
  re-detect).
- `package.json`: `detect` script alias for the detector CLI.
- Added the structural-rarity axis (`src/rarity.ts`): the paper's
  rarity finding as a second, independent axis — mean k-NN distance in
  z-scored structural feature space against a pooled reference corpus,
  converted to a percentile. The structural vector deliberately excludes
  `lexicalTellsPer100`, so rewording cannot move it; `scoreText` stays
  pure and untouched. `cli.ts` prints the `rarity:` / `two-axis:`
  lines (and a `rarity` object under `--json`); `demo.ts` panel 4
  reproduces the direction, effect size, rarest-fifth composition, and
  the crowding mechanism against the paper's values, with the scale
  gap stated; `test/rarity.test.ts` covers the method (pooled
  composition, leave-self-out scoring, lexical invariance, direction
  with margin, the crowding mechanism, determinism, degenerate pools).
