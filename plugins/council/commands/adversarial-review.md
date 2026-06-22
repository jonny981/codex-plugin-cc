---
description: Convene an adversarial review council that challenges the design, not just the code
argument-hint: '[--base <ref>] [--with <ids>] [--synth self|<id>] [focus text]'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(council:*), Bash(npx:*), AskUserQuestion
---

Convene an **adversarial** review council over the current change.

Raw slash-command arguments: `$ARGUMENTS`

Run:
```bash
council review --adversarial $ARGUMENTS
```
If `council` is not on PATH, use `npx council-cli review --adversarial $ARGUMENTS`.

Then follow the same synthesis rules as `/council:review`:
- If the output contains a `## Synthesis (by <id>)` section, return it verbatim.
- If synthesis is `self`, act as chair and produce one consolidated, de-duplicated,
  severity-ordered assessment from the members' responses, flagging agreement,
  single-source findings, and disagreements.

This command is review-only. Do not fix anything; question the approach, the
tradeoffs, and the failure modes, then relay/synthesize and stop.
