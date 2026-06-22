import { test } from "node:test";
import assert from "node:assert/strict";

import { parseArgs, splitRawArgumentString, parseList } from "../src/core/args.mjs";

test("parseArgs handles value, boolean, alias, and positionals", () => {
  const { options, positionals } = parseArgs(
    ["--with", "a,b", "-s", "claude", "--adversarial", "focus", "text"],
    {
      valueOptions: ["with", "synth"],
      booleanOptions: ["adversarial"],
      aliasMap: { s: "synth" }
    }
  );
  assert.equal(options.with, "a,b");
  assert.equal(options.synth, "claude");
  assert.equal(options.adversarial, true);
  assert.deepEqual(positionals, ["focus", "text"]);
});

test("parseArgs supports --key=value", () => {
  const { options } = parseArgs(["--base=main"], { valueOptions: ["base"] });
  assert.equal(options.base, "main");
});

test("parseArgs throws on missing value", () => {
  assert.throws(() => parseArgs(["--with"], { valueOptions: ["with"] }), /Missing value/);
});

test("splitRawArgumentString respects quotes and escapes", () => {
  assert.deepEqual(splitRawArgumentString('review --focus "auth and retries"'), [
    "review",
    "--focus",
    "auth and retries"
  ]);
  assert.deepEqual(splitRawArgumentString("a\\ b c"), ["a b", "c"]);
});

test("parseList splits on commas and whitespace", () => {
  assert.deepEqual(parseList("codex, gemini  claude"), ["codex", "gemini", "claude"]);
  assert.deepEqual(parseList(undefined), []);
});
