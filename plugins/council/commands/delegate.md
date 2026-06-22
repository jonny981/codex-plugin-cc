---
description: Hand a task to another AI coding assistant
argument-hint: '"<task>" [--to <id>] [--write] [--background] [--resume]'
allowed-tools: Bash(council:*), Bash(npx:*)
---

Delegate a task to another coding assistant through the `council` CLI.

Raw slash-command arguments: `$ARGUMENTS`

Run exactly one command:
```bash
council delegate $ARGUMENTS
```
If `council` is not on PATH, use `npx council-cli delegate $ARGUMENTS`.

Routing guidance:
- `--to <id>` chooses the assistant (default comes from config). `council adapters`
  lists the configured ones.
- Add `--write` only if the user wants the other assistant to edit files. Without it
  the run is read-only (investigation / diagnosis / a proposed patch in text).
- For a long or open-ended task, add `--background` and tell the user to check
  `/council:status` and `/council:result`. Do not poll in this turn.
- `--resume` continues the latest delegate thread for this repo with the prior task
  and result as context.

Return the command output as-is. Do not redo the work yourself.
