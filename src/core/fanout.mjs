import { invokeAdapter } from "./adapters.mjs";

/**
 * Run every adapter against the same prompt in parallel.
 * `onEvent` (optional) is called with progress events: {type, id, label, ...}.
 * Resolves with an array of normalized invocation results, in input order.
 */
export async function fanOut(adapters, options = {}) {
  const { prompt, mode = "review", write = false, cwd, timeoutMs, onEvent } = options;

  const emit = (event) => {
    if (typeof onEvent === "function") {
      onEvent(event);
    }
  };

  const tasks = adapters.map(async (adapter) => {
    emit({ type: "start", id: adapter.id, label: adapter.label ?? adapter.id });
    const result = await invokeAdapter(adapter, { prompt, mode, write, cwd, timeoutMs });
    emit({
      type: "done",
      id: adapter.id,
      label: result.label,
      ok: result.ok,
      durationMs: result.durationMs,
      error: result.error
    });
    return result;
  });

  return Promise.all(tasks);
}
