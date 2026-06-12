import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { after } from "node:test";

import {
  clearBrokerSession,
  loadBrokerSession,
  sendBrokerShutdown,
  teardownBrokerSession
} from "../plugins/codex/scripts/lib/broker-lifecycle.mjs";
import { terminateProcessTree } from "../plugins/codex/scripts/lib/process.mjs";
import { resolveStateDir } from "../plugins/codex/scripts/lib/state.mjs";

// Every workspace handed out by makeTempDir may have triggered the companion to
// spawn a detached, long-lived app-server broker (the production design: one
// shared broker per workspace, torn down by the SessionEnd hook). Tests never
// fire SessionEnd and use a throwaway workspace per case, so without this the
// brokers and their codex app-server children orphan to PID 1 and accumulate
// forever. Track the dirs and reap them after the file's tests finish.
const tempDirs = new Set();

export function makeTempDir(prefix = "codex-plugin-test-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.add(dir);
  return dir;
}

async function shutdownBrokerForWorkspace(cwd) {
  const session = loadBrokerSession(cwd);
  if (!session) {
    return;
  }

  if (session.endpoint) {
    // Graceful first: broker/shutdown lets the broker close its app-server
    // child cleanly. terminateProcessTree below is the backstop.
    try {
      await sendBrokerShutdown(session.endpoint);
    } catch {
      // Ignore; the process-tree kill below still reaps it.
    }
  }

  teardownBrokerSession({
    endpoint: session.endpoint ?? null,
    pidFile: session.pidFile ?? null,
    logFile: session.logFile ?? null,
    sessionDir: session.sessionDir ?? null,
    pid: session.pid ?? null,
    killProcess: terminateProcessTree
  });
  clearBrokerSession(cwd);
}

export async function cleanupTempDirs() {
  for (const dir of tempDirs) {
    try {
      await shutdownBrokerForWorkspace(dir);
    } catch {
      // Best effort: still remove the directories below.
    }
    fs.rmSync(resolveStateDir(dir), { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.clear();
}

after(cleanupTempDirs);

export function writeExecutable(filePath, source) {
  fs.writeFileSync(filePath, source, { encoding: "utf8", mode: 0o755 });
}

export function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    input: options.input,
    shell: process.platform === "win32" && !path.isAbsolute(command),
    windowsHide: true
  });
}

export function initGitRepo(cwd) {
  run("git", ["init", "-b", "main"], { cwd });
  run("git", ["config", "user.name", "Codex Plugin Tests"], { cwd });
  run("git", ["config", "user.email", "tests@example.com"], { cwd });
  run("git", ["config", "commit.gpgsign", "false"], { cwd });
  run("git", ["config", "tag.gpgsign", "false"], { cwd });
}
