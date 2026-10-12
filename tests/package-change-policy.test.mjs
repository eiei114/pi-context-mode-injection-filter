import assert from "node:assert/strict";
import test from "node:test";
import { isReleaseVersionRelevantChange } from "../scripts/package-change-policy.mjs";

const baseManifest = {
  name: "pi-context-mode-injection-filter",
  version: "0.1.5",
  files: ["extensions/", "lib/", "docs/"],
  peerDependencies: { "@earendil-works/pi-coding-agent": "*" },
  devDependencies: { "@earendil-works/pi-coding-agent": "^0.99.1" },
  scripts: { typecheck: "tsc --noEmit", test: "node --test", ci: "npm test" },
};

test("SDK verification scripts do not trigger a package release version", () => {
  const headManifest = {
    ...baseManifest,
    devDependencies: { "@earendil-works/pi-coding-agent": "1.1.0" },
    scripts: {
      ...baseManifest.scripts,
      "smoke:pi": "node scripts/pi-sdk-smoke.mjs",
      ci: "npm test && npm run smoke:pi",
    },
  };
  assert.equal(isReleaseVersionRelevantChange("package.json", baseManifest, headManifest), false);
  // docs/ is included by the package files allowlist, so verification reports ship too.
  assert.equal(isReleaseVersionRelevantChange("docs/verification/pi-sdk-smoke.json", baseManifest, headManifest), true);
  assert.equal(isReleaseVersionRelevantChange("scripts/pi-sdk-smoke.mjs", baseManifest, headManifest), false);
  assert.equal(isReleaseVersionRelevantChange("tests/pi-sdk-smoke.test.mjs", baseManifest, headManifest), false);
});

test("release-facing manifest and package content changes still require a version bump", () => {
  assert.equal(isReleaseVersionRelevantChange("package.json", baseManifest, {
    ...baseManifest,
    peerDependencies: { "@earendil-works/pi-coding-agent": ">=1.1.0" },
  }), true);
  assert.equal(isReleaseVersionRelevantChange("package.json", baseManifest, { ...baseManifest, version: "0.1.6" }), true);
  assert.equal(isReleaseVersionRelevantChange("extensions/index.ts", baseManifest, baseManifest), true);
  assert.equal(isReleaseVersionRelevantChange("docs/release.md", baseManifest, baseManifest), true);
  assert.equal(isReleaseVersionRelevantChange("README.md", baseManifest, baseManifest), true);
});

test("non-verification package scripts remain release-relevant", () => {
  assert.equal(isReleaseVersionRelevantChange("package.json", baseManifest, {
    ...baseManifest,
    scripts: { ...baseManifest.scripts, prepublishOnly: "node scripts/publish.js" },
  }), true);
});
