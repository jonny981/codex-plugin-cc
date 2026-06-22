import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { BUILTIN_ADAPTERS, DEFAULT_SETTINGS } from "./builtin-adapters.mjs";

const CONFIG_FILENAME = "config.json";

export function userConfigDir() {
  return process.env.COUNCIL_HOME || path.join(os.homedir(), ".council");
}

function readJsonIfExists(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return { path: filePath, data: JSON.parse(raw) };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw new Error(`Failed to read config at ${filePath}: ${error.message}`);
  }
}

function projectConfigPath(cwd) {
  return path.join(cwd, ".council", CONFIG_FILENAME);
}

function mergeAdapters(base, overlay) {
  const merged = { ...base };
  for (const [id, spec] of Object.entries(overlay ?? {})) {
    if (spec === null) {
      // Explicit null removes a built-in adapter.
      delete merged[id];
      continue;
    }
    merged[id] = { ...(merged[id] ?? {}), ...spec };
  }
  return merged;
}

/**
 * Resolve effective configuration by layering:
 *   built-in defaults  <  ~/.council/config.json  <  ./.council/config.json
 * Returns { adapters, settings, sources }.
 */
export function loadConfig(cwd = process.cwd()) {
  const sources = [];
  let adapters = { ...BUILTIN_ADAPTERS };
  let settings = { ...DEFAULT_SETTINGS };

  const layers = [
    readJsonIfExists(path.join(userConfigDir(), CONFIG_FILENAME)),
    readJsonIfExists(projectConfigPath(cwd))
  ];

  for (const layer of layers) {
    if (!layer) {
      continue;
    }
    sources.push(layer.path);
    if (layer.data.adapters) {
      adapters = mergeAdapters(adapters, layer.data.adapters);
    }
    if (layer.data.settings) {
      settings = { ...settings, ...layer.data.settings };
    }
    // Allow top-level shorthands too (reviewers/synthesizer/delegate/timeoutMs).
    for (const key of ["reviewers", "synthesizer", "delegate", "timeoutMs"]) {
      if (layer.data[key] !== undefined) {
        settings[key] = layer.data[key];
      }
    }
  }

  return { adapters, settings, sources, builtinSource: "(built-in defaults)" };
}

export function ensureUserConfig() {
  const dir = userConfigDir();
  const file = path.join(dir, CONFIG_FILENAME);
  if (fs.existsSync(file)) {
    return { created: false, path: file };
  }
  fs.mkdirSync(dir, { recursive: true });
  const template = {
    settings: {
      reviewers: DEFAULT_SETTINGS.reviewers,
      synthesizer: DEFAULT_SETTINGS.synthesizer,
      delegate: DEFAULT_SETTINGS.delegate
    },
    adapters: {
      // Example custom adapter. Delete or edit freely.
      "my-assistant": {
        label: "My Custom Assistant",
        bin: "my-cli",
        promptVia: "stdin",
        reviewArgs: ["--print"],
        taskArgs: ["--print"],
        writeArgs: ["--print", "--write"]
      }
    }
  };
  fs.writeFileSync(file, `${JSON.stringify(template, null, 2)}\n`, "utf8");
  return { created: true, path: file };
}
