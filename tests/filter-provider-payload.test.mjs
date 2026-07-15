import assert from "node:assert/strict";
import test from "node:test";

import {
  ROUTING_ANCHOR,
  filterMessageList,
  filterProviderPayload,
} from "../lib/filter-provider-payload.ts";

test("keeps ordinary messages in their original order", () => {
  const messages = [
    { role: "user", content: "first" },
    { role: "assistant", content: "second" },
  ];

  assert.deepEqual(filterMessageList(messages), messages);
});

test("drops a synthetic message that contains only the routing anchor", () => {
  const messages = [
    { role: "user", content: "real request" },
    { role: "user", content: ROUTING_ANCHOR },
  ];

  assert.deepEqual(filterMessageList(messages), [messages[0]]);
});

test("retains active memory and moves it before the conversation", () => {
  const messages = [
    { role: "user", content: "real request" },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `${ROUTING_ANCHOR}\n\nActive memory: prefer focused searches.`,
        },
      ],
    },
  ];

  assert.deepEqual(filterMessageList(messages), [
    {
      role: "user",
      content: [
        { type: "text", text: "Active memory: prefer focused searches." },
      ],
    },
    messages[0],
  ]);
});

test("filters both messages and input arrays in provider payloads", () => {
  const payload = {
    model: "example",
    messages: [
      { role: "user", content: "message request" },
      { role: "user", content: ROUTING_ANCHOR },
    ],
    input: [
      { role: "user", content: "input request" },
      { role: "user", content: ROUTING_ANCHOR },
    ],
  };

  assert.equal(filterProviderPayload(payload), payload);
  assert.equal(payload.model, "example");
  assert.deepEqual(payload.messages, [{ role: "user", content: "message request" }]);
  assert.deepEqual(payload.input, [{ role: "user", content: "input request" }]);
});

test("returns undefined for non-object provider payloads", () => {
  assert.equal(filterProviderPayload(null), undefined);
  assert.equal(filterProviderPayload([]), undefined);
  assert.equal(filterProviderPayload("payload"), undefined);
});
