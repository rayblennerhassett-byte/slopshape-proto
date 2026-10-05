/**
 * Verifies the probe-PR citations in the docs against the GitHub API.
 *
 * Usage: bun run experiment/verify-citations.ts [doc.md ...]
 *
 * README.md and .github/pull_request_template.md are scanned by
 * default. Every "probe PR (#N, YYYY-MM-DD)" citation must still
 * point at a real PR that is closed without being merged, was
 * created on the cited date, and had a failing `gates` check run
 * on its head commit — the evidence behind the docs' "red gates
 * blocked the merge" claim. Exits 1 on any drift.
 */
import { readFileSync } from "node:fs";

const CITATION = /probe PR \(#(\d+), (\d{4}-\d{2}-\d{2})\)/g;
const DEFAULT_DOCS = ["README.md", ".github/pull_request_template.md"];

interface PullRequest {
  state: string;
  merged: boolean;
  created_at: string;
  head: { sha: string };
}

interface CheckRun {
  name: string;
  status: string;
  conclusion: string | null;
}

const docs = process.argv.slice(2);
const files = docs.length > 0 ? docs : DEFAULT_DOCS;

const repository = process.env.GITHUB_REPOSITORY;
if (!repository) {
  console.error("GITHUB_REPOSITORY is not set");
  process.exit(2);
}
const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error(
    "warning: GITHUB_TOKEN not set; using the unauthenticated " +
      "API (public repositories only)",
  );
}

async function get(path: string): Promise<Response> {
  return fetch(`https://api.github.com/repos/${repository}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "slopshape-proto-citation-check",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

const failures: string[] = [];

for (const file of files) {
  const citations = [...readFileSync(file, "utf8").matchAll(CITATION)];
  if (citations.length === 0) {
    failures.push(`${file}: no probe PR citation found`);
    continue;
  }
  for (const [, number, date] of citations) {
    const label = `${file}: probe PR #${number}`;
    const response = await get(`/pulls/${number}`);
    if (response.status === 404) {
      failures.push(`${label}: no such PR (cited on ${date})`);
      continue;
    }
    if (!response.ok) {
      failures.push(`${label}: pulls API returned HTTP ${response.status}`);
      continue;
    }
    const pr = (await response.json()) as PullRequest;
    if (pr.state !== "closed" || pr.merged) {
      failures.push(
        `${label}: state=${pr.state} merged=${pr.merged}; the docs ` +
          `say it stayed blocked until it was closed`,
      );
    }
    if (pr.created_at.slice(0, 10) !== date) {
      failures.push(
        `${label}: created ${pr.created_at.slice(0, 10)} but cited ` +
          `on ${date}`,
      );
    }
    const runs = await get(`/commits/${pr.head.sha}/check-runs`);
    if (!runs.ok) {
      failures.push(`${label}: check-runs API returned HTTP ${runs.status}`);
      continue;
    }
    const { check_runs } = (await runs.json()) as { check_runs: CheckRun[] };
    const redGates = check_runs.some(
      (run) =>
        run.name === "gates" &&
        run.status === "completed" &&
        run.conclusion === "failure",
    );
    if (!redGates) {
      failures.push(
        `${label}: no completed failing \`gates\` run on head commit ` +
          `${pr.head.sha}`,
      );
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}
console.log(`probe-PR citations verified in ${files.join(", ")}`);
