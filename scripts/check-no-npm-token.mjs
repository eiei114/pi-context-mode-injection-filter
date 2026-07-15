#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const workflowDirectory = join(process.cwd(), ".github", "workflows");
const forbidden = /NPM_TOKEN|NODE_AUTH_TOKEN|secrets\.NPM_TOKEN/;
const violations = [];

for (const name of readdirSync(workflowDirectory)) {
  if (!/\.ya?ml$/i.test(name)) continue;
  const content = readFileSync(join(workflowDirectory, name), "utf8");
  if (forbidden.test(content)) violations.push(name);
}

if (violations.length > 0) {
  console.error(`publish:guard failed: forbidden npm token reference in ${violations.join(", ")}`);
  process.exit(1);
}

console.log("publish:guard passed: workflows contain no long-lived npm token references");
