/**
 * Scheduled cleanup: prune per-run scale-output artifacts.
 *
 * Usage: GITHUB_REPOSITORY=<owner/repo> GITHUB_TOKEN=<token>
 *   bun run experiment/prune-artifacts.ts [--dry-run]
 *
 * Deletes every artifact whose name starts with `scale-output`
 * but is not the `scale-output-weekly` baseline, once its
 * created_at is older than 30 days. Per-run uploads already
 * self-expire after 7 days (retention-days in ci.yml), so
 * this cron is the backstop for anything that predates the
 * cap or slips past it. The weekly baselines are
 * the drift check's only comparison point, so they are never
 * touched; GitHub's own 90-day expiry reaps them if a weekly
 * run ever stops. Exits 1 if any delete fails, 2 on misuse.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    console.error(
      `usage: ${name} must be set to run ` +
        `experiment/prune-artifacts.ts`,
    );
    process.exit(2);
  }
  return value;
}

const repository = requireEnv("GITHUB_REPOSITORY");
const token = requireEnv("GITHUB_TOKEN");

const dryRun = process.argv.includes("--dry-run");
const runNamePrefix = "scale-output";
const keepName = "scale-output-weekly";
const maxAgeMs = 30 * 24 * 60 * 60 * 1000;
const pageSize = 100;

interface Artifact {
  id: number;
  name: string;
  created_at: string;
}

async function api(
  method: string,
  path: string,
): Promise<Response> {
  return fetch(`https://api.github.com/repos/${repository}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "slopshape-proto-artifact-pruner",
      Authorization: `Bearer ${token}`,
    },
  });
}

async function expectOk(
  method: string,
  path: string,
): Promise<Response> {
  const response = await api(method, path);
  if (!response.ok) {
    throw new Error(`${method} ${path} returned HTTP ${response.status}`);
  }
  return response;
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function listArtifacts(): Promise<Artifact[]> {
  const artifacts: Artifact[] = [];
  for (let page = 1; ; page++) {
    const payload = await json<{ artifacts: Artifact[] }>(
      await expectOk(
        "GET",
        `/actions/artifacts?per_page=${pageSize}&page=${page}`,
      ),
    );
    artifacts.push(...payload.artifacts);
    if (payload.artifacts.length < pageSize) {
      return artifacts;
    }
  }
}

let exitCode = 0;

try {
  const cutoff = Date.now() - maxAgeMs;
  const stale = (await listArtifacts())
    .filter(
      (artifact) =>
        artifact.name.startsWith(runNamePrefix) &&
        artifact.name !== keepName &&
        Date.parse(artifact.created_at) < cutoff,
    )
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

  if (stale.length === 0) {
    console.log(
      `nothing to prune: no non-weekly ${runNamePrefix} artifact is older than 30 days`,
    );
  }

  for (const artifact of stale) {
    if (dryRun) {
      console.log(
        `would delete ${artifact.name} (id ${artifact.id}, created ${artifact.created_at})`,
      );
      continue;
    }
    const response = await api("DELETE", `/actions/artifacts/${artifact.id}`);
    if (response.ok || response.status === 404) {
      console.log(
        `deleted ${artifact.name} (id ${artifact.id}, created ${artifact.created_at})`,
      );
    } else {
      exitCode = 1;
      console.error(
        `could not delete ${artifact.name} (id ${artifact.id}): HTTP ${response.status}`,
      );
    }
  }

  if (!dryRun && stale.length > 0) {
    console.log(`pruned ${stale.length} stale artifact(s)`);
  }
} catch (error) {
  console.error(
    `pruner FAILED: ${error instanceof Error ? error.message : error}`,
  );
  exitCode = 1;
}

process.exit(exitCode);

// Top-level await requires this file to be a module.
export {};
