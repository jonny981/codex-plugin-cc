import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadConfig } from "../src/core/config.mjs";

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "council-cfg-"));
}

test("loadConfig returns built-in adapters by default", () => {
  const dir = tmpdir();
  const config = loadConfig(dir);
  assert.ok(config.adapters.codex, "codex built-in present");
  assert.ok(config.adapters.claude, "claude built-in present");
  assert.deepEqual(config.settings.reviewers, ["codex", "gemini", "claude"]);
});

test("project config overlays and can add and remove adapters", () => {
  const dir = tmpdir();
  fs.mkdirSync(path.join(dir, ".council"));
  fs.writeFileSync(
    path.join(dir, ".council", "config.json"),
    JSON.stringify({
      settings: { reviewers: ["custom"], synthesizer: "claude" },
      adapters: {
        custom: { label: "Custom", bin: "mycli", promptVia: "arg", reviewArgs: ["{prompt}"] },
        codex: null
      }
    })
  );
  const config = loadConfig(dir);
  assert.ok(config.adapters.custom, "custom adapter added");
  assert.equal(config.adapters.codex, undefined, "codex removed by null");
  assert.deepEqual(config.settings.reviewers, ["custom"]);
  assert.equal(config.settings.synthesizer, "claude");
  // Untouched built-in survives.
  assert.ok(config.adapters.gemini);
});

test("top-level shorthand keys override settings", () => {
  const dir = tmpdir();
  fs.mkdirSync(path.join(dir, ".council"));
  fs.writeFileSync(
    path.join(dir, ".council", "config.json"),
    JSON.stringify({ delegate: "gemini", timeoutMs: 1234 })
  );
  const config = loadConfig(dir);
  assert.equal(config.settings.delegate, "gemini");
  assert.equal(config.settings.timeoutMs, 1234);
});
