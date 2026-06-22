import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROMPTS_DIR = path.resolve(fileURLToPath(new URL("../../prompts", import.meta.url)));

export function loadPromptTemplate(name) {
  return fs.readFileSync(path.join(PROMPTS_DIR, `${name}.md`), "utf8");
}

export function interpolate(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = values[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

export function renderPrompt(name, values) {
  return interpolate(loadPromptTemplate(name), values);
}
