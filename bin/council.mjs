#!/usr/bin/env node

import process from "node:process";

import {
  cmdAdapters,
  cmdAsk,
  cmdCancel,
  cmdDelegate,
  cmdDelegateWorker,
  cmdHelp,
  cmdResult,
  cmdReview,
  cmdSetup,
  cmdStatus
} from "../src/commands.mjs";

const HANDLERS = {
  review: cmdReview,
  ask: cmdAsk,
  opinion: cmdAsk,
  delegate: cmdDelegate,
  "__delegate-worker": cmdDelegateWorker,
  status: cmdStatus,
  result: cmdResult,
  cancel: cmdCancel,
  setup: cmdSetup,
  adapters: cmdAdapters,
  list: cmdAdapters,
  help: cmdHelp
};

async function main() {
  const [subcommand, ...argv] = process.argv.slice(2);
  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    cmdHelp();
    return 0;
  }
  const handler = HANDLERS[subcommand];
  if (!handler) {
    process.stderr.write(`Unknown command: ${subcommand}\n\n`);
    cmdHelp();
    return 1;
  }
  const code = await handler(argv);
  return typeof code === "number" ? code : 0;
}

main()
  .then((code) => {
    process.exitCode = code ?? 0;
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
