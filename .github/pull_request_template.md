## What

<!-- One or two sentences: what this changes and why. -->

## Checklist

`main` is a protected branch: direct pushes, force-pushes and deletions
are rejected, and the `gates` CI job must pass before this PR can merge.

- [ ] Changes are on a branch off `main`, up to date with it
- [ ] CI is green: `typecheck`, `bun test ./test`, `demo`, both `detect`
      checks, and the scale experiment
- [ ] Squash-merge with a conventional-commit subject

## Notes

<!-- Trade-offs, experiment output, follow-ups for reviewers. -->
