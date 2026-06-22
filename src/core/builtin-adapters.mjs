// Built-in adapter recipes for invoking other coding-assistant CLIs one-shot.
//
// IMPORTANT: these are BEST-EFFORT starting points. Assistant CLIs change their
// flags often, and the exact non-interactive invocation differs per tool. Every
// field here is overridable (and new assistants are addable) through user config
// at ~/.council/config.json or project config at ./.council/config.json. See the
// README "Adapters" section. The goal of council is to be agnostic: the built-ins
// are just a bundled config layer, not a hard-coded list.
//
// Adapter shape:
//   label        human-readable name
//   bin          executable to run (looked up on PATH)
//   versionArgs  args used to probe availability (default ["--version"])
//   promptVia    how the prompt text reaches the tool: "stdin" | "arg" | "file"
//   reviewArgs   argv template for read-only review / second-opinion runs
//   taskArgs     argv template for a read-only delegated task
//   writeArgs    argv template for a write-capable delegated task
//   timeoutMs    optional per-adapter default timeout
//   env          optional extra environment variables
//
// Argv templates may contain placeholders, substituted per invocation:
//   {prompt}      replaced with the full prompt text (use with promptVia "arg")
//   {promptFile}  replaced with a temp file path holding the prompt (promptVia "file")
// When promptVia is "stdin", the prompt is piped to the tool's stdin and no
// placeholder is needed.

export const BUILTIN_ADAPTERS = {
  codex: {
    label: "Codex (OpenAI / GPT-5)",
    bin: "codex",
    promptVia: "stdin",
    reviewArgs: ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "-"],
    taskArgs: ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "-"],
    writeArgs: ["exec", "--full-auto", "--skip-git-repo-check", "-"],
    install: "npm install -g @openai/codex"
  },
  claude: {
    label: "Claude (Anthropic)",
    bin: "claude",
    promptVia: "stdin",
    reviewArgs: ["-p", "--permission-mode", "plan"],
    taskArgs: ["-p", "--permission-mode", "plan"],
    writeArgs: ["-p", "--permission-mode", "acceptEdits"],
    install: "npm install -g @anthropic-ai/claude-code"
  },
  gemini: {
    label: "Gemini (Google)",
    bin: "gemini",
    promptVia: "stdin",
    reviewArgs: [],
    taskArgs: [],
    writeArgs: ["--yolo"],
    install: "npm install -g @google/gemini-cli"
  },
  cursor: {
    label: "Cursor Agent",
    bin: "cursor-agent",
    promptVia: "arg",
    reviewArgs: ["-p", "{prompt}"],
    taskArgs: ["-p", "{prompt}"],
    writeArgs: ["-p", "--force", "{prompt}"],
    install: "curl https://cursor.com/install -fsS | bash"
  },
  opencode: {
    label: "opencode",
    bin: "opencode",
    promptVia: "arg",
    reviewArgs: ["run", "{prompt}"],
    taskArgs: ["run", "{prompt}"],
    writeArgs: ["run", "{prompt}"],
    install: "npm install -g opencode-ai"
  },
  aider: {
    label: "Aider",
    bin: "aider",
    promptVia: "arg",
    reviewArgs: ["--message", "{prompt}", "--no-auto-commits", "--yes-always", "--no-git"],
    taskArgs: ["--message", "{prompt}", "--no-auto-commits", "--yes-always"],
    writeArgs: ["--message", "{prompt}", "--yes-always"],
    install: "python -m pip install aider-install && aider-install"
  },
  grok: {
    label: "Grok (xAI)",
    bin: "grok",
    promptVia: "stdin",
    reviewArgs: ["-p"],
    taskArgs: ["-p"],
    writeArgs: ["-p"],
    install: "npm install -g @vibe-kit/grok-cli"
  },
  glm: {
    label: "GLM (Zhipu)",
    bin: "glm",
    promptVia: "stdin",
    reviewArgs: ["-p"],
    taskArgs: ["-p"],
    writeArgs: ["-p"],
    install: "see your GLM CLI vendor docs"
  },
  qwen: {
    label: "Qwen Code",
    bin: "qwen",
    promptVia: "stdin",
    reviewArgs: [],
    taskArgs: [],
    writeArgs: ["--yolo"],
    install: "npm install -g @qwen-code/qwen-code"
  }
};

// Sensible defaults when the user has not configured their own. Reviewers and
// the synthesizer are resolved against whatever adapters are actually available.
export const DEFAULT_SETTINGS = {
  // Preferred reviewers, in priority order. The council picks the available ones.
  reviewers: ["codex", "gemini", "claude"],
  // "self" means: emit structured fan-out output and let the calling harness
  // synthesize. An adapter id means that assistant writes the consolidated report.
  synthesizer: "self",
  // Default assistant for `council delegate`.
  delegate: "codex",
  // Per-run wall-clock timeout for an assistant invocation.
  timeoutMs: 600000
};
