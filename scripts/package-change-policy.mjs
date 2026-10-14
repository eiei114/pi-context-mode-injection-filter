const verificationScripts = new Set(["ci", "smoke:pi", "test", "typecheck"]);
const publishablePrefixes = ["extensions/", "lib/", "docs/", "README.md"];

function releaseRelevantManifest(manifest) {
  const result = { ...manifest };
  delete result.devDependencies;
  if (result.scripts) {
    result.scripts = { ...result.scripts };
    for (const name of verificationScripts) delete result.scripts[name];
    if (Object.keys(result.scripts).length === 0) delete result.scripts;
  }
  return result;
}

export function isReleaseVersionRelevantChange(file, baseManifest, headManifest) {
  if (file === "package.json") {
    return JSON.stringify(releaseRelevantManifest(baseManifest)) !==
      JSON.stringify(releaseRelevantManifest(headManifest));
  }
  return publishablePrefixes.some((prefix) => file === prefix || file.startsWith(prefix));
}
