#!/usr/bin/env node
import "tsx/esm";
import { runDragonBoatCli } from "../apps/demo-web/src/cli/dragonboatCli.ts";

const exitCode = await runDragonBoatCli();
process.exitCode = exitCode;
