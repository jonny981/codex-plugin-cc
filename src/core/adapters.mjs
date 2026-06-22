import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { binaryAvailable, runCapture } from "./util.mjs";

const PROMPT_PLACEHOLDER = "{prompt}";
const PROMPT_FILE_PLACEHOLDER = "{promptFile}";

export function getAdapter(config, id) {
  const spec = config.adapters[id];
  if (!spec) {
    return null;
  }
  return { id, ...spec };
}

export function listAdapters(config) {
  return Object.keys(config.adapters)
    .sort()
    .map((id) => ({ id, ...config.adapters[id] }));
}

export function checkAvailability(adapter, cwd = process.cwd()) {
  if (!adapter?.bin) {
    return { available: false, detail: "adapter has no `bin` configured" };
  }
  return binaryAvailable(adapter.bin, adapter.versionArgs ?? ["--version"], { cwd });
}

function argsForMode(adapter, mode, write) {
  if (mode === "review") {
    return adapter.reviewArgs ?? adapter.taskArgs ?? [];
  }
  // task / second-opinion
  if (write) {
    return adapter.writeArgs ?? adapter.taskArgs ?? [];
  }
  return adapter.taskArgs ?? adapter.reviewArgs ?? [];
}

function writePromptFile(prompt) {
  const file = path.join(
    os.tmpdir(),
    `council-prompt-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`
  );
  fs.writeFileSync(file, prompt, "utf8");
  return file;
}

/**
 * Build the concrete invocation for an adapter and prompt.
 * Returns { bin, args, stdin, promptFile } where promptFile (if set) must be
 * cleaned up by the caller after the run.
 */
export function buildInvocation(adapter, { prompt, mode = "review", write = false } = {}) {
  const promptVia = adapter.promptVia ?? "stdin";
  const template = argsForMode(adapter, mode, write);
  let promptFile = null;
  let stdin = null;

  const needsFile = promptVia === "file" || template.some((arg) => String(arg).includes(PROMPT_FILE_PLACEHOLDER));
  if (needsFile) {
    promptFile = writePromptFile(prompt);
  }

  const args = template.map((arg) =>
    String(arg)
      .replace(PROMPT_PLACEHOLDER, prompt)
      .replace(PROMPT_FILE_PLACEHOLDER, promptFile ?? "")
  );

  if (promptVia === "stdin") {
    stdin = prompt;
    // If the template already injected the prompt as an arg, do not also pipe it.
    if (template.some((arg) => String(arg).includes(PROMPT_PLACEHOLDER))) {
      stdin = null;
    }
  }

  return { bin: adapter.bin, args, stdin, promptFile };
}

/**
 * Invoke a single adapter with a prompt. Resolves with a normalized result.
 */
export async function invokeAdapter(adapter, options = {}) {
  const availability = checkAvailability(adapter, options.cwd);
  if (!availability.available) {
    return {
      id: adapter.id,
      label: adapter.label ?? adapter.id,
      ok: false,
      missing: true,
      status: null,
      timedOut: false,
      durationMs: 0,
      output: "",
      stderr: "",
      error: `${adapter.bin ?? adapter.id} is not available: ${availability.detail}`
    };
  }

  const invocation = buildInvocation(adapter, options);
  let result;
  try {
    result = await runCapture(invocation.bin, invocation.args, {
      cwd: options.cwd,
      env: adapter.env ? { ...process.env, ...adapter.env } : process.env,
      stdin: invocation.stdin,
      timeoutMs: options.timeoutMs ?? adapter.timeoutMs ?? 0
    });
  } finally {
    if (invocation.promptFile) {
      try {
        fs.unlinkSync(invocation.promptFile);
      } catch {
        /* best effort */
      }
    }
  }

  const ok = !result.error && !result.timedOut && (result.status === 0 || result.status === null);
  const output = result.stdout.trim();
  return {
    id: adapter.id,
    label: adapter.label ?? adapter.id,
    ok: ok && output.length > 0,
    missing: false,
    status: result.status,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    output,
    stderr: result.stderr.trim(),
    error: result.error
      ? result.error.message
      : result.timedOut
        ? `timed out after ${Math.round(result.durationMs / 1000)}s`
        : !ok
          ? `exited with status ${result.status}`
          : output.length === 0
            ? "produced no output"
            : null
  };
}

/**
 * Resolve a requested set of reviewer ids against config + availability.
 * Returns { selected, requested, unknown, unavailable }.
 */
export function resolveReviewers(config, requested, { checkAvailable = true, cwd } = {}) {
  const ids = requested && requested.length > 0 ? requested : config.settings.reviewers ?? [];
  const selected = [];
  const unknown = [];
  const unavailable = [];

  for (const id of ids) {
    const adapter = getAdapter(config, id);
    if (!adapter) {
      unknown.push(id);
      continue;
    }
    if (checkAvailable && !checkAvailability(adapter, cwd).available) {
      unavailable.push(id);
      continue;
    }
    selected.push(adapter);
  }

  return { selected, requested: ids, unknown, unavailable };
}
