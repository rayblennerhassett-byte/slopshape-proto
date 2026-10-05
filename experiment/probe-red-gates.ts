/**
 * Weekly probe: red `gates` must block the merge.
 *
 * Usage: GITHUB_REPOSITORY=<owner/repo> GITHUB_TOKEN=<token> \
 *   bun run experiment/probe-red-gates.ts
 *
 * Opens a probe PR whose only change is a deliberately
 * failing test, waits for the required `gates` check to
 * complete red on its head commit, then attempts the
 * squash merge and fails unless GitHub rejects it. The
 * PR is closed and its branch deleted afterwards, so the
 * protection is re-proven every week instead of resting
 * on the one-time #8 evidence cited in the docs.
 * Exits 1 if the protection did not hold (or could not
 * be proven), 2 on misuse.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    console.error(
      `usage: ${name} must be set to run ` +
        `experiment/probe-red-gates.ts`,
    );
    process.exit(2);
  }
  return value;
}

const repository = requireEnv("GITHUB_REPOSITORY");
const token = requireEnv("GITHUB_TOKEN");

const branchName = `probe/red-gates-${
  process.env.GITHUB_RUN_ID ?? Date.now()
}`;
const prTitle = "probe(red-gates): prove red CI blocks merge";
const commitMessage = "probe: fail gates on purpose";
const probePath = "test/probe-red-gates.test.ts";

/** The probe's only change: a test that fails by design. */
const PROBE_TEST = [
  'import { expect, test } from "bun:test";',
  "",
  "// Written by experiment/probe-red-gates.ts: a",
  "// deliberately failing test that keeps the required",
  "// `gates` check red so the weekly cron can prove",
  "// branch protection blocks the merge. Never exists",
  "// on `main`.",
  'test("probe: this test fails on purpose", () => {',
  "  expect(true).toBe(false);",
  "});",
  "",
].join("\n");

const PR_BODY = [
  "Automated protection probe from the weekly cron",
  "(`experiment/probe-red-gates.ts`).",
  "",
  "The only change is a deliberately failing test, so",
  "the required `gates` check runs red. The cron then",
  "attempts a squash merge and fails the weekly run",
  "unless GitHub rejects it — continuously re-proving",
  "that red CI blocks the merge, rather than relying",
  "on the one-time #8 evidence cited in the README.",
  "",
  "This PR is closed and its branch deleted automatically",
  "once the probe completes. No action is needed.",
].join("\n");

const POLL_TIMEOUT_MS = 30 * 60 * 1000;
const POLL_INTERVAL_MS = 20 * 1000;

interface PullRequest {
  number: number;
  mergeable_state: string;
  head: { sha: string };
}

interface CheckRun {
  name: string;
  status: string;
  conclusion: string | null;
}

async function api(
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`https://api.github.com/repos/${repository}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "slopshape-proto-red-gates-probe",
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function expectOk(
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const response = await api(method, path, body);
  if (!response.ok) {
    throw new Error(`${method} ${path} returned HTTP ${response.status}`);
  }
  return response;
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

let prNumber: number | undefined;
let branchCreated = false;
let exitCode = 0;

try {
  // 1. Create the probe branch on top of the default
  //    branch's head: blob -> tree -> commit -> ref.
  const repo = await json<{ default_branch: string }>(
    await expectOk("GET", ""),
  );
  const base = await json<{ object: { sha: string } }>(
    await expectOk("GET", `/git/ref/heads/${repo.default_branch}`),
  );
  const baseCommit = await json<{ tree: { sha: string } }>(
    await expectOk("GET", `/git/commits/${base.object.sha}`),
  );
  const blob = await json<{ sha: string }>(
    await expectOk("POST", "/git/blobs", {
      content: PROBE_TEST,
      encoding: "utf-8",
    }),
  );
  const tree = await json<{ sha: string }>(
    await expectOk("POST", "/git/trees", {
      base_tree: baseCommit.tree.sha,
      tree: [
        { path: probePath, mode: "100644", type: "blob", sha: blob.sha },
      ],
    }),
  );
  const commit = await json<{ sha: string }>(
    await expectOk("POST", "/git/commits", {
      message: commitMessage,
      tree: tree.sha,
      parents: [base.object.sha],
    }),
  );
  await expectOk("POST", "/git/refs", {
    ref: `refs/heads/${branchName}`,
    sha: commit.sha,
  });
  branchCreated = true;

  // 2. Open the probe PR. The title passes the PR-title
  //    lint so the only red signal is the deliberate
  //    test failure.
  const pr = await json<PullRequest>(
    await expectOk("POST", "/pulls", {
      title: prTitle,
      body: PR_BODY,
      head: branchName,
      base: repo.default_branch,
    }),
  );
  prNumber = pr.number;
  console.log(`probe PR #${pr.number} opened (${branchName})`);

  // 3. Wait for every `gates` run on the head commit to
  //    complete, then require failure.
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let runs: CheckRun[] = [];
  for (;;) {
    const response = await expectOk(
      "GET",
      `/commits/${pr.head.sha}/check-runs?per_page=100`,
    );
    const payload = await json<{ check_runs: CheckRun[] }>(response);
    runs = payload.check_runs.filter((run) => run.name === "gates");
    if (runs.length > 0 && runs.every((run) => run.status === "completed")) {
      break;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `gates did not complete on ${pr.head.sha} within 30 minutes`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  if (!runs.every((run) => run.conclusion === "failure")) {
    throw new Error(
      "gates was expected to fail but concluded: " +
        runs.map((run) => run.conclusion).join(", "),
    );
  }
  console.log(`gates failed on ${pr.head.sha.slice(0, 7)} as expected`);

  // 4. The merge must be rejected by branch protection.
  const current = await json<PullRequest>(
    await expectOk("GET", `/pulls/${pr.number}`),
  );
  if (current.mergeable_state !== "blocked") {
    throw new Error(
      `mergeable_state is "${current.mergeable_state}", expected "blocked"`,
    );
  }
  const merge = await api("PUT", `/pulls/${pr.number}/merge`, {
    merge_method: "squash",
  });
  if (merge.ok) {
    throw new Error(
      "MERGE SUCCEEDED — branch protection accepted a red-CI PR",
    );
  }
  const message =
    ((await merge.json()) as { message?: string }).message ?? "";
  if (!/status check|required/i.test(message)) {
    throw new Error(`merge was rejected for an unexpected reason: ${message}`);
  }
  console.log(`merge rejected by protection: ${message}`);
  console.log(`probe OK: red gates blocked merge of PR #${pr.number}`);
} catch (error) {
  console.error(
    `probe FAILED: ${error instanceof Error ? error.message : error}`,
  );
  exitCode = 1;
}

// Cleanup runs on success and failure alike, so a broken
// probe never leaves a red PR open or a stray branch.
if (prNumber !== undefined) {
  const close = await api("PATCH", `/pulls/${prNumber}`, {
    state: "closed",
  });
  console.log(
    close.ok
      ? `probe PR #${prNumber} closed`
      : `warning: could not close probe PR #${prNumber} (HTTP ${close.status})`,
  );
}
if (branchCreated) {
  const del = await api("DELETE", `/git/refs/heads/${branchName}`);
  console.log(
    del.ok
      ? `branch ${branchName} deleted`
      : `warning: could not delete branch ${branchName} (HTTP ${del.status})`,
  );
}

process.exit(exitCode);

// Top-level await requires this file to be a module.
export {};
