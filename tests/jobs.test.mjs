import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolate the job store under a temp COUNCIL_HOME for every run.
process.env.COUNCIL_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "council-home-"));

const { generateJobId, writeJob, readJob, patchJob, listJobs, latestJob, reconcile } = await import(
  "../src/core/jobs.mjs"
);

const CWD = "/some/repo";

test("generateJobId is unique and prefixed", () => {
  const a = generateJobId("delegate");
  const b = generateJobId("delegate");
  assert.notEqual(a, b);
  assert.match(a, /^delegate-/);
});

test("write/read/patch/list round-trips", () => {
  const id = generateJobId("delegate");
  writeJob(CWD, { id, kind: "delegate", status: "queued", createdAt: new Date().toISOString(), summary: "x" });
  assert.equal(readJob(CWD, id).status, "queued");
  patchJob(CWD, id, { status: "completed", output: "done" });
  const job = readJob(CWD, id);
  assert.equal(job.status, "completed");
  assert.equal(job.output, "done");
  assert.ok(listJobs(CWD).some((j) => j.id === id));
});

test("latestJob filters and orders newest first", () => {
  const older = generateJobId("delegate");
  writeJob(CWD, { id: older, kind: "delegate", status: "completed", createdAt: "2020-01-01T00:00:00.000Z", output: "old" });
  const newer = generateJobId("delegate");
  writeJob(CWD, { id: newer, kind: "delegate", status: "completed", createdAt: "2030-01-01T00:00:00.000Z", output: "new" });
  const latest = latestJob(CWD, (j) => j.status === "completed");
  assert.equal(latest.id, newer);
});

test("reconcile fails a running job whose pid is dead", () => {
  const id = generateJobId("delegate");
  writeJob(CWD, { id, status: "running", pid: 2147480000, createdAt: new Date().toISOString() });
  const job = reconcile(CWD, readJob(CWD, id));
  assert.equal(job.status, "failed");
});
