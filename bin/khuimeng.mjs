#!/usr/bin/env node
// npm/npx entry: register tsx so the TypeScript CLI runs without a build step.
import { register } from "tsx/esm/api";
register();
await import("./cli.ts");
