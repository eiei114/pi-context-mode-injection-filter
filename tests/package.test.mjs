import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const autoRelease = await readFile(
  new URL("../.github/workflows/auto-release.yml", import.meta.url),
  "utf8",
);
const publish = await readFile(
  new URL("../.github/workflows/publish.yml", import.meta.url),
  "utf8",
);

test("publishes only the extension package resources", () => {
  assert.deepEqual(packageJson.pi, {
    extensions: ["./extensions/index.ts"],
  });
  assert.ok(packageJson.keywords.includes("pi-package"));
  assert.equal(packageJson.publishConfig.access, "public");
  assert.equal(packageJson.files.includes("skills/"), false);
  assert.equal(packageJson.files.includes("prompts/"), false);
  assert.equal(packageJson.files.includes("themes/"), false);
});

test("release workflows use OIDC and explicit handoff", () => {
  assert.match(autoRelease, /actions:\s*write/);
  assert.match(autoRelease, /contents:\s*write/);
  assert.match(autoRelease, /gh workflow run publish\.yml/);
  assert.match(publish, /id-token:\s*write/);
  assert.match(publish, /workflow_dispatch:/);
  assert.match(publish, /npm publish --access public/);
  assert.doesNotMatch(publish, /NPM_TOKEN|NODE_AUTH_TOKEN|secrets\.NPM_TOKEN/);
});
