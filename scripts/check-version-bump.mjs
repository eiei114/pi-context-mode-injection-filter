#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  return match ? match.slice(1, 4).map(Number) : undefined;
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) throw new Error(`Invalid semver: ${left} or ${right}`);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function hasMajorApproval() {
  if (process.env.ALLOW_MAJOR_VERSION_BUMP === "1") return true;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !existsSync(eventPath)) return false;
  const event = JSON.parse(readFileSync(eventPath, "utf8"));
  const text = `${event.pull_request?.title ?? ""}\n${event.pull_request?.body ?? ""}`;
  return text.toLowerCase().includes("major-approved");
}

const baseRef = process.env.BASE_REF ?? "origin/main";

try {
  git(["rev-parse", "--verify", baseRef]);
} catch {
  console.log(`version:check skipped: ${baseRef} is unavailable`);
  process.exit(0);
}

const headPackage = JSON.parse(readFileSync("package.json", "utf8"));
const basePackage = JSON.parse(git(["show", `${baseRef}:package.json`]));

if (basePackage.name !== headPackage.name) {
  console.log("version:check passed: initial package bootstrap");
  process.exit(0);
}

const changed = git(["diff", "--name-only", `${baseRef}...HEAD`])
  .split("\n")
  .filter(Boolean);
const publishablePrefixes = ["extensions/", "lib/", "docs/", "README.md", "package.json"];
const publishableChanged = changed.some((file) =>
  publishablePrefixes.some((prefix) => file === prefix || file.startsWith(prefix)),
);
const comparison = compareVersions(headPackage.version, basePackage.version);

if (comparison < 0) {
  throw new Error(`Version went backwards: ${basePackage.version} -> ${headPackage.version}`);
}

if (publishableChanged && comparison === 0) {
  throw new Error("Publishable files changed without a package version bump");
}

if (comparison > 0 && !changed.includes("CHANGELOG.md")) {
  throw new Error("Version changed without a CHANGELOG.md update");
}

const [baseMajor] = parseVersion(basePackage.version);
const [headMajor] = parseVersion(headPackage.version);
if (headMajor > baseMajor && !hasMajorApproval()) {
  throw new Error("Major version bump requires major-approved or ALLOW_MAJOR_VERSION_BUMP=1");
}

console.log(`version:check passed: ${basePackage.version} -> ${headPackage.version}`);
