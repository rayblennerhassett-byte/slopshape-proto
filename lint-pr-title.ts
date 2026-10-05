/**
 * Lints the PR title against the repo's conventional-commit style.
 *
 * Usage: PR_TITLE="<title>" bun run lint-pr-title.ts
 *
 * Squash merges make the PR title the permanent commit
 * message on main, so the title must be a conventional
 * subject: <type>[(scope)][!]: <description>. Exits 1 on
 * a bad title, 2 on misuse.
 */

const TYPES = [
  "build",
  "chore",
  "ci",
  "docs",
  "feat",
  "fix",
  "perf",
  "probe",
  "refactor",
  "style",
  "test",
];

const CONVENTIONAL = new RegExp(
  `^(${TYPES.join("|")})(\\([\\w./-]+\\))?!?: .+$`,
);

const title = process.env.PR_TITLE;
if (title === undefined) {
  console.error('usage: PR_TITLE="<title>" bun run lint-pr-title.ts');
  process.exit(2);
}

if (!CONVENTIONAL.test(title)) {
  console.error(
    `FAIL PR title is not a conventional-commit subject: ${title}`,
  );
  console.error("expected: <type>[(scope)][!]: <description>");
  console.error(`types: ${TYPES.join(", ")}`);
  process.exit(1);
}

console.log(`PR title ok: ${title}`);
