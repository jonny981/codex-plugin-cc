# council

**Convene a council of AI coding assistants** — ask other assistants for an adversarial
review, a second opinion, or to take on a task. Multiple at once. Then synthesized.

`council` is a small, dependency-free CLI that shells out to whatever assistant CLIs you
have installed (Codex, Gemini, Claude, Cursor, Aider, opencode, Grok, GLM, Qwen, or any
custom one you configure) and fans a prompt out to several of them in parallel. It is:

- **Model-agnostic** — every assistant is just an *adapter*: a declarative recipe for how
  to invoke its CLI one-shot. Built-in adapters are overridable, and you can add any tool
  with a few lines of config.
- **Harness-agnostic** — the engine is a plain CLI any environment can call: a shell, a
  Makefile, a CI step, Claude Code, Cursor, Codex, another agent. A thin Claude Code
  plugin wrapper ships in [`plugins/council`](plugins/council), but it is optional.

It is inspired by OpenAI's [`codex-plugin-cc`](https://github.com/openai/codex-plugin-cc),
generalized away from a single model and a single harness.

## Why

A second model is the cheapest reviewer you have. One assistant reviewing another's work
catches a different class of bug than the author's own model will. `council` makes that a
one-liner, and goes further: convene *several* independent assistants on the same change
and consolidate their findings, so agreement raises your confidence and a lone dissent
gets flagged rather than buried.

## Install

```bash
npm install -g council-cli
```

Or from a checkout:

```bash
git clone https://github.com/jonny981/council
cd council && npm link
```

Requires Node 18.18+. Then install at least one assistant CLI (see `council setup`).

## Quick start

```bash
council setup                     # which assistant CLIs are installed + how it's configured
council review --adversarial      # convene the default reviewers on your working-tree diff
council review --with codex,gemini --base main
council ask "is a queue the right call here?" --diff
council delegate --to codex --background "investigate the flaky integration test"
council status
council result
```

## Commands

| Command | What it does |
|---|---|
| `council review [--adversarial] [--base <ref>] [--scope ...] [--with <ids>] [--synth self\|<id>] [focus]` | Fan a code review of the git diff out to N assistants, then synthesize. `--adversarial` challenges the design, not just the code. |
| `council ask "<question>" [--diff] [--with <ids>] [--synth ...]` | Fan a free-form second-opinion question out to N assistants. `--diff` includes the working-tree change as context. |
| `council delegate "<task>" [--to <id>] [--write] [--background] [--resume]` | Hand a task to one assistant. Read-only by default; `--write` lets it edit files; `--background` detaches it as a job. |
| `council status [<job-id>] [--all]` | List running and recent delegate jobs. |
| `council result [<job-id>]` | Show a finished delegate job's output. |
| `council cancel [<job-id>]` | Cancel an active delegate job. |
| `council setup [--init]` | Show adapter availability + config. `--init` writes a starter config. |
| `council adapters` | List configured adapters. |

### Targeting a review

`review` and `ask --diff` collect git context the same way: with `--base <ref>` they diff
the branch against that ref; with `--scope working-tree` they use uncommitted changes; with
the default `--scope auto` they use the working tree if it is dirty, otherwise the branch
against the detected default branch.

## Synthesis

After the council responds, `council` consolidates the results. Two modes, set by
`--synth` or `settings.synthesizer`:

- **`self`** (default) — `council` prints every member's response and a note asking the
  *calling harness* to synthesize them. This is ideal inside an agent like Claude Code:
  the orchestrating model reads all the reviews and writes the consolidated assessment.
  In a plain shell, you read them yourself.
- **`<adapter id>`** (e.g. `--synth claude`) — that assistant acts as the council chair and
  writes one consolidated, de-duplicated report: agreed findings, single-source findings,
  and explicit disagreements. Use this when nothing downstream will synthesize for you.

## Adapters

An adapter tells `council` how to invoke an assistant CLI one-shot. The built-in adapters
are **best-effort starting points** — assistant CLIs change their flags often, so treat
them as defaults to override, not gospel. Everything is config-driven.

Config is layered, later overriding earlier:

1. built-in defaults
2. `~/.council/config.json` (user)
3. `./.council/config.json` (project)

Run `council setup --init` to drop a starter user config. An adapter looks like:

```json
{
  "settings": {
    "reviewers": ["codex", "gemini", "claude"],
    "synthesizer": "self",
    "delegate": "codex"
  },
  "adapters": {
    "my-assistant": {
      "label": "My Assistant",
      "bin": "my-cli",
      "promptVia": "stdin",
      "reviewArgs": ["--print"],
      "taskArgs": ["--print"],
      "writeArgs": ["--print", "--write"],
      "versionArgs": ["--version"],
      "timeoutMs": 600000
    },
    "codex": { "writeArgs": ["exec", "--dangerously-bypass-approvals-and-sandbox", "-"] },
    "grok": null
  }
}
```

| Field | Meaning |
|---|---|
| `label` | Human name shown in output. |
| `bin` | Executable, looked up on `PATH`. |
| `promptVia` | How the prompt reaches the tool: `stdin` (piped), `arg` (substituted into args), or `file` (written to a temp file whose path is substituted). |
| `reviewArgs` | argv for read-only review / second-opinion runs. |
| `taskArgs` | argv for a read-only delegated task. |
| `writeArgs` | argv for a write-capable delegated task. |
| `versionArgs` | argv used to probe availability (default `["--version"]`). |
| `timeoutMs` | Per-run wall-clock timeout. |
| `env` | Extra environment variables for the run. |

Argv templates may contain `{prompt}` (full prompt text) or `{promptFile}` (temp-file path).
Set an adapter to `null` to remove a built-in. Set `settings.reviewers`/`synthesizer`/`delegate`
to change defaults (or use top-level shorthands `reviewers`, `synthesizer`, `delegate`, `timeoutMs`).

### Built-in adapters

`codex`, `claude`, `gemini`, `cursor` (`cursor-agent`), `opencode`, `aider`, `grok`, `glm`,
`qwen`. See [`src/core/builtin-adapters.mjs`](src/core/builtin-adapters.mjs) for the exact
default invocations, and override any that don't match your installed version.

## Claude Code plugin

A thin wrapper lives in [`plugins/council`](plugins/council). Add the marketplace and install:

```text
/plugin marketplace add jonny981/council
/plugin install council@council
```

It adds `/council:review`, `/council:adversarial-review`, `/council:ask`,
`/council:delegate`, `/council:status`, `/council:result`, `/council:cancel`,
`/council:setup`, and a `council-delegate` subagent. The commands shell out to the global
`council` binary (install it first), so the same engine drives every harness. With the
default `self` synthesizer, Claude itself acts as the council chair and consolidates the
members' reviews.

## How it works

```
council review
   │
   ├─ collect git context (diff / status)            src/core/git.mjs
   ├─ render review prompt (+ embedded diff)          prompts/, src/core/prompts.mjs
   ├─ resolve reviewers from config + availability    src/core/adapters.mjs
   ├─ fan out: spawn each assistant CLI in parallel   src/core/fanout.mjs
   │     each adapter -> buildInvocation -> runCapture (stdin/arg/file, timeout)
   └─ synthesize: self (harness) or an assistant chair  src/core/synthesize.mjs
```

Delegate jobs are tracked under `~/.council/jobs/<repo-hash>/`; background runs are a
detached `council __delegate-worker` process that writes its result back to the job file.

## Development

```bash
npm test    # node --test
```

No runtime dependencies; ESM throughout; Node's built-in test runner only.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
