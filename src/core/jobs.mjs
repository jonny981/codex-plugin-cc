import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { userConfigDir } from "./config.mjs";
import { nowIso } from "./util.mjs";

function slug(cwd) {
  return crypto.createHash("sha1").update(path.resolve(cwd)).digest("hex").slice(0, 16);
}

export function jobsDir(cwd) {
  const dir = path.join(userConfigDir(), "jobs", slug(cwd));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function generateJobId(prefix = "job") {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
}

function jobFile(cwd, id) {
  return path.join(jobsDir(cwd), `${id}.json`);
}

export function writeJob(cwd, record) {
  const file = jobFile(cwd, record.id);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
  return record;
}

export function readJob(cwd, id) {
  try {
    return JSON.parse(fs.readFileSync(jobFile(cwd, id), "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export function patchJob(cwd, id, patch) {
  const existing = readJob(cwd, id);
  if (!existing) {
    return null;
  }
  const next = { ...existing, ...patch, updatedAt: nowIso() };
  return writeJob(cwd, next);
}

export function listJobs(cwd) {
  const dir = jobsDir(cwd);
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function latestJob(cwd, filter = () => true) {
  return listJobs(cwd).find(filter) ?? null;
}

// A pid is considered alive if signal 0 does not throw ESRCH.
export function isAlive(pid) {
  if (!pid || !Number.isFinite(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

// Reconcile a stored "running" job whose worker process has died.
export function reconcile(cwd, record) {
  if ((record.status === "running" || record.status === "queued") && record.pid && !isAlive(record.pid)) {
    return patchJob(cwd, record.id, {
      status: "failed",
      error: "worker process exited before reporting a result",
      completedAt: nowIso()
    });
  }
  return record;
}
