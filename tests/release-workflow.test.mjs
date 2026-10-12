import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("release actions stay behind an explicit manual dispatch", async () => {
  const autoRelease = await readFile(resolve(root, ".github/workflows/auto-release.yml"), "utf8");
  const publish = await readFile(resolve(root, ".github/workflows/publish.yml"), "utf8");

  const eventBlock = autoRelease.match(/^on:\r?\n([\s\S]*?)(?=^[A-Za-z][\w-]*:)/m)?.[1];
  assert.ok(eventBlock, "auto-release workflow must declare its trigger events");
  assert.deepEqual([...eventBlock.matchAll(/^  ([a-z_]+):/gm)].map((match) => match[1]), ["workflow_dispatch"]);
  assert.match(publish, /^  workflow_dispatch:/m, "manual npm publish must remain available");
});
