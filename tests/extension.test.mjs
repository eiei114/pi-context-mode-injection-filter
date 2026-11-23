import assert from "node:assert/strict";
import test from "node:test";

import contextModeInjectionFilter from "../extensions/index.ts";
import { ROUTING_ANCHOR } from "../lib/filter-provider-payload.ts";

function registerProviderHook() {
  let eventName;
  let handler;
  const pi = {
    on(name, registeredHandler) {
      eventName = name;
      handler = registeredHandler;
    },
  };

  contextModeInjectionFilter(pi);
  assert.equal(eventName, "before_provider_request");
  assert.equal(typeof handler, "function");
  return handler;
}

test("registers and applies the before_provider_request hook", () => {
  const handler = registerProviderHook();
  const payload = {
    messages: [
      { role: "user", content: "ship this" },
      { role: "user", content: ROUTING_ANCHOR },
    ],
  };
  const result = handler({ payload });

  assert.equal(result, payload);
  assert.deepEqual(payload.messages, [{ role: "user", content: "ship this" }]);
});

test("filters an input-only provider payload through the registered hook", () => {
  const handler = registerProviderHook();
  const payload = {
    model: "example",
    metadata: { requestId: "test-request" },
    input: [
      { role: "user", content: "ship this" },
      { role: "user", content: ROUTING_ANCHOR },
    ],
  };

  assert.equal(handler({ payload }), payload);
  assert.deepEqual(payload, {
    model: "example",
    metadata: { requestId: "test-request" },
    input: [{ role: "user", content: "ship this" }],
  });
});

test("returns undefined from the provider hook for a non-object payload", () => {
  const handler = registerProviderHook();
  assert.equal(handler({ payload: "not an object" }), undefined);
});
