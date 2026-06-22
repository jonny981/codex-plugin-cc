---
description: Cancel an active council delegate job
argument-hint: '[<job-id>]'
allowed-tools: Bash(council:*), Bash(npx:*)
---

Cancel a running or queued council delegate job.

Run:
```bash
council cancel $ARGUMENTS
```
If `council` is not on PATH, use `npx council-cli cancel $ARGUMENTS`.

With no id, cancels the latest active job. Return the output as-is.
