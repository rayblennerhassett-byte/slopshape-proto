---
name: humanize-blog-post
description: Use when rewriting an AI-generated (or AI-sounding) blog post to remove the structural "tidy, self-announcing" template described by the SlopShape paper's Table 6, while preserving every claim, fact, and link.
---

# Humanize a blog post (anti-"slop shape" rewrite)

The SlopShape paper (arXiv:2609.15369) shows AI blog posts share a structural
signature: payoff promised in the title, thesis and announced flow before the
first section, editorial-explainer voice, summary close. Its Table 6 doubles as
a playbook for the opposite profile. This skill runs that playbook — with one
hard rule: **edits preserve claims; gaps are filled with true material or left
open. Never invent an anecdote, a source, or an author.**

## Workflow

1. Run the mechanical pass from `slopshape-proto/`:
   `bun run humanize-cli.ts --json post.md`
   It strips the detectable signposts (payoff title, roadmap sentence,
   summary stage/close, vague attribution, explainer voice) and returns the
   changelog, before/after scores, and `flaggedForGaps`. Human-readable mode:
   `bun run humanize-cli.ts post.md` (text on stdout, report on stderr).
2. Fill every `flaggedForGaps` entry with true material or delete the
   unsupported claim: a first-person anecdote the author actually has, named
   sources for claims that currently rest on "studies show", a participation
   pathway only if a human will read replies, a real byline. Do not skip a
   gap by inventing content to close it.
3. Do the structural edits regex cannot: reorder sections so the argument
   builds instead of listing; break mechanically parallel list items; cut
   paragraphs that exist to look thorough; vary sentence rhythm; replace the
   announced structure with an earned one.
4. Re-score with `bun run cli.ts edited.md`. Expect "ambiguous" or better.
   Do NOT iterate against the score — the paper's finding is that the human
   profile is a different writing process, not a checklist; chasing a number
   just overfits this 23-signal miniature.

## Verify

From `slopshape-proto/`, run `bun test` and confirm the humanizer suite
passes, then re-run the detector on the final text. The claim-preservation
check in `test/humanize.test.ts` is the standard: topical vocabulary must
survive, and the edit list must contain only removals and rewrites.

## Scope

Use only on content you own or are authorized to edit. Where readers expect
disclosure of AI assistance, disclosure wins over detection avoidance — the
goal of this skill is better writing, not deception.
