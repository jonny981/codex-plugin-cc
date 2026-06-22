import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildInvocation, invokeAdapter } from "../src/core/adapters.mjs";
import { fanOut } from "../src/core/fanout.mjs";
import { synthesize } from "../src/core/synthesize.mjs";

// A cross-platform fake assistant: echoes a tag, its argv, and any stdin it got.
function writeFake(dir) {
  const file = path.join(dir, "fake.mjs");
  fs.writeFileSync(
    file,
    [
      "let stdin = '';",
      "process.stdin.on('data', (c) => { stdin += c; });",
      "process.stdin.on('end', () => {",
      "  const tag = process.env.FAKE_TAG || 'fake';",
      "  process.stdout.write(`[${tag}] args=${JSON.stringify(process.argv.slice(2))} stdinBytes=${stdin.length}`);",
      "});",
      "process.stdin.resume();"
    ].join("\n")
  );
  return file;
}

function fakeAdapter(id, fakeScript, extra = {}) {
  return {
    id,
    label: `Fake ${id}`,
    bin: process.execPath,
    versionArgs: ["--version"],
    promptVia: "stdin",
    reviewArgs: [fakeScript],
    taskArgs: [fakeScript],
    writeArgs: [fakeScript],
    env: { FAKE_TAG: id },
    ...extra
  };
}

test("buildInvocation pipes prompt via stdin", () => {
  const inv = buildInvocation(fakeAdapter("r1", "/x/fake.mjs"), { prompt: "hello", mode: "review" });
  assert.equal(inv.stdin, "hello");
  assert.deepEqual(inv.args, ["/x/fake.mjs"]);
  assert.equal(inv.promptFile, null);
});

test("buildInvocation substitutes {prompt} in arg mode", () => {
  const adapter = {
    id: "a",
    bin: "x",
    promptVia: "arg",
    reviewArgs: ["run", "{prompt}"]
  };
  const inv = buildInvocation(adapter, { prompt: "do it", mode: "review" });
  assert.deepEqual(inv.args, ["run", "do it"]);
  assert.equal(inv.stdin, null);
});

test("buildInvocation writes a prompt file for {promptFile}", () => {
  const adapter = { id: "a", bin: "x", promptVia: "file", reviewArgs: ["--file", "{promptFile}"] };
  const inv = buildInvocation(adapter, { prompt: "payload", mode: "review" });
  assert.ok(inv.promptFile, "promptFile path set");
  assert.equal(fs.readFileSync(inv.promptFile, "utf8"), "payload");
  assert.deepEqual(inv.args, ["--file", inv.promptFile]);
  fs.unlinkSync(inv.promptFile);
});

test("invokeAdapter runs the binary and captures stdout", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "council-fan-"));
  const fake = writeFake(dir);
  const result = await invokeAdapter(fakeAdapter("r1", fake), { prompt: "abc", mode: "review" });
  assert.equal(result.ok, true);
  assert.match(result.output, /\[r1\]/);
  assert.match(result.output, /stdinBytes=3/);
});

test("invokeAdapter reports a missing binary", async () => {
  const result = await invokeAdapter(
    { id: "nope", label: "Nope", bin: "definitely-not-a-real-binary-xyz", reviewArgs: [] },
    { prompt: "x", mode: "review" }
  );
  assert.equal(result.ok, false);
  assert.equal(result.missing, true);
});

test("fanOut runs every adapter and reports progress", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "council-fan-"));
  const fake = writeFake(dir);
  const events = [];
  const results = await fanOut([fakeAdapter("r1", fake), fakeAdapter("r2", fake)], {
    prompt: "review this",
    mode: "review",
    onEvent: (e) => events.push(e)
  });
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.ok));
  assert.equal(events.filter((e) => e.type === "done").length, 2);
});

test("synthesize self skips and defers to the harness", async () => {
  const config = { adapters: {}, settings: { synthesizer: "self" } };
  const synth = await synthesize(config, [{ ok: true, output: "x", id: "r1", label: "r1" }], {});
  assert.equal(synth.mode, "self");
  assert.equal(synth.skipped, true);
});

test("synthesize with a single response passes it through", async () => {
  const config = { adapters: { chair: { bin: "x" } }, settings: { synthesizer: "chair" } };
  const synth = await synthesize(config, [{ ok: true, output: "only-one", id: "r1", label: "r1" }], {});
  assert.equal(synth.report, "only-one");
  assert.equal(synth.skipped, true);
});

test("synthesize with an adapter merges multiple responses", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "council-syn-"));
  const fake = writeFake(dir);
  const config = {
    adapters: { chair: fakeAdapter("chair", fake) },
    settings: { synthesizer: "chair" }
  };
  const synth = await synthesize(
    config,
    [
      { ok: true, output: "finding A", id: "r1", label: "r1" },
      { ok: true, output: "finding B", id: "r2", label: "r2" }
    ],
    { subject: "test" }
  );
  assert.equal(synth.ok, true);
  assert.match(synth.report, /\[chair\]/);
});
