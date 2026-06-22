---
description: Check which assistant CLIs are installed and how council is configured
argument-hint: '[--init]'
allowed-tools: Bash(council:*), Bash(npx:*)
---

Check council's configuration and which assistant CLIs are available.

Run:
```bash
council setup $ARGUMENTS
```
If `council` is not on PATH, tell the user to install it with
`npm install -g council-cli` (or `npm link` from a checkout), then retry. As a
one-off you can run `npx council-cli setup $ARGUMENTS`.

`--init` writes a starter config to `~/.council/config.json`.

Report which assistants are ready (✓) and which need installing (✗, with the
install command). Then summarise the configured reviewers, synthesizer, and
default delegate. Return the output; offer to help install any missing assistant
the user wants.
