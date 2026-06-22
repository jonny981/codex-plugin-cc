import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

export function shorten(text, limit = 96) {
  const normalized = String(text ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit - 3)}...`;
}

export function firstMeaningfulLine(text, fallback = "") {
  const line = String(text ?? "")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find(Boolean);
  return line ?? fallback;
}

export function nowIso() {
  return new Date().toISOString();
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Is a binary present and runnable on PATH? Returns {available, detail}.
export function binaryAvailable(command, versionArgs = ["--version"], options = {}) {
  const result = spawnSync(command, versionArgs, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: "utf8",
    timeout: options.timeout ?? 8000,
    windowsHide: true
  });
  if (result.error && result.error.code === "ENOENT") {
    return { available: false, detail: "not found on PATH" };
  }
  if (result.error) {
    return { available: false, detail: result.error.message };
  }
  // Many CLIs exit non-zero for `--version` quirks; presence is what matters here.
  const detail = (result.stdout || result.stderr || "").trim().split(/\r?\n/)[0] || "present";
  return { available: true, detail };
}

/**
 * Run a command to completion, capturing stdout/stderr with a hard timeout.
 * Resolves with { status, signal, stdout, stderr, timedOut, durationMs, error }.
 * Never rejects on a non-zero exit — only on a failure to spawn.
 */
export function runCapture(command, args = [], options = {}) {
  return new Promise((resolve) => {
    const start = Date.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    let child;
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
        windowsHide: true
      });
    } catch (error) {
      resolve({ status: null, signal: null, stdout: "", stderr: "", timedOut: false, durationMs: 0, error });
      return;
    }

    const maxBytes = options.maxBytes ?? 8 * 1024 * 1024;
    const append = (bufferRef, chunk) => {
      const next = bufferRef.value + chunk;
      bufferRef.value = next.length > maxBytes ? next.slice(next.length - maxBytes) : next;
    };
    const outRef = { value: "" };
    const errRef = { value: "" };

    child.stdout?.on("data", (chunk) => append(outRef, chunk.toString("utf8")));
    child.stderr?.on("data", (chunk) => append(errRef, chunk.toString("utf8")));

    if (options.stdin != null) {
      child.stdin?.on("error", () => {});
      child.stdin?.end(options.stdin);
    } else {
      child.stdin?.end();
    }

    const timeoutMs = options.timeoutMs ?? 0;
    let timer = null;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill("SIGTERM");
        } catch {
          /* ignore */
        }
        setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            /* ignore */
          }
        }, 2000).unref?.();
      }, timeoutMs);
      timer.unref?.();
    }

    const finish = (status, signal, error = null) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      stdout = outRef.value;
      stderr = errRef.value;
      resolve({
        status,
        signal,
        stdout,
        stderr,
        timedOut,
        durationMs: Date.now() - start,
        error
      });
    };

    child.on("error", (error) => finish(null, null, error));
    child.on("close", (code, signal) => finish(code, signal));
  });
}
