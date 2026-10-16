#!/usr/bin/env node
import { main } from "./cli.js";

const code = await main(process.argv.slice(2), {
  env: process.env,
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
});
process.exitCode = code;
