---
description: Convene a council of other AI assistants to review the current change
argument-hint: '[--adversarial] [--base <ref>] [--with <ids>] [--synth self|<id>] [focus text]'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(council:*), Bash(npx:*), AskUserQuestion
---

Convene a review council over the current git change using the `council` CLI.

Raw slash-command arguments: `$ARGUMENTS`

Steps:

1. Run the council. Prefer the global binary; if it is missing, fall back to `npx`:
   ```bash
   council review $ARGUMENTS
   ```
   If `council` is not found, run `npx council-cli review $ARGUMENTS` instead. If
   both fail, tell the user to install it (`npm install -g council-cli`) and stop.

2. The command prints each council member's review. Read its output.

3. Synthesis behaviour:
   - If the output already contains a `## Synthesis (by <id>)` section, an assistant
     synthesized the council. Return the command output **verbatim** — do not re-summarize.
   - If the output says synthesis is set to `self` (each member's response is listed
     under `## Council responses`), then YOU are the chair: read every member's review
     and produce one consolidated, de-duplicated assessment. Note where members agree
     (raises confidence), keep single-source findings flagged as such, and surface any
     genuine disagreements. Order by severity. Then show the per-member detail beneath.

Core constraint:
- This command is review-only. Do NOT fix the issues, apply patches, or imply you are
  about to make changes. Convene the council, relay/synthesize, stop.

Notes:
- `--adversarial` runs the steerable challenge-the-design review; otherwise it is a
  standard correctness/reliability review.
- `--with codex,gemini` picks specific reviewers; default reviewers come from config.
- `--base main` reviews the branch diff; otherwise it auto-targets the working tree.
- Reviews can take a while. Mention that to the user if several reviewers are convened.
