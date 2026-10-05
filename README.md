# slopshape-proto

![CI](https://github.com/rayblennerhassett-byte/slopshape-proto/actions/workflows/ci.yml/badge.svg?branch=main)

A miniature, self-contained detector that prototypes the core idea of
**SlopShape: Identifying AI-Generated Commercial Web Content**
(Jochen Madler, Sitefire; [arXiv:2609.15369](https://arxiv.org/abs/2609.15369)):
AI-generated blog posts have a **structural** signature — what they say, in what
order, with what evidence, in what voice — that survives rewording, unlike
word-level signals.

## What this is

Not a reimplementation of the paper's 214-feature LLM-scored instrument. It is
~23 directly observable regex-based proxies for the paper's features — its ten
core values (Table 6), its top-SHAP features (Figure 3), and a few per-source
markers (Table F3) — weighted by the paper's reported human–AI gaps, plus one
deliberately lexical channel (`lexical-tell proxy`, after Kobak et al. 2025)
kept separate so the rewording demo can show lexical brittleness vs structural
robustness.

The "shape" it detects is the paper's **tidy, self-announcing blog post**:
payoff promised in the title, thesis and announced flow before the first
section, editorial-explainer voice, thesis-restating close.

## Quick start

```bash
bun install
bun run demo            # reproduces the paper's §5.1 + §5.4 findings in miniature
bun run detect samples/ai-post.md          # detector CLI (alias of cli.ts)
cat samples/human-post.md | bun run detect
bun run detect --json samples/ai-post.md   # full feature + signal breakdown
bun test                 # run the test suite
bun run scale            # pool-scaling experiment (17 -> 131 configs)
```

Output of `cli.ts` is a 0–1 score (`0 = maximally human-shaped`,
`1 = maximally AI-shaped`) plus a SHAP-style breakdown of which structural
signals pushed the verdict and in which direction — and a second,
independent axis: the structural-rarity percentile (`rarity:` and
`two-axis:` lines; a `rarity` object under `--json`).

## Files

| Path | What it does |
| --- | --- |
| [src/detector.ts](src/detector.ts) | Feature extraction + weighted scoring (`scoreText`) |
| [src/rarity.ts](src/rarity.ts) | The second axis: structural-rarity percentile against a pooled reference corpus |
| [src/pool.ts](src/pool.ts) | The default reference pool: deterministic two-sample, two-arm corpus construction |
| [src/reword.ts](src/reword.ts) | Two rule-based rewording arms (see below) |
| [src/humanize.ts](src/humanize.ts) | The Table 6 humanization playbook, executed |
| [cli.ts](cli.ts) | Score a file or stdin, human-readable or `--json` |
| [humanize-cli.ts](humanize-cli.ts) | Run the humanizer: text on stdout, report on stderr |
| [demo.ts](demo.ts) | The paper's headline findings, reproduced in miniature (exits non-zero on failure) |
| [experiment/scale.ts](experiment/scale.ts) | The pool-scaling experiment: does more scale fix the thresholds? (see below) |
| [samples/](samples/) | One AI-style and one human-style sample post |
| [RESEARCH.md](RESEARCH.md) | Empirical research review (Oct 2026): academic, developer, enthusiast sources, critically reviewed |
| [.agents/skills/detect-ai-content/SKILL.md](.agents/skills/detect-ai-content/SKILL.md) | Agent skill: the detector — surface the AI signature as evidence |
| [.agents/skills/humanize-blog-post/SKILL.md](.agents/skills/humanize-blog-post/SKILL.md) | Agent skill: the full playbook incl. the human-only edits |

## The two poles

The workspace ships two polar-opposite agent skills that share one
feature extractor (`src/detector.ts`), so neither can score on
different terms:

- **[detect-ai-content](.agents/skills/detect-ai-content/SKILL.md)** — the
  defense. Runs the detector and surfaces the tidy, self-announcing
  shape as evidence, weighing the robust structural channel against the
  fragile lexical-tell channel (Kobak et al. 2025), and never accusing
  on the score alone (the false-positive literature).
- **[humanize-blog-post](.agents/skills/humanize-blog-post/SKILL.md)** —
  the attack. Executes Table 6 as a playbook: strips the detectable
  signposts, flags the human-only gaps (anecdote, byline, named sources)
  for true material, and never fabricates.

`bun run demo.ts` shows both in its third panel: detect the AI sample,
humanize it, re-detect it.

## The rewording demo (paper §5.4)

The paper rewords every AI post with the model that wrote it (following the
editing protocol of Chakrabarty et al. 2025) and finds structural detection
unchanged (98.0 → 98.1 macro-F1) while ~73% of 13-grams are destroyed. The demo
approximates this with deterministic rule-based arms:

1. **`rewordLexical`** — LAMP-style surface edits only: purple lexicon, empty
   intensifiers, vague attribution, em-dashes, ordinal signposts. Mirrors the
   paper's claim: **the structural score is unchanged** while the lexical-tell
   channel collapses.
2. **`rewordDeSignpost`** — the lexical arm **plus removal of the tidy
   signposting** (roadmap sentence, thesis-restating close). This attacks the
   paper's core features directly — the strongest edit most "humanizer" tools
   actually make — and the score sags toward the middle but stays net
   AI-leaning, because the remaining AI markers (title payoff, voice, list
   density, CTA intensity, evidence style) are redundant.

## The second axis: structural rarity

The paper's rarity finding is a separate measurement, not another
detector: across a **pooled** corpus (human + AI posts together), human
posts occupy *rare* structural configurations — mean percentile 0.838
vs 0.435 for AI (Cohen's d = 1.83), and the rarest 1% of
configurations holds 149 human posts against 4 AI ones.

[src/rarity.ts](src/rarity.ts) implements it in miniature, as an axis
independent of the template score:

- **Pooled pool, by necessity.** The effect *is*
  human-diversity-vs-AI-crowding. A human-only pool would invert the
  axis into mere atypicality from the human norm — an AI post would
  look "rare" for being far from human writing, which is the opposite
  of the paper's result.
- **Structural vector only.** 25 dimensions of the feature vector
  (booleans as 0/1, densities, word count, problem placement).
  `lexicalTellsPer100` is deliberately excluded: a reworded post must
  not move this axis.
- **Method, per the paper.** z-score every member against the pool's
  per-dimension mean/sd (constant dims → z = 0); a member's score is
  its mean Euclidean distance to its *k* nearest *other* members
  (self excluded); a query's percentile is the fraction of member k-NN
  distances ≤ the query's. `K_NEIGHBORS = 25`, capped at pool size − 1.
- **Scale honesty.** The paper pools 13,500 posts with k = 25; the
  default pool is **17 deterministic configurations** built from the two
  samples — human arm: the human sample, the humanized AI sample, six
  single-feature mutations; AI arm: the AI sample, its lexical and
  de-signposted rewording, the same six mutations. No model calls, no
  randomness. Percentiles therefore move in 1/17 steps, and the human
  sample — the centroid of its own arm — sits near 0.41, not the
  paper's 0.838. **The direction is the finding; exact values are
  illustrative.**
- **More scale does not fix it — composition does.** The
  [pool-scaling experiment](experiment/scale.ts) (`bun run scale`)
  grows the pool under the same construction rule to 131
  configurations (all 2^6−1 mutation combinations, in tiers): the
  plan's original sample-level thresholds (human ≥ 0.7, AI ≤ 0.6)
  never flip, and the mechanism *inverts* — human within-arm spread
  contracts (4.49 → 3.36) while the AI's grows (4.31 → 5.24), so
  from the pairs tier the AI arm mean exceeds the human's. But the
  paper's ~85/15 arm balance (probe: 10.8% human) passes both
  thresholds (0.959 / 0.338) with arm means 0.953 vs 0.453 and
  d = 2.043, close to the paper's 0.838 / 0.435 and 1.83. The
  binding constraint is pool composition, not size; the shipped
  17-config design is the only symmetric tier where the paper's
  direction and mechanism hold, so the tests assert direction with
  a margin rather than the literal thresholds. Validated on two
  further independent sample pairs (`samples/bakery/`,
  `samples/library/`): the composition result and the mechanism
  inversion hold on all three pairs, and the single-feature
  direction holds on all three with a pair-dependent margin
  (0.222 / 0.153 / 0.111) — direction, not the margin, is the
  transferable claim.

`bun run detect` prints both axes, and `bun run demo` panel 4
reproduces the direction (arm means with margin), the effect size,
the rarest-fifth composition, and the crowding mechanism — each shown
against the paper's reported values.

## The humanizer (Table 6 as a playbook)

The paper's Table 6 lists the ten core values that separate AI from human
posts — which also reads as a playbook for the human-leaning profile.
[src/humanize.ts](src/humanize.ts) executes the mechanical part of it:

- **Title** (`PUR_OUT_003`): rewrites payoff-promise titles into a
  first-person experiment frame.
- **Signposts** (`STR_FLW_006`, `STR_STG_001`, `STR_STG_008`): strips the
  roadmap sentence, the summary stage (incl. "Key Takeaways" sections), and
  thesis-restating closing paragraphs.
- **Evidence**: removes vague attribution and empty intensifiers.
- **Voice** (`VOC_VOX_001`): rewrites explainer openers toward a first-person
  register; demotes the purple lexicon.

What it deliberately does **not** do: fabricate. Anecdotes, named sources,
bylines, and participation pathways cannot be invented by a regex, so the
result reports them in `flaggedForGaps` for a human to fill with true
material — or not at all. The verification report (`humanizeWithReport`)
runs the detector on its own output and names the residual AI-leaning
signals. On the sample post: **0.800 → 0.478 (very likely AI → ambiguous)**,
with the participation pathway, legacy contrast, and stakes markers
remaining — consistent with the paper's claim that surface edits cannot
beat the full structural signature.

```bash
bun run humanize samples/ai-post.md            # report to stderr, text to stdout
bun run humanize --json samples/ai-post.md     # everything
```

For the agent-facing playbook (including the structural edits regex cannot
do), see [the humanize-blog-post skill](.agents/skills/humanize-blog-post/SKILL.md).

## Honesty notes

- **Scores are illustrative, not calibrated.** No training data was used; the
  weights come from the paper's reported gaps, not from fitting. Expect no
  meaningful ROC. The paper's real instrument is 187 structural features scored
  by an LLM and validated against human annotators (kappa 0.93–0.95); this
  prototype has ~23 regex proxies.
- **A humanizer's cheat sheet.** Table 6 of the paper doubles as an editing
  checklist: bury the thesis, don't announce structure, skip the summary close,
  name your sources, offer participation. That is an attack on the *core*
  features; the paper's full 187-feature signature is much more redundant.- **Evidence base.** The design follows the literature as of October
  2026 ([RESEARCH.md](RESEARCH.md)): SlopShape (arXiv:2609.15369v2) for
  the structural claim and its rewording robustness; Kobak et al. 2025
  (Science Advances) for the lexical-tell channel and its fragility;
  Chakrabarty et al. (LAMP, arXiv:2409.14509) for the editing protocol;
  Masrour et al. 2025 (DAMAGE, arXiv:2501.03437) for the humanizer
  ecosystem; Hadra et al. 2026, Pangram's benchmarks, and UMD TRAILS
  (2026) for the false-positive caution that keeps the verdicts
  advisory. Word-level baselines (ModernBERT, stylometric, TF-IDF) hit
  ~100 on *unedited* text but collapse under paraphrasing (DetectGPT
  70.3% → 4.6% at 1% FPR, Krishna et al. 2023) — the reason this
  prototype is structural-first.
- **Scope.** The paper's claims cover single-pass generation from five
  frontier models on B2B blog posts, both as generated and after
  self-rewording. This prototype inherits every one of those limits and
  adds its own.

## Test coverage

`bun test` checks: the AI sample hits the paper's core Table 6 template
features and the human sample the human-leaning ones; AI scores above human;
contributions are bounded and sum to the total; the structural score is stable
under lexical rewording while the lexical-tell channel collapses;
de-signposting strips exactly the right features; claims survive the attacks;
the rarity axis (pooled composition, direction reproduction, the crowding
mechanism, leave-self-out scoring, lexical invariance, determinism, and
degenerate-pool safety); every `samples/` pair satisfies the fixture
profile (AI sample hits the Table 6 template features, human sample the
human-leaning profile, scores separate); and edge cases (empty input,
unicode, huge single line).

## How to contribute

`main` is a protected branch: direct pushes, force-pushes, and
deletions are rejected (for everyone, including admins). Changes
land through pull requests:

1. Branch off `main` (`git checkout -b <topic>`).
2. Push the branch and open a PR.
3. CI runs the full gates — typecheck, tests, demo, both
   `detect` checks, and the 3-pair scale experiment — and must
   pass before the PR can merge.
4. Merge (squash; the history is conventional-commit style).

CI can also be re-run on demand from the Actions tab
(Actions → CI → Run workflow), with a `pair` input that runs
the scale experiment on a single sample pair.
