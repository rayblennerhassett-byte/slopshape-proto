## What

<!-- One or two sentences: what this changes and why. -->

## Checklist

`main` is a protected branch: direct pushes, force-pushes and deletions
are rejected, and the `gates` CI job must pass before this PR can merge.

The rule is enforced by branch protection and was verified with a
deliberately failing probe PR (#8, 2026-10-05): it stayed blocked
until it was closed.

- [ ] Changes are on a branch off `main`, up to date with it
- [ ] CI is green: `typecheck`, `bun test ./test`, `demo`, both `detect`
      checks, the scale experiment, the doc-citation check, and the
      PR-title lint
- [ ] Squash-merge with a conventional-commit subject

## Notes

<!-- Trade-offs, experiment output, follow-ups for reviewers. -->
