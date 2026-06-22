---
description: Show the stored output of a finished council delegate job
argument-hint: '[<job-id>]'
allowed-tools: Bash(council:*), Bash(npx:*)
---

Show the result of a council delegate job.

Run:
```bash
council result $ARGUMENTS
```
If `council` is not on PATH, use `npx council-cli result $ARGUMENTS`.

With no id, shows the most recently finished job. Return the output as-is.
