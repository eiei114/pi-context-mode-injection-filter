import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  behaviorAssertions,
  casePassed,
  EXTENSION_LOAD_ERROR_PATTERN,
  PROBE_TIMEOUT_MS,
  ROUTING_ANCHOR,
  SDK_NAMES,
  SDK_VERSIONS,
  UNHANDLED_ERROR_PATTERN,
  VERIFICATION_CONTRACT,
  parseJsonLines,
} from "./pi-sdk-smoke-contract.mjs";

const root = resolve(import.meta.dirname, "..");
const writeReport = process.argv.includes("--write-report");
const reportDirectory = writeReport
  ? resolve(root, "docs/verification")
  : await mkdtemp(join(tmpdir(), "pi-sdk-smoke-report-"));
const reportPath = join(reportDirectory, "pi-sdk-smoke.json");
const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const installedVersions = Object.fromEntries(await Promise.all(SDK_NAMES.map(async (name) => {
  const version = (await readJson(resolve(root, "node_modules", name, "package.json"))).version;
  if (manifest.devDependencies?.[name] !== SDK_VERSIONS[name] || version !== SDK_VERSIONS[name]) {
    throw new Error(`Smoke requires exact SDK pin ${name}@${SDK_VERSIONS[name]}; manifest=${manifest.devDependencies?.[name]}, installed=${version}`);
  }
  return [name, version];
})));
const piPackage = resolve(root, "node_modules/@earendil-works/pi-coding-agent");
const piManifest = await readJson(resolve(piPackage, "package.json"));
const piCli = resolve(piPackage, piManifest.bin.pi);
const extensionPath = resolve(root, "extensions/index.ts");
const agentDir = await mkdtemp(join(tmpdir(), "pi-sdk-smoke-"));

function collectContentText(value, result = []) {
  if (typeof value === "string") result.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectContentText(item, result));
  else if (value && typeof value === "object") {
    if (typeof value.text === "string") result.push(value.text);
    else Object.values(value).forEach((item) => collectContentText(item, result));
  }
  return result;
}

const capturedRequests = [];
let responseMode = "success";
const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  let payload;
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { message: "invalid smoke request JSON" } }));
    return;
  }

  const userMessages = Array.isArray(payload.messages)
    ? payload.messages.filter((message) => message?.role === "user")
    : [];
  const userTexts = userMessages.flatMap((message) => collectContentText(message.content));
  capturedRequests.push({
    model: payload.model,
    userTexts,
    routingAnchorPresent: userTexts.some((text) => text.includes(ROUTING_ANCHOR)),
  });

  if (responseMode === "error") {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({
      error: {
        message: "deliberate smoke provider error",
        type: "invalid_request_error",
        code: "smoke_error",
      },
    }));
    return;
  }

  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "close",
  });
  const chunk = (delta, finishReason = null) => ({
    id: "pi-sdk-smoke-response",
    object: "chat.completion.chunk",
    created: 1,
    model: "pi-context-mode-smoke",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  });
  response.write(`data: ${JSON.stringify(chunk({ role: "assistant", content: "Filtered request accepted." }))}\n\n`);
  response.write(`data: ${JSON.stringify(chunk({}, "stop"))}\n\n`);
  response.end("data: [DONE]\n\n");
});

async function runChild(executable, args, input, env, timeoutMs = PROBE_TIMEOUT_MS, onRecord) {
  const child = spawn(executable, args, {
    cwd: root,
    env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  let overflow = false;
  let spawnError;
  let lineBuffer = "";
  const append = (target, chunk) => {
    const next = target + chunk.toString("utf8");
    if (next.length > 256_000) overflow = true;
    return next.slice(0, 256_000);
  };
  child.stdout.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    stdout = append(stdout, chunk);
    if (onRecord) {
      lineBuffer += text;
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop() ?? "";
      for (const line of lines) {
        try {
          onRecord(JSON.parse(line), child);
        } catch {
          // Ignore non-protocol lines; the complete output remains bounded and captured.
        }
      }
    }
  });
  child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
  child.on("error", (error) => { spawnError = error; });
  const closePromise = new Promise((resolveClose) => {
    child.once("close", (code, signal) => resolveClose({ closed: true, code, signal }));
  });

  if (onRecord) child.stdin.write(input);
  else child.stdin.end(input);
  let timer;
  let outcome = await Promise.race([
    closePromise,
    new Promise((resolveDeadline) => {
      timer = setTimeout(() => resolveDeadline({ closed: false }), timeoutMs);
    }),
  ]);
  clearTimeout(timer);

  let timed_out = false;
  let cleanup_error;
  if (!outcome.closed) {
    timed_out = true;
    if (process.platform === "win32" && child.pid) {
      spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { timeout: 500, windowsHide: true });
    } else {
      child.kill();
    }
    let cleanupTimer;
    outcome = await Promise.race([
      closePromise,
      new Promise((resolveCleanup) => {
        cleanupTimer = setTimeout(() => resolveCleanup({ closed: false }), 500);
      }),
    ]);
    clearTimeout(cleanupTimer);
    if (!outcome.closed) cleanup_error = `Owned child ${child.pid} did not exit within the 1s cleanup grace`;
  }

  const output = `${stdout}\n${stderr}`;
  return {
    exit_code: outcome.closed ? outcome.code : null,
    signal: outcome.signal ?? null,
    timed_out,
    cleanup_error,
    error: spawnError?.message ?? (overflow ? "Probe output exceeded the 256 KB safety bound" : undefined),
    stdout,
    stderr,
    has_unhandled_error: UNHANDLED_ERROR_PATTERN.test(output),
    has_load_error: EXTENSION_LOAD_ERROR_PATTERN.test(output),
  };
}

function compactRecord(record) {
  if (record?.type === "response") {
    return { type: record.type, command: record.command, success: record.success,
      error: typeof record.error === "string" ? record.error : undefined,
      disposition: record.data?.disposition };
  }
  if (record?.type === "agent_settled") return { type: record.type };
  if (record?.type === "message_end" && record.message?.role === "assistant") {
    return {
      type: record.type,
      role: "assistant",
      stopReason: record.message.stopReason,
      errorMessage: record.message.errorMessage,
      text: (record.message.content ?? []).filter((part) => part?.type === "text")
        .map((part) => part.text).join(""),
    };
  }
  if (record?.type === "agent_end") {
    return {
      type: record.type,
      assistantMessages: (record.messages ?? []).filter((message) => message?.role === "assistant")
        .map((message) => ({
          stopReason: message.stopReason,
          errorMessage: message.errorMessage,
          text: (message.content ?? []).filter((part) => part?.type === "text")
            .map((part) => part.text).join(""),
        })),
    };
  }
  return undefined;
}
function compactResult(result) {
  return {
    exit_code: result.exit_code,
    signal: result.signal,
    timed_out: result.timed_out,
    cleanup_error: result.cleanup_error ?? null,
    error: result.error ?? null,
    has_unhandled_error: result.has_unhandled_error,
    has_load_error: result.has_load_error,
    rpc_records: parseJsonLines(result.stdout).map(compactRecord).filter(Boolean),
    stderr: result.stderr.slice(-2_000),
  };
}

function makeCase(name, processResult, requests, marker, extra = {}) {
  const records = parseJsonLines(processResult.stdout);
  const assertions = behaviorAssertions(name, {
    processResult,
    requests,
    records,
    expectedVersion: installedVersions["@earendil-works/pi-coding-agent"],
    ...extra,
  });
  const passed = casePassed({
    ...processResult,
    exit_code: processResult.exit_code,
    assertions,
  });
  const evidenceObject = {
    process: compactResult(processResult),
    requests,
    marker,
    assertions,
  };
  return {
    name,
    command: "npm run smoke:pi",
    exit_code: processResult.exit_code,
    passed,
    evidence: JSON.stringify(evidenceObject).slice(-6_000),
    assertions,
    has_unhandled_error: processResult.has_unhandled_error,
    has_load_error: processResult.has_load_error,
  };
}

async function writeModelConfig(port) {
  await writeFile(join(agentDir, "models.json"), `${JSON.stringify({
    providers: {
      openai: {
        baseUrl: `http://127.0.0.1:${port}/v1`,
        api: "openai-completions",
        apiKey: "local-smoke-key",
        models: [{
          id: "pi-context-mode-smoke",
          name: "Pi SDK compatibility smoke",
          contextWindow: 4_096,
          maxTokens: 128,
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        }],
      },
    },
  }, null, 2)}\n`);
}

async function runPi(prompts) {
  const env = {
    ...process.env,
    PI_CODING_AGENT_DIR: agentDir,
    PI_TELEMETRY: "0",
    PI_OFFLINE: "1",
  };
  const args = [
    piCli,
    "--offline",
    "--no-session",
    "--no-tools",
    "--no-extensions",
    "--extension",
    extensionPath,
    "--no-skills",
    "--no-context-files",
    "--no-prompt-templates",
    "--no-mcp",
    "--no-themes",
    "--provider",
    "openai",
    "--model",
    "pi-context-mode-smoke",
    "--mode",
    "rpc",
  ];
  const promptList = Array.isArray(prompts) ? prompts : [prompts];
  let nextPrompt = 0;
  const sendNextPrompt = (child) => {
    if (nextPrompt < promptList.length) {
      child.stdin.write(`${JSON.stringify({ id: `smoke-prompt-${nextPrompt + 1}`, type: "prompt", message: promptList[nextPrompt] })}\n`);
      nextPrompt += 1;
    } else {
      child.stdin.end();
    }
  };
  const rpcInput = `${JSON.stringify({ id: "smoke-prompt-1", type: "prompt", message: promptList[0] })}\n`;
  nextPrompt = 1;
  return runChild(process.execPath, args, rpcInput, env, PROBE_TIMEOUT_MS, (record, child) => {
    if (record?.type === "agent_settled") sendNextPrompt(child);
  });
}

async function main() {
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  await writeModelConfig(address.port);
  const cases = [];
  const processResults = [];

  responseMode = "success";
  capturedRequests.length = 0;
  let result = await runPi(`extension registration probe ${ROUTING_ANCHOR}`);
  processResults.push(result);
  cases.push(makeCase("extension_load", result, [...capturedRequests], "extension registration probe"));

  responseMode = "success";
  capturedRequests.length = 0;
  result = await runPi([
    "A previous user turn establishes normal conversation history.",
    `${ROUTING_ANCHOR}\n\nActive memory: prefer focused searches.`,
    "Ship this real request.",
  ]);
  processResults.push(result);
  cases.push(makeCase("happy_path", result, [...capturedRequests], "Ship this real request."));

  responseMode = "error";
  capturedRequests.length = 0;
  result = await runPi(`Handle this provider error. ${ROUTING_ANCHOR}`);
  processResults.push(result);
  cases.push(makeCase("error_path", result, [...capturedRequests], "Handle this provider error."));

  responseMode = "success";
  capturedRequests.length = 0;
  const firstReloadResult = await runPi(`Initial reload lifecycle probe ${ROUTING_ANCHOR}`);
  processResults.push(firstReloadResult);
  capturedRequests.length = 0;
  result = await runPi(`Reloaded real request. ${ROUTING_ANCHOR}`);
  processResults.push(result);
  cases.push(makeCase("reload_cleanup", result, [...capturedRequests], "Reloaded real request.", {
    firstProcessExitCode: firstReloadResult.exit_code,
    firstProcessTimedOut: firstReloadResult.timed_out,
    firstProcessCleanupError: firstReloadResult.cleanup_error ?? null,
    firstProcessUnhandledError: firstReloadResult.has_unhandled_error,
  }));

  const piEnv = {
    ...process.env,
    PI_CODING_AGENT_DIR: agentDir,
    PI_TELEMETRY: "0",
    PI_OFFLINE: "1",
  };
  if (process.platform === "win32") {
    const shell = resolve(process.env.SystemRoot ?? "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
    const hostScript = join(agentDir, "host-shell-smoke.ps1");
    await writeFile(hostScript, "$nodePath = $args[0]\n$piCli = $args[1]\n& $nodePath $piCli --no-extensions --version\nexit $LASTEXITCODE\n");
    result = await runChild(shell, ["-NoProfile", "-NonInteractive", "-File", hostScript, process.execPath, piCli], "", piEnv);
  } else {
    result = await runChild("/bin/sh", ["-c", '"$1" "$2" --no-extensions --version', "pi-host-shell", process.execPath, piCli], "", piEnv);
  }
  processResults.push(result);
  const hostCase = makeCase("host_shell", result, [], "native host shell");
  hostCase.evidence = JSON.stringify({ process: compactResult(result), assertions: hostCase.assertions }).slice(-6_000);
  cases.push(hostCase);

  const report = {
    schema_version: 1,
    verification_contract: VERIFICATION_CONTRACT,
    sdk_versions: installedVersions,
    platform: process.platform,
    model_inference: "none; actual Pi 1.2.0 process with an offline local deterministic OpenAI-compatible provider; the Pi host, extension loader/lifecycle, provider request hook, and feature code are not mocked",
    unhandled_errors: processResults.filter((item) => item.has_unhandled_error).length,
    extension_load_errors: cases.filter((item) => item.has_load_error ||
      ((item.name === "extension_load" || item.name === "reload_cleanup") && !item.assertions[0]?.passed)).length,
    cases: cases.map(({ has_unhandled_error, has_load_error, ...item }) => item),
  };

  if (writeReport) await mkdir(reportDirectory, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    verification_contract: VERIFICATION_CONTRACT,
    platform: process.platform,
    report_path: reportPath,
    cases: cases.map(({ name, passed, exit_code }) => ({ name, passed, exit_code })),
  }));
  if (cases.some((item) => !item.passed)) process.exitCode = 1;
}

try {
  await main();
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(agentDir, { recursive: true, force: true });
}
