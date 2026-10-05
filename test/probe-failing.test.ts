import { expect, test } from "bun:test";

// Deliberately failing probe: exists only to prove that a red
// `gates` job blocks the merge on the protected `main` branch.
// Never merged — the probe branch is deleted after the probe.
test("probe: deliberate failure to prove gates block merge", () => {
  expect(1).toBe(2);
});
