import assert from "node:assert/strict";
import test from "node:test";

import contextModeInjectionFilter from "../extensions/index.ts";
import { ROUTING_ANCHOR } from "../lib/filter-provider-payload.ts";

test("registers and applies the before_provider_request hook", () => {
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
