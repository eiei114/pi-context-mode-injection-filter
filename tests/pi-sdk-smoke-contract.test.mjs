import assert from "node:assert/strict";
import test from "node:test";
import {
  behaviorAssertions,
  casePassed,
  parseJsonLines,
  PROBE_TIMEOUT_MS,
  ROUTING_ANCHOR,
  SDK_VERSIONS,
  VERIFICATION_CONTRACT,
} from "../scripts/pi-sdk-smoke-contract.mjs";

const request = (text, anchorPresent = false) => ({
  model: "pi-context-mode-smoke",
  userTexts: Array.isArray(text) ? text : [text],
  routingAnchorPresent: anchorPresent,
});
const successMessage = {
  type: "message_end",
  message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "Filtered request accepted." }] },
};
const successfulProcess = { exit_code: 0, timed_out: false, has_unhandled_error: false };


test("behavior contract and bounded probe settings are frozen", () => {
  assert.equal(VERIFICATION_CONTRACT, "pi-sdk-behavior-v2");
  assert.deepEqual(SDK_VERSIONS, {
    "@earendil-works/pi-agent-core": "1.1.0",
    "@earendil-works/pi-ai": "1.1.0",
    "@earendil-works/pi-coding-agent": "1.1.0",
    "@earendil-works/pi-tui": "1.1.0",
  });
  assert.ok(PROBE_TIMEOUT_MS <= 15_000);
  assert.deepEqual(parseJsonLines(`not-json\r\n${JSON.stringify(successMessage)}\n`), [successMessage]);
});

test("extension registration requires an actual filtered provider request", () => {
  const observation = { processResult: successfulProcess, requests: [request("extension registration probe ")] };
  assert.equal(behaviorAssertions("extension_load", observation)[0].id, "extension_registered");
  assert.equal(behaviorAssertions("extension_load", observation)[0].passed, true);
  for (const requests of [[], [request(`extension registration probe ${ROUTING_ANCHOR}`, true)]]) {
    assert.equal(behaviorAssertions("extension_load", { processResult: successfulProcess, requests })[0].passed, false);
  }
});

test("feature response requires the normalized request and actual assistant response", () => {
  const good = behaviorAssertions("happy_path", {
    processResult: successfulProcess,
    requests: [request(["Active memory: prefer focused searches.", "Ship this real request. "])],
    records: [successMessage],
  })[0];
  assert.equal(good.id, "feature_response");
  assert.equal(good.passed, true);
  for (const [requests, records] of [
    [[], [successMessage]],
    [[request(`Ship this real request. ${ROUTING_ANCHOR}`, true)], [successMessage]],
    [[request("Ship this real request. ")], [successMessage]],
    [[request(["Active memory: prefer focused searches.", "Ship this real request. "])], []],
  ]) {
    assert.equal(behaviorAssertions("happy_path", { processResult: successfulProcess, requests, records })[0].passed, false);
  }
});

test("provider failures are accepted only when explicitly surfaced as handled errors", () => {
  const handledError = {
    type: "message_end",
    message: { role: "assistant", stopReason: "error", errorMessage: "400: deliberate smoke provider error" },
  };
  const good = behaviorAssertions("error_path", {
    processResult: successfulProcess,
    requests: [request("Handle this provider error. ")],
    records: [handledError],
  })[0];
  assert.equal(good.id, "handled_error");
  assert.equal(good.passed, true);
  for (const records of [[], [{ ...handledError, message: { ...handledError.message, stopReason: "stop" } }]]) {
    assert.equal(behaviorAssertions("error_path", {
      processResult: successfulProcess,
      requests: [request("Handle this provider error. ")],
      records,
    })[0].passed, false);
  }
});

test("reload assertions reject missing second-host behavior or unclean process exits", () => {
  const observation = {
    processResult: successfulProcess,
    requests: [request("Reloaded real request. ")],
    records: [successMessage],
    firstProcessExitCode: 0,
    firstProcessTimedOut: false,
    firstProcessUnhandledError: false,
  };
  const assertions = behaviorAssertions("reload_cleanup", observation);
  assert.deepEqual(assertions.map((item) => item.id), [
    "reloaded_extension_registered",
    "reloaded_feature_response",
    "clean_shutdown",
  ]);
  assert.ok(assertions.every((item) => item.passed));
  for (const change of [
    { requests: [] },
    { records: [] },
    { processResult: { ...successfulProcess, exit_code: 1 } },
    { firstProcessExitCode: null },
    { firstProcessTimedOut: true },
  ]) {
    const bad = behaviorAssertions("reload_cleanup", { ...observation, ...change });
    assert.ok(bad.some((item) => !item.passed));
  }
});

test("native host shell requires the exact pinned SDK CLI version", () => {
  assert.equal(behaviorAssertions("host_shell", {
    processResult: { exit_code: 0, stdout: "1.1.0\r\n" },
  })[0].passed, true);
  for (const output of ["", "1.0.0", "11.1.0", "1.1.0 plus noise"]) {
    assert.equal(behaviorAssertions("host_shell", {
      processResult: { exit_code: 0, stdout: output },
    })[0].passed, false);
  }
});

test("failed and timed-out processes never pass a successful case", () => {
  const assertion = { id: "ok", expected: "ok", observed: "ok", passed: true };
  assert.equal(casePassed({ exit_code: 0, assertions: [assertion] }), true);
  for (const change of [
    { exit_code: 1 },
    { timed_out: true },
    { error: "failed" },
    { has_unhandled_error: true },
    { has_load_error: true },
    { assertions: [{ ...assertion, passed: false }] },
  ]) {
    assert.equal(casePassed({ exit_code: 0, assertions: [assertion], ...change }), false);
  }
});
