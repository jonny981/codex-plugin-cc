import { getAdapter, invokeAdapter, checkAvailability } from "./adapters.mjs";
import { renderPrompt } from "./prompts.mjs";

// Assemble the council members' responses into a single block for the chair.
export function buildResponsesBlock(results) {
  return results
    .filter((result) => result.ok && result.output)
    .map((result) => {
      return [`===== Council member: ${result.label} (${result.id}) =====`, "", result.output.trim(), ""].join("\n");
    })
    .join("\n");
}

/**
 * Synthesize fan-out results.
 *  - mode "self"/"none": no assistant is called; the caller (harness) synthesizes.
 *  - mode = an adapter id: that assistant writes the consolidated report.
 * Returns { mode, synthesizerId, report, ok, error, skipped, reason }.
 */
export async function synthesize(config, results, options = {}) {
  const ok = results.filter((result) => result.ok && result.output);
  const requested = options.synthesizer ?? config.settings.synthesizer ?? "self";

  if (requested === "self" || requested === "none" || !requested) {
    return { mode: "self", synthesizerId: null, report: null, ok: true, skipped: true, reason: "harness-synthesizes" };
  }

  if (ok.length === 0) {
    return { mode: requested, synthesizerId: requested, report: null, ok: false, skipped: true, reason: "no-member-output" };
  }

  if (ok.length === 1) {
    // One response needs no synthesis; pass it straight through.
    return {
      mode: requested,
      synthesizerId: requested,
      report: ok[0].output,
      ok: true,
      skipped: true,
      reason: "single-response"
    };
  }

  const adapter = getAdapter(config, requested);
  if (!adapter) {
    return { mode: requested, synthesizerId: requested, report: null, ok: false, error: `Unknown synthesizer adapter "${requested}".` };
  }
  if (!checkAvailability(adapter, options.cwd).available) {
    return {
      mode: requested,
      synthesizerId: requested,
      report: null,
      ok: false,
      error: `Synthesizer "${requested}" is not available. Use --synth self to let the harness synthesize, or pick an installed assistant.`
    };
  }

  const prompt = renderPrompt("synthesis", {
    SUBJECT: options.subject ?? "the reviewed change",
    RESPONSES: buildResponsesBlock(ok)
  });

  const result = await invokeAdapter(adapter, { prompt, mode: "review", write: false, cwd: options.cwd, timeoutMs: options.timeoutMs });
  return {
    mode: requested,
    synthesizerId: requested,
    report: result.ok ? result.output : null,
    ok: result.ok,
    error: result.error,
    durationMs: result.durationMs
  };
}
