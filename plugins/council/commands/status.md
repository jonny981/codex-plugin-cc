---
description: Show running and recent council delegate jobs
argument-hint: '[<job-id>] [--all]'
allowed-tools: Bash(council:*), Bash(npx:*)
---

Show council delegate jobs for the current repository.

Run:
```bash
council status $ARGUMENTS
```
If `council` is not on PATH, use `npx council-cli status $ARGUMENTS`.

Return the output as-is. Pass a job id to see one job; `--all` shows the full history.
