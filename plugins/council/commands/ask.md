---
description: Ask other AI assistants for a second opinion on a question or decision
argument-hint: '"<question>" [--diff] [--with <ids>] [--synth self|<id>]'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(council:*), Bash(npx:*)
---

Get a second opinion from a council of other AI assistants.

Raw slash-command arguments: `$ARGUMENTS`

Run:
```bash
council ask $ARGUMENTS
```
If `council` is not on PATH, use `npx council-cli ask $ARGUMENTS`.

- Add `--diff` (already in the user's args, or you may add it when the question is
  clearly about the current change) to include the working-tree diff as context.
- After the command returns: if it produced a `## Synthesis` section, relay it
  verbatim. If synthesis is `self`, read every assistant's opinion and present a
  consolidated view that highlights consensus, unique points, and disagreement,
  then your own read on the balance of opinion.

Do not silently substitute your own opinion for the council's — the point is to
surface independent views. Add your synthesis on top, do not replace.
