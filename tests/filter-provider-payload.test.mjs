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

test("removes only content parts emptied by stripping the routing anchor", () => {
  const messages = [
    { role: "user", content: "real request" },
    {
      role: "user",
      content: [
        { type: "text", text: "Active memory: prefer focused searches." },
        { type: "text", text: ROUTING_ANCHOR },
        { type: "text", text: "", lead: "Keep this field", title: "Also keep this" },
        { type: "image", source: { url: "https://example.test/image.png" } },
      ],
      metadata: { routingHints: [ROUTING_ANCHOR, "keep array position"] },
    },
  ];

  assert.deepEqual(filterMessageList(messages), [
    {
      role: "user",
      content: [
        { type: "text", text: "Active memory: prefer focused searches." },
        { type: "text", text: "", lead: "Keep this field", title: "Also keep this" },
        { type: "image", source: { url: "https://example.test/image.png" } },
      ],
      metadata: { routingHints: ["", "keep array position"] },
    },
    messages[0],
  ]);
});

test("preserves non-text content parts when their metadata contains the anchor", () => {
  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: "real request" },
        {
          type: "image",
          title: ROUTING_ANCHOR,
          source: { url: "https://example.test/image.png" },
        },
      ],
    },
  ];

  assert.deepEqual(filterMessageList(messages), [
    {
      role: "user",
      content: [
        { type: "text", text: "real request" },
        {
          type: "image",
          title: "",
          source: { url: "https://example.test/image.png" },
        },
      ],
    },
  ]);
});

test("keeps image-only content when stripping removes the only text part", () => {
  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: ROUTING_ANCHOR },
        { type: "image", source: { url: "https://example.test/image.png" } },
      ],
    },
  ];

  assert.deepEqual(filterMessageList(messages), [
    {
      role: "user",
      content: [
        { type: "image", source: { url: "https://example.test/image.png" } },
      ],
    },
  ]);
});

test("drops a message when stripping empties its entire content array", () => {
  const messages = [
    { role: "user", content: "real request" },
    { role: "user", content: [{ type: "text", text: ROUTING_ANCHOR }] },
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

test("strips repeated routing anchors from synthetic messages", () => {
  const messages = [
    { role: "user", content: "real request" },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `${ROUTING_ANCHOR}\n\n${ROUTING_ANCHOR}\n\nActive memory: prefer focused searches.`,
        },
      ],
    },
  ];

  const filtered = filterMessageList(messages);

  assert.ok(!JSON.stringify(filtered).includes(ROUTING_ANCHOR));
  assert.deepEqual(filtered, [
    {
      role: "user",
      content: [
        { type: "text", text: "Active memory: prefer focused searches." },
      ],
    },
    messages[0],
  ]);
});

test("keeps leading system messages first when retaining active memory", () => {
  const messages = [
    { role: "system", content: "You are a helpful agent." },
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
    { role: "system", content: "You are a helpful agent." },
    {
      role: "user",
      content: [
        { type: "text", text: "Active memory: prefer focused searches." },
      ],
    },
    { role: "user", content: "real request" },
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
