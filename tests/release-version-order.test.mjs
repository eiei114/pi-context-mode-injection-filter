import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/auto-release.yml", import.meta.url), "utf8");

test("manual release uses a ref-independent baseline, not the push-only before field", () => {
  assert.doesNotMatch(workflow, /github\.event\.before/, "dispatch has no push before SHA");
  assert.match(workflow, /git tag --list 'v\[0-9\]\*'[^\n]*grep -E '\^v\[0-9\]\+/, "must filter to stable tags");
});

test("manual release is restricted to main", () => {
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
});

test("a version that is not newer than the released one is refused", () => {
  assert.match(workflow, /not newer than the released/);
});

test("the changelog baseline excludes the tag being released", () => {
  assert.match(workflow, /grep -vx "\$TAG"/);
});
