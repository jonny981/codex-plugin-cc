import { shorten } from "./util.mjs";

function durationLabel(ms) {
  if (!ms || ms < 1000) {
    return `${ms ?? 0}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

function memberHeader(result) {
  const status = result.ok ? "ok" : result.missing ? "unavailable" : "failed";
  return `### ${result.label} (${result.id}) — ${status}, ${durationLabel(result.durationMs)}`;
}

/**
 * Render the full fan-out result as Markdown for a human or a harness to read.
 * When synthesis ran on an assistant, its report leads; the raw member outputs
 * follow for transparency. When synthesis is "self", the raw outputs are the
 * payload and the trailing note tells the harness to synthesize them.
 */
export function renderCouncilResult({ heading, subject, results, synthesis }) {
  const lines = [];
  lines.push(`# ${heading}`);
  lines.push("");
  lines.push(`Subject: ${subject}`);
  const okCount = results.filter((r) => r.ok).length;
  lines.push(`Council: ${results.length} member(s) convened, ${okCount} responded.`);
  lines.push("");

  if (synthesis && synthesis.ok && synthesis.report) {
    lines.push(`## Synthesis (by ${synthesis.synthesizerId})`);
    lines.push("");
    lines.push(synthesis.report.trim());
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## Individual council responses");
    lines.push("");
  } else if (synthesis && synthesis.mode === "self") {
    lines.push("## Council responses");
    lines.push("");
    lines.push(
      "_Synthesis is set to `self`: the responses from each member are below. Synthesize them into one consolidated, de-duplicated assessment — note where members agree (higher confidence), keep single-source findings flagged as such, and surface any disagreements._"
    );
    lines.push("");
  } else {
    lines.push("## Council responses");
    if (synthesis && synthesis.error) {
      lines.push("");
      lines.push(`_Synthesis was requested but did not run: ${synthesis.error}_`);
    }
    lines.push("");
  }

  for (const result of results) {
    lines.push(memberHeader(result));
    lines.push("");
    if (result.ok && result.output) {
      lines.push(result.output.trim());
    } else {
      lines.push(`> ${result.error ?? "no output"}`);
      if (result.stderr) {
        lines.push(">");
        lines.push(`> stderr: ${shorten(result.stderr, 300)}`);
      }
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

export function renderSetupReport(report) {
  const lines = [];
  lines.push("# council setup");
  lines.push("");
  lines.push("## Adapters");
  for (const adapter of report.adapters) {
    const mark = adapter.available ? "✓" : "✗";
    const detail = adapter.available ? adapter.detail : `${adapter.detail}${adapter.install ? ` — install: ${adapter.install}` : ""}`;
    lines.push(`- ${mark} ${adapter.id} (${adapter.label}) — \`${adapter.bin}\` — ${detail}`);
  }
  lines.push("");
  lines.push("## Settings");
  lines.push(`- reviewers: ${report.settings.reviewers.join(", ")}`);
  lines.push(`- synthesizer: ${report.settings.synthesizer}`);
  lines.push(`- delegate: ${report.settings.delegate}`);
  lines.push("");
  lines.push("## Config sources");
  if (report.sources.length === 0) {
    lines.push("- (built-in defaults only; no user or project config found)");
  } else {
    for (const source of report.sources) {
      lines.push(`- ${source}`);
    }
  }
  if (report.note) {
    lines.push("");
    lines.push(report.note);
  }
  return `${lines.join("\n")}\n`;
}

export function renderAdapterList(adapters) {
  const lines = ["# Configured adapters", ""];
  for (const adapter of adapters) {
    lines.push(`- **${adapter.id}** — ${adapter.label ?? adapter.id} (\`${adapter.bin ?? "?"}\`, prompt via ${adapter.promptVia ?? "stdin"})`);
  }
  return `${lines.join("\n")}\n`;
}
