import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs, parseList } from "./core/args.mjs";
import { loadConfig, ensureUserConfig } from "./core/config.mjs";
import {
  checkAvailability,
  getAdapter,
  invokeAdapter,
  listAdapters,
  resolveReviewers
} from "./core/adapters.mjs";
import { collectReviewContext, resolveReviewTarget } from "./core/git.mjs";
import { renderPrompt } from "./core/prompts.mjs";
import { fanOut } from "./core/fanout.mjs";
import { synthesize } from "./core/synthesize.mjs";
import {
  renderAdapterList,
  renderCouncilResult,
  renderSetupReport
} from "./core/render.mjs";
import {
  generateJobId,
  latestJob,
  listJobs,
  patchJob,
  readJob,
  reconcile,
  writeJob,
  isAlive
} from "./core/jobs.mjs";
import { firstMeaningfulLine, nowIso, shorten } from "./core/util.mjs";

const SELF_PATH = path.resolve(fileURLToPath(new URL("../bin/council.mjs", import.meta.url)));

function out(text) {
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
}

function progressLine(text) {
  process.stderr.write(`${text}\n`);
}

function resolveCwd(options) {
  return options.cwd ? path.resolve(process.cwd(), options.cwd) : process.cwd();
}

function normalizeTimeout(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// ---------------------------------------------------------------------------
// review
// ---------------------------------------------------------------------------

export async function cmdReview(argv) {
  const { options, positionals } = parseArgs(argv, {
    valueOptions: ["base", "scope", "with", "synth", "focus", "timeout", "cwd"],
    booleanOptions: ["adversarial", "json", "quiet"],
    aliasMap: { w: "with", s: "synth" }
  });

  const cwd = resolveCwd(options);
  const config = loadConfig(cwd);
  const focus = options.focus ?? positionals.join(" ").trim();

  const target = resolveReviewTarget(cwd, { base: options.base, scope: options.scope });
  const context = collectReviewContext(cwd, target);

  if (!context.content || context.changedFiles.length === 0) {
    out(`Nothing to review for ${target.label}. The diff is empty.`);
    return 0;
  }

  const promptName = options.adversarial ? "adversarial-review" : "review";
  const prompt = renderPrompt(promptName, {
    TARGET_LABEL: target.label,
    USER_FOCUS: focus || "No specific focus; review broadly.",
    REVIEW_INPUT: context.content
  });

  const { selected, unknown, unavailable } = resolveReviewers(config, parseList(options.with), { cwd });
  if (unknown.length) {
    progressLine(`Skipping unknown adapter(s): ${unknown.join(", ")}`);
  }
  if (unavailable.length) {
    progressLine(`Skipping unavailable adapter(s): ${unavailable.join(", ")} (run \`council setup\`)`);
  }
  if (selected.length === 0) {
    out("No reviewers available. Configure adapters (`council setup`) or pass --with <ids>.");
    return 1;
  }

  const timeoutMs = normalizeTimeout(options.timeout, config.settings.timeoutMs);
  const heading = options.adversarial ? "Adversarial review council" : "Review council";
  if (!options.quiet) {
    progressLine(`Convening ${selected.length} reviewer(s) on ${target.label}: ${selected.map((a) => a.id).join(", ")}`);
  }

  const results = await fanOut(selected, {
    prompt,
    mode: "review",
    cwd,
    timeoutMs,
    onEvent: options.quiet
      ? undefined
      : (event) => {
          if (event.type === "done") {
            progressLine(`  ${event.ok ? "✓" : "✗"} ${event.id} (${Math.round(event.durationMs / 1000)}s)${event.error ? ` — ${event.error}` : ""}`);
          }
        }
  });

  const synthResult = await synthesize(config, results, {
    synthesizer: options.synth,
    subject: `${promptName} of ${target.label}`,
    cwd,
    timeoutMs
  });

  if (options.json) {
    out(JSON.stringify({ target, results, synthesis: synthResult }, null, 2));
    return results.some((r) => r.ok) ? 0 : 1;
  }

  out(renderCouncilResult({ heading, subject: target.label, results, synthesis: synthResult }));
  return results.some((r) => r.ok) ? 0 : 1;
}

// ---------------------------------------------------------------------------
// ask (free-form second opinion)
// ---------------------------------------------------------------------------

export async function cmdAsk(argv) {
  const { options, positionals } = parseArgs(argv, {
    valueOptions: ["with", "synth", "timeout", "base", "scope", "cwd"],
    booleanOptions: ["diff", "json", "quiet"],
    aliasMap: { w: "with", s: "synth" }
  });

  const cwd = resolveCwd(options);
  const config = loadConfig(cwd);
  const question = positionals.join(" ").trim();
  if (!question) {
    out('Provide a question, e.g. council ask "is a queue the right call here?"');
    return 1;
  }

  let contextBlock = "";
  if (options.diff) {
    const target = resolveReviewTarget(cwd, { base: options.base, scope: options.scope });
    const context = collectReviewContext(cwd, target);
    contextBlock = `<context>\nThe following is the current change under discussion (${target.label}):\n\n${context.content}\n</context>`;
  }

  const prompt = renderPrompt("second-opinion", { QUESTION: question, CONTEXT_BLOCK: contextBlock });

  const { selected, unknown, unavailable } = resolveReviewers(config, parseList(options.with), { cwd });
  if (unknown.length) {
    progressLine(`Skipping unknown adapter(s): ${unknown.join(", ")}`);
  }
  if (unavailable.length) {
    progressLine(`Skipping unavailable adapter(s): ${unavailable.join(", ")}`);
  }
  if (selected.length === 0) {
    out("No assistants available. Configure adapters (`council setup`) or pass --with <ids>.");
    return 1;
  }

  const timeoutMs = normalizeTimeout(options.timeout, config.settings.timeoutMs);
  if (!options.quiet) {
    progressLine(`Asking ${selected.length} assistant(s): ${selected.map((a) => a.id).join(", ")}`);
  }

  const results = await fanOut(selected, {
    prompt,
    mode: "task",
    write: false,
    cwd,
    timeoutMs,
    onEvent: options.quiet
      ? undefined
      : (event) => {
          if (event.type === "done") {
            progressLine(`  ${event.ok ? "✓" : "✗"} ${event.id} (${Math.round(event.durationMs / 1000)}s)`);
          }
        }
  });

  const synthResult = await synthesize(config, results, {
    synthesizer: options.synth,
    subject: shorten(question, 120),
    cwd,
    timeoutMs
  });

  if (options.json) {
    out(JSON.stringify({ question, results, synthesis: synthResult }, null, 2));
    return results.some((r) => r.ok) ? 0 : 1;
  }

  out(renderCouncilResult({ heading: "Second-opinion council", subject: shorten(question, 120), results, synthesis: synthResult }));
  return results.some((r) => r.ok) ? 0 : 1;
}

// ---------------------------------------------------------------------------
// delegate
// ---------------------------------------------------------------------------

function buildTaskPrompt(task, write, priorJob) {
  let body = task;
  if (priorJob && priorJob.output) {
    body = [
      "You are continuing earlier work. Here is the previous task and what you reported:",
      "",
      `<previous_task>\n${priorJob.task}\n</previous_task>`,
      "",
      `<previous_result>\n${priorJob.output}\n</previous_result>`,
      "",
      `<continue>\n${task}\n</continue>`
    ].join("\n");
  }
  return renderPrompt("task", {
    TASK: body,
    WRITE_RULE: write
      ? "You may edit files in the repository to complete the task."
      : "Do NOT edit files. Investigate and report; this is a read-only run."
  });
}

export async function cmdDelegate(argv) {
  const { options, positionals } = parseArgs(argv, {
    valueOptions: ["to", "timeout", "cwd"],
    booleanOptions: ["write", "background", "resume", "fresh", "json", "quiet"],
    aliasMap: { t: "to" }
  });

  const cwd = resolveCwd(options);
  const config = loadConfig(cwd);
  const task = positionals.join(" ").trim();
  const adapterId = options.to ?? config.settings.delegate;
  const adapter = getAdapter(config, adapterId);

  if (!adapter) {
    out(`Unknown adapter "${adapterId}". See \`council adapters\`.`);
    return 1;
  }
  if (!checkAvailability(adapter, cwd).available) {
    out(`Adapter "${adapterId}" (\`${adapter.bin}\`) is not available. Run \`council setup\`.`);
    return 1;
  }

  let priorJob = null;
  if (options.resume && !options.fresh) {
    priorJob = latestJob(cwd, (j) => j.kind === "delegate" && j.adapterId === adapterId && j.output);
    if (!priorJob) {
      progressLine(`No prior delegate job found for ${adapterId}; running fresh.`);
    }
  }

  if (!task && !priorJob) {
    out("Provide a task, e.g. council delegate --to codex \"investigate the flaky test\"");
    return 1;
  }

  const write = Boolean(options.write);
  const timeoutMs = normalizeTimeout(options.timeout, config.settings.timeoutMs);
  const prompt = buildTaskPrompt(task || "Continue the previous task to completion.", write, priorJob);

  const job = {
    id: generateJobId("delegate"),
    kind: "delegate",
    adapterId,
    label: adapter.label ?? adapterId,
    task: task || "(continue previous task)",
    write,
    cwd,
    status: "queued",
    createdAt: nowIso(),
    summary: shorten(task || "continue", 96)
  };

  if (options.background) {
    writeJob(cwd, { ...job, prompt, timeoutMs });
    const child = spawn(process.execPath, [SELF_PATH, "__delegate-worker", "--job-id", job.id, "--cwd", cwd], {
      cwd,
      env: process.env,
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.unref();
    patchJob(cwd, job.id, { status: "queued", pid: child.pid ?? null });
    if (options.json) {
      out(JSON.stringify({ jobId: job.id, status: "queued", adapter: adapterId }, null, 2));
    } else {
      out(`Delegated to ${adapterId} in the background as ${job.id}. Check \`council status ${job.id}\` for progress.`);
    }
    return 0;
  }

  // Foreground.
  writeJob(cwd, { ...job, status: "running", startedAt: nowIso(), pid: process.pid });
  if (!options.quiet) {
    progressLine(`Delegating to ${adapterId}${write ? " (write-capable)" : " (read-only)"}...`);
  }
  const result = await invokeAdapter(adapter, { prompt, mode: "task", write, cwd, timeoutMs });
  patchJob(cwd, job.id, {
    status: result.ok ? "completed" : "failed",
    completedAt: nowIso(),
    durationMs: result.durationMs,
    output: result.output,
    error: result.error,
    pid: null
  });

  if (options.json) {
    out(JSON.stringify({ jobId: job.id, ...result }, null, 2));
    return result.ok ? 0 : 1;
  }
  if (result.ok) {
    out(result.output);
  } else {
    out(`Delegation to ${adapterId} failed: ${result.error}`);
    if (result.stderr) {
      progressLine(shorten(result.stderr, 500));
    }
  }
  return result.ok ? 0 : 1;
}

// Internal: background worker that runs a queued delegate job.
export async function cmdDelegateWorker(argv) {
  const { options } = parseArgs(argv, { valueOptions: ["job-id", "cwd"] });
  const cwd = resolveCwd(options);
  const id = options["job-id"];
  if (!id) {
    throw new Error("Missing --job-id");
  }
  const job = readJob(cwd, id);
  if (!job) {
    throw new Error(`No job ${id}`);
  }

  patchJob(cwd, id, { status: "running", startedAt: nowIso(), pid: process.pid });
  const config = loadConfig(cwd);
  const adapter = getAdapter(config, job.adapterId);
  const result = await invokeAdapter(adapter, {
    prompt: job.prompt,
    mode: "task",
    write: job.write,
    cwd,
    timeoutMs: job.timeoutMs
  });
  patchJob(cwd, id, {
    status: result.ok ? "completed" : "failed",
    completedAt: nowIso(),
    durationMs: result.durationMs,
    output: result.output,
    error: result.error,
    pid: null
  });
  return result.ok ? 0 : 1;
}

// ---------------------------------------------------------------------------
// status / result / cancel
// ---------------------------------------------------------------------------

export function cmdStatus(argv) {
  const { options, positionals } = parseArgs(argv, {
    valueOptions: ["cwd"],
    booleanOptions: ["json", "all"]
  });
  const cwd = resolveCwd(options);
  const reference = positionals[0];

  if (reference) {
    const job = reconcile(cwd, readJob(cwd, reference));
    if (!job) {
      out(`No job ${reference}.`);
      return 1;
    }
    if (options.json) {
      out(JSON.stringify(job, null, 2));
    } else {
      out(`${job.id} [${job.status}] ${job.adapterId} — ${job.summary}${job.durationMs ? ` (${Math.round(job.durationMs / 1000)}s)` : ""}`);
      if (job.error) {
        out(`  error: ${job.error}`);
      }
    }
    return 0;
  }

  let jobs = listJobs(cwd).map((job) => reconcile(cwd, job));
  if (!options.all) {
    jobs = jobs.slice(0, 10);
  }
  if (options.json) {
    out(JSON.stringify(jobs, null, 2));
    return 0;
  }
  if (jobs.length === 0) {
    out("No council jobs for this repository yet.");
    return 0;
  }
  out("# Council jobs");
  for (const job of jobs) {
    out(`- ${job.id} [${job.status}] ${job.adapterId} — ${job.summary}`);
  }
  return 0;
}

export function cmdResult(argv) {
  const { options, positionals } = parseArgs(argv, {
    valueOptions: ["cwd"],
    booleanOptions: ["json"]
  });
  const cwd = resolveCwd(options);
  const reference = positionals[0];
  const job = reference ? readJob(cwd, reference) : latestJob(cwd, (j) => j.status === "completed" || j.status === "failed");
  if (!job) {
    out(reference ? `No job ${reference}.` : "No finished job to show.");
    return 1;
  }
  if (options.json) {
    out(JSON.stringify(job, null, 2));
    return 0;
  }
  out(`# ${job.id} [${job.status}] — ${job.adapterId}`);
  out("");
  if (job.output) {
    out(job.output);
  } else if (job.status === "running" || job.status === "queued") {
    out(`Still ${job.status}. Check back with \`council status ${job.id}\`.`);
  } else {
    out(job.error ?? "(no output)");
  }
  return job.status === "completed" ? 0 : 1;
}

export function cmdCancel(argv) {
  const { options, positionals } = parseArgs(argv, {
    valueOptions: ["cwd"],
    booleanOptions: ["json"]
  });
  const cwd = resolveCwd(options);
  const reference = positionals[0];
  const job = reference
    ? readJob(cwd, reference)
    : latestJob(cwd, (j) => j.status === "running" || j.status === "queued");
  if (!job) {
    out(reference ? `No job ${reference}.` : "No active job to cancel.");
    return 1;
  }
  if (job.pid && isAlive(job.pid)) {
    try {
      process.kill(job.pid, "SIGTERM");
    } catch {
      /* ignore */
    }
  }
  patchJob(cwd, job.id, { status: "cancelled", completedAt: nowIso(), error: "cancelled by user", pid: null });
  if (options.json) {
    out(JSON.stringify({ jobId: job.id, status: "cancelled" }, null, 2));
  } else {
    out(`Cancelled ${job.id}.`);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// setup / adapters / init
// ---------------------------------------------------------------------------

export function cmdSetup(argv) {
  const { options } = parseArgs(argv, { valueOptions: ["cwd"], booleanOptions: ["json", "init"] });
  const cwd = resolveCwd(options);
  const config = loadConfig(cwd);

  let note = null;
  if (options.init) {
    const created = ensureUserConfig();
    note = created.created
      ? `Wrote a starter config to ${created.path}. Edit it to add or override adapters.`
      : `Config already exists at ${created.path}.`;
  }

  const adapters = listAdapters(config).map((adapter) => {
    const availability = checkAvailability(adapter, cwd);
    return {
      id: adapter.id,
      label: adapter.label ?? adapter.id,
      bin: adapter.bin,
      available: availability.available,
      detail: availability.detail,
      install: adapter.install ?? null
    };
  });

  const report = { adapters, settings: config.settings, sources: config.sources, note };
  if (options.json) {
    out(JSON.stringify(report, null, 2));
  } else {
    out(renderSetupReport(report));
  }
  return 0;
}

export function cmdAdapters(argv) {
  const { options } = parseArgs(argv, { valueOptions: ["cwd"], booleanOptions: ["json"] });
  const cwd = resolveCwd(options);
  const config = loadConfig(cwd);
  const adapters = listAdapters(config);
  if (options.json) {
    out(JSON.stringify(adapters, null, 2));
  } else {
    out(renderAdapterList(adapters));
  }
  return 0;
}

export const HELP = `council — convene a council of AI coding assistants

Usage:
  council review [--adversarial] [--base <ref>] [--scope auto|working-tree|branch]
                 [--with <ids>] [--synth self|<id>] [--focus "text"] [--timeout <ms>] [--json]
  council ask "<question>" [--diff] [--with <ids>] [--synth self|<id>] [--json]
  council delegate "<task>" [--to <id>] [--write] [--background] [--resume] [--json]
  council status [<job-id>] [--all] [--json]
  council result [<job-id>] [--json]
  council cancel [<job-id>]
  council setup [--init] [--json]
  council adapters [--json]

Concepts:
  reviewers   the assistants convened in parallel (config: settings.reviewers, or --with)
  synthesizer "self" emits each response for the calling harness to merge; an adapter
              id makes that assistant write the consolidated report (config: settings.synthesizer)
  adapters    how council invokes each assistant CLI; built-ins are overridable and new
              ones are addable via ~/.council/config.json or ./.council/config.json

Run \`council setup\` to see which assistants are installed.
`;

export function cmdHelp() {
  out(HELP);
  return 0;
}
