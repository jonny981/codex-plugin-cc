import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const MAX_UNTRACKED_BYTES = 24 * 1024;

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return {
    status: result.status ?? (result.error ? 1 : 0),
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ?? null
  };
}

function gitChecked(cwd, args) {
  const result = git(cwd, args);
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim() || `exit ${result.status}`}`);
  }
  return result;
}

export function ensureGitRepository(cwd) {
  const result = git(cwd, ["rev-parse", "--show-toplevel"]);
  if (result.error && result.error.code === "ENOENT") {
    throw new Error("git is not installed. Install Git and retry.");
  }
  if (result.status !== 0) {
    throw new Error("This command must run inside a Git repository.");
  }
  return result.stdout.trim();
}

function getRepoRoot(cwd) {
  return gitChecked(cwd, ["rev-parse", "--show-toplevel"]).stdout.trim();
}

function getCurrentBranch(cwd) {
  return gitChecked(cwd, ["branch", "--show-current"]).stdout.trim() || "HEAD";
}

function detectDefaultBranch(cwd) {
  const symbolic = git(cwd, ["symbolic-ref", "refs/remotes/origin/HEAD"]);
  if (symbolic.status === 0) {
    const remoteHead = symbolic.stdout.trim();
    if (remoteHead.startsWith("refs/remotes/origin/")) {
      return remoteHead.replace("refs/remotes/origin/", "");
    }
  }
  for (const candidate of ["main", "master", "trunk"]) {
    if (git(cwd, ["show-ref", "--verify", "--quiet", `refs/heads/${candidate}`]).status === 0) {
      return candidate;
    }
    if (git(cwd, ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${candidate}`]).status === 0) {
      return `origin/${candidate}`;
    }
  }
  throw new Error("Unable to detect the default branch. Pass --base <ref> or use --scope working-tree.");
}

function getWorkingTreeState(cwd) {
  const split = (out) => out.trim().split("\n").filter(Boolean);
  const staged = split(gitChecked(cwd, ["diff", "--cached", "--name-only"]).stdout);
  const unstaged = split(gitChecked(cwd, ["diff", "--name-only"]).stdout);
  const untracked = split(gitChecked(cwd, ["ls-files", "--others", "--exclude-standard"]).stdout);
  return { staged, unstaged, untracked, isDirty: staged.length + unstaged.length + untracked.length > 0 };
}

export function resolveReviewTarget(cwd, options = {}) {
  ensureGitRepository(cwd);
  const scope = options.scope ?? "auto";
  if (options.base) {
    return { mode: "branch", label: `branch diff against ${options.base}`, baseRef: options.base };
  }
  if (scope === "working-tree") {
    return { mode: "working-tree", label: "working tree diff" };
  }
  if (scope === "branch") {
    const base = detectDefaultBranch(cwd);
    return { mode: "branch", label: `branch diff against ${base}`, baseRef: base };
  }
  if (scope !== "auto") {
    throw new Error(`Unsupported scope "${scope}". Use auto, working-tree, or branch (or --base <ref>).`);
  }
  if (getWorkingTreeState(cwd).isDirty) {
    return { mode: "working-tree", label: "working tree diff" };
  }
  const base = detectDefaultBranch(cwd);
  return { mode: "branch", label: `branch diff against ${base}`, baseRef: base };
}

function isProbablyText(buffer) {
  const sample = buffer.subarray(0, 8000);
  for (const byte of sample) {
    if (byte === 0) {
      return false;
    }
  }
  return true;
}

function formatUntracked(cwd, relativePath) {
  const absolute = path.join(cwd, relativePath);
  let stat;
  try {
    stat = fs.statSync(absolute);
  } catch {
    return `### ${relativePath}\n(skipped: unreadable)`;
  }
  if (stat.isDirectory()) {
    return `### ${relativePath}\n(skipped: directory)`;
  }
  if (stat.size > MAX_UNTRACKED_BYTES) {
    return `### ${relativePath}\n(skipped: ${stat.size} bytes exceeds limit)`;
  }
  const buffer = fs.readFileSync(absolute);
  if (!isProbablyText(buffer)) {
    return `### ${relativePath}\n(skipped: binary)`;
  }
  return [`### ${relativePath}`, "```", buffer.toString("utf8").trimEnd(), "```"].join("\n");
}

function section(title, body) {
  return [`## ${title}`, "", body && body.trim() ? body.trim() : "(none)", ""].join("\n");
}

/**
 * Collect the review context (diff + status) for a target. Returns
 * { repoRoot, branch, target, summary, content, changedFiles }.
 */
export function collectReviewContext(cwd, target) {
  const repoRoot = getRepoRoot(cwd);
  const branch = getCurrentBranch(repoRoot);

  if (target.mode === "working-tree") {
    const state = getWorkingTreeState(repoRoot);
    const status = gitChecked(repoRoot, ["status", "--short", "--untracked-files=all"]).stdout;
    const stagedDiff = gitChecked(repoRoot, ["diff", "--cached", "--no-ext-diff"]).stdout;
    const unstagedDiff = gitChecked(repoRoot, ["diff", "--no-ext-diff"]).stdout;
    const untracked = state.untracked.map((file) => formatUntracked(repoRoot, file)).join("\n\n");
    const changedFiles = [...new Set([...state.staged, ...state.unstaged, ...state.untracked])].sort();
    return {
      repoRoot,
      branch,
      target,
      changedFiles,
      summary: `Reviewing ${state.staged.length} staged, ${state.unstaged.length} unstaged, ${state.untracked.length} untracked file(s) on ${branch}.`,
      content: [
        section("Git Status", status),
        section("Staged Diff", stagedDiff),
        section("Unstaged Diff", unstagedDiff),
        section("Untracked Files", untracked)
      ].join("\n")
    };
  }

  const base = target.baseRef;
  const mergeBase = gitChecked(repoRoot, ["merge-base", "HEAD", base]).stdout.trim();
  const range = `${mergeBase}..HEAD`;
  const changedFiles = gitChecked(repoRoot, ["diff", "--name-only", range]).stdout.trim().split("\n").filter(Boolean);
  const log = gitChecked(repoRoot, ["log", "--oneline", "--decorate", range]).stdout;
  const stat = gitChecked(repoRoot, ["diff", "--stat", range]).stdout;
  const diff = gitChecked(repoRoot, ["diff", "--no-ext-diff", range]).stdout;
  return {
    repoRoot,
    branch,
    target,
    changedFiles,
    summary: `Reviewing branch ${branch} against ${base} (merge-base ${mergeBase.slice(0, 12)}).`,
    content: [section("Commit Log", log), section("Diff Stat", stat), section("Diff", diff)].join("\n")
  };
}
