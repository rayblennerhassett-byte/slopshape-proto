import { expect, test } from "bun:test";

// Written by experiment/probe-red-gates.ts: a
// deliberately failing test that keeps the required
// `gates` check red so the weekly cron can prove
// branch protection blocks the merge. Never exists
// on `main`.
test("probe: this test fails on purpose", () => {
  expect(true).toBe(false);
});
