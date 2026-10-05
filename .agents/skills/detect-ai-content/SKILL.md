---
name: detect-ai-content
description: Use when assessing whether a blog post (or other commercial web copy) shows the structural "tidy, self-announcing" signature of AI generation described by the SlopShape paper — and when separating robust structural evidence from fragile lexical tells.
---

# Detect AI-shaped commercial content

The SlopShape paper (arXiv:2609.15369) shows AI-generated B2B
blog posts share a structural signature — payoff promised in the
title, thesis and announced flow before the first section,
editorial-explainer voice, summary close — and that this signature
**survives rewording**: 98.0 → 98.1 macro-F1 when every AI post is
reworded by its own model. This skill runs the prototype detector
and reads its output the way the paper does: structure is the
evidence, word-choice tells are a footnote.

Polar opposite of `humanize-blog-post`: that skill *removes* this
signature; this one *surfaces* it. Both run against the same
feature extractor (`slopshape-proto/src/detector.ts`), so they can
never score on different terms.

## Workflow

1. Run the detector from `slopshape-proto/`:
   `bun run detect --json post.md` (full feature + signal
   breakdown, plus a `rarity` object; stdin works too).
   Human-readable: `bun run detect post.md` — prints the
   template score, then a `rarity:` line and a `two-axis:`
   line.
2. Read the score (0 = maximally human-shaped, 1 = maximally
   AI-shaped) and the verdict band, then the top signals. Positive
   contributions are AI-template evidence; negative ones are
   human-voice evidence.
3. Read the second axis before concluding: `rarity` is the
   percentile of the post's structural configuration against a
   *pooled* reference corpus (human + AI posts together — a
   human-only pool would invert the axis into mere atypicality).
   Bands: ≥0.8 rare, ≥0.6 uncommon, ≥0.4 typical, <0.4 crowded.
   In the paper's data human posts occupy rare configurations
   (arm mean 0.838 vs 0.435, Cohen's d = 1.83) while AI posts
   crowd the common ones. **Rare ≠ human**: an atypical AI post
   is also rare — that is the `two-axis:` line's job to name
   ("AI-shaped template in a rare structural region — inspect,
   don't assume"). The axis excludes the lexical channel by
   design, so rewording does not move it. Scale honesty: this
   prototype's pool is 17 deterministic configurations, so
   percentiles move in 1/17 steps — direction is the finding,
   exact values are illustrative.
4. Weigh the two channels differently, like the paper does:
   - **Structural signals** — the Table 6 core features (payoff
     title `PUR_OUT_003`, announced thesis/flow `STR_FLW_006`,
     summary stage `STR_STG_001` / restating close `STR_STG_008`,
     absent participation pathway `VOC_PRT_005`, legacy contrast
     `STR_FLW_005`, stakes escalation `AUD_STK_005`,
     editorial-explainer voice `VOC_VOX_001`, length class
     `PAG_FUR_011`, problem placement `AUD_PRB_002`) — are the
     *robust* channel: they survive rewording.
   - **Lexical tells** (`lexical-tell proxy`, after Kobak et al.
     2025: delve, leverage, tapestry, testament…) are the *fragile*
     channel. High lexical + high structural = likely unedited AI.
     Low lexical + high structural = likely **reworded** AI — the
     case the paper says still detects. Low lexical + low
     structural = no finding.
5. Check the human-leaning profile before calling it: byline,
   first-person anecdote, named attribution ("according to…"),
   hedges, interview/transcript format, execution support (a
   checklist/template actually offered), a participation pathway,
   early problem placement, no announced flow. The paper's rarity
   finding says human posts occupy *rare* structural configurations
   (rarest 1%: 149 human vs 4 AI) — a post that avoids all ten AI
   core values and shows several of these is structurally unusual in
   the human direction.
6. If the text may have passed through a humanizer tool (the
   ecosystem Masrour et al. 2025 / DAMAGE documents), expect the
   lexical channel scrubbed and the signposts surgically removed;
   the residual structural redundancy (title payoff, voice, list
   density, CTA intensity, evidence style) is what the paper's §5.4
   says keeps detection near-ceiling. Run `bun run demo.ts` to see
   the two rewording arms that claim is built on — lexical-only
   rewording leaves the score flat; de-signposting sags it but the
   net verdict holds.
7. Report as **evidence for review, not proof**: name the specific
   features that fired, with their paper IDs, and the direction of
   each. Never accuse on this score alone — the false-positive
   literature (Hadra et al. 2026; Pangram's benchmarks; UMD TRAILS
   2026) shows even commercial detectors misfire on formal,
   citation-heavy, or non-native English writing. A high score is a
   reason to look closer, not a verdict.

## Verify

From `slopshape-proto/`, run `bun test` — the detector suite checks
the AI sample hits the core Table 6 template features, the human
sample the human-leaning ones, contributions are bounded and sum to
the total, and the structural score is stable under lexical
rewording while the lexical-tell channel collapses. The rarity
suite checks the pooled composition, the paper's direction
reproduced with margin, the crowding mechanism (the AI arm sits
tighter in z-space than the human arm), leave-self-out scoring,
and that degenerate pools degrade to finite values, never NaN.
`bun run demo` panel 4 shows the same numbers against the paper's
reported values.

## Scope

Nothing is trained; weights come from the paper's reported
human–AI gaps, not from fitting. Scope is single-pass generation,
English B2B blog posts, 600–2,500 words. The paper's real
instrument is 214 LLM-scored features validated at kappa 0.93–0.95;
this prototype is ~23 regex proxies and its scores are illustrative,
not calibrated. See `RESEARCH.md` for the full critical review of
the evidence base.
