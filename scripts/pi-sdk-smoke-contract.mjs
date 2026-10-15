export const VERIFICATION_CONTRACT = "pi-sdk-behavior-v2";
export const SDK_NAMES = [
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-tui",
];
export const SDK_VERSIONS = Object.fromEntries(SDK_NAMES.map((name) => [name, "1.2.0"]));
export const ROUTING_ANCHOR =
  "context-mode active. Hierarchy: ctx_batch_execute > ctx_execute > ctx_execute_file > ctx_search. " +
  "Read/edit files → ctx_execute_file. Multi-command research → ctx_batch_execute. " +
  "Web pages → ctx_fetch_and_index then ctx_search. Index docs → ctx_index. " +
  "Stats → ctx_stats. Doctor → ctx_doctor. Upgrade → ctx_upgrade. Purge → ctx_purge.";
export const UNHANDLED_ERROR_PATTERN = /UnhandledPromiseRejection|uncaught exception|shutdown error/i;
export const EXTENSION_LOAD_ERROR_PATTERN = /Failed to load extension|Error loading extension/i;
export const PROBE_TIMEOUT_MS = 15_000;

function assertion(id, expected, observed, passed) {
  return { id, expected, observed, passed: passed === true };
}

export function parseJsonLines(output) {
  return output.split(/\r?\n/).flatMap((line) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

function assistantMessages(records) {
  const messages = [];
  for (const record of records) {
    if (record?.type === "message_end" && record.message?.role === "assistant") {
      messages.push(record.message);
    }
    if (record?.type === "agent_end" && Array.isArray(record.messages)) {
      messages.push(...record.messages.filter((message) => message?.role === "assistant"));
    }
  }
  return messages;
}

function textFromMessage(message) {
  return (message.content ?? [])
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

function normalizedRequest(request, marker, requireActiveMemory = false) {
  const markerIndex = request?.userTexts.findIndex((text) => text.includes(marker)) ?? -1;
  const memoryIndex = request?.userTexts.findIndex((text) => text.includes("Active memory: prefer focused searches.")) ?? -1;
  return request?.model === "pi-context-mode-smoke" && markerIndex >= 0 &&
    !request.userTexts.some((text) => text.includes(ROUTING_ANCHOR)) &&
    (!requireActiveMemory || (memoryIndex >= 0 && memoryIndex < markerIndex));
}

export function behaviorAssertions(name, observation) {
  const { processResult, requests = [], records = [], expectedVersion = "1.2.0" } = observation;
  const messages = assistantMessages(records);
  const userTexts = (requests[0]?.userTexts ?? []).join("\n");
  const assistantText = messages.map(textFromMessage).join("\n");

  if (name === "extension_load") {
    const request = requests.find((item) => normalizedRequest(item, "extension registration probe"));
    return [assertion(
      "extension_registered",
      "The actual Pi 1.2.0 host loads the extension and sends the hook-filtered request to the provider",
      { exit_code: processResult?.exit_code ?? null, request: request ?? null },
      processResult?.exit_code === 0 && !!request,
    )];
  }
  if (name === "happy_path") {
    const request = requests.find((item) => normalizedRequest(item, "Ship this real request.", true));
    const passed = processResult?.exit_code === 0 && !!request &&
      assistantText.includes("Filtered request accepted.");
    return [assertion(
      "feature_response",
      "The real provider request strips the synthetic routing anchor, moves retained active memory before the latest user request, and returns the deterministic response",
      { exit_code: processResult?.exit_code ?? null, request: request ?? null, assistantText },
      passed,
    )];
  }
  if (name === "error_path") {
    const request = requests.find((item) => normalizedRequest(item, "Handle this provider error."));
    const providerError = messages.find((message) =>
      message.stopReason === "error" &&
      (message.errorMessage ?? "").includes("deliberate smoke provider error"));
    return [assertion(
      "handled_error",
      "A deliberate local provider rejection is surfaced as a handled assistant error after the extension filters the actual request",
      { exit_code: processResult?.exit_code ?? null, request: request ?? null, providerError: providerError ?? null },
      processResult?.exit_code === 0 && !!request && !!providerError,
    )];
  }
  if (name === "reload_cleanup") {
    const request = requests.find((item) => normalizedRequest(item, "Reloaded real request."));
    const passed = processResult?.exit_code === 0 && !!request &&
      assistantText.includes("Filtered request accepted.");
    return [
      assertion(
        "reloaded_extension_registered",
        "A second actual Pi process reloads the extension and sends a hook-filtered provider request",
        { exit_code: processResult?.exit_code ?? null, request: request ?? null },
        processResult?.exit_code === 0 && !!request,
      ),
      assertion(
        "reloaded_feature_response",
        "The reloaded extension preserves the second user request and returns the provider response",
        { exit_code: processResult?.exit_code ?? null, request: request ?? null, assistantText },
        passed,
      ),
      assertion(
        "clean_shutdown",
        "Both real Pi processes exit zero within the probe deadline without unhandled or shutdown errors",
        { first_exit_code: observation.firstProcessExitCode ?? null,
          first_timed_out: observation.firstProcessTimedOut ?? null,
          first_cleanup_error: observation.firstProcessCleanupError ?? null,
          first_errors: observation.firstProcessUnhandledError ?? null,
          second_exit_code: processResult?.exit_code ?? null, timed_out: processResult?.timed_out ?? null,
          cleanup_error: processResult?.cleanup_error ?? null, errors: processResult?.has_unhandled_error ?? null },
        observation.firstProcessExitCode === 0 && !observation.firstProcessTimedOut &&
          !observation.firstProcessCleanupError && !observation.firstProcessUnhandledError &&
          processResult?.exit_code === 0 && !processResult?.timed_out &&
          !processResult?.cleanup_error && !processResult?.has_unhandled_error,
      ),
    ];
  }
  if (name === "host_shell") {
    const output = processResult?.stdout?.trim() ?? "";
    return [assertion(
      "native_shell_boundary",
      "The native host shell launches this checkout's pinned Pi CLI and returns exactly 1.2.0",
      { exit_code: processResult?.exit_code ?? null, output, expectedVersion },
      processResult?.exit_code === 0 && output === expectedVersion,
    )];
  }
  throw new Error(`Unknown smoke case: ${name}`);
}

export function casePassed(result) {
  return result.exit_code === 0 && !result.timed_out && !result.error &&
    !result.has_unhandled_error && !result.has_load_error &&
    result.assertions.every((item) => item.passed);
}
