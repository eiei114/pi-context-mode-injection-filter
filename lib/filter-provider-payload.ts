export const ROUTING_ANCHOR =
  "context-mode active. Hierarchy: ctx_batch_execute > ctx_execute > ctx_execute_file > ctx_search. " +
  "Read/edit files → ctx_execute_file. Multi-command research → ctx_batch_execute. " +
  "Web pages → ctx_fetch_and_index then ctx_search. Index docs → ctx_index. " +
  "Stats → ctx_stats. Doctor → ctx_doctor. Upgrade → ctx_upgrade. Purge → ctx_purge.";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasRoutingAnchor(value: unknown): boolean {
  if (typeof value === "string") return value.includes(ROUTING_ANCHOR);
  if (Array.isArray(value)) return value.some(hasRoutingAnchor);
  if (isObject(value)) return Object.values(value).some(hasRoutingAnchor);
  return false;
}

function stripRoutingAnchor(
  value: unknown,
  pruneEmptyContentParts = false,
): unknown {
  if (typeof value === "string") {
    return value.replaceAll(ROUTING_ANCHOR, "").replace(/^\s+/, "");
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const cleaned = stripRoutingAnchor(
        entry,
        pruneEmptyContentParts && Array.isArray(entry),
      );
      return pruneEmptyContentParts && hasRoutingAnchor(entry) && !hasContent(cleaned)
        ? []
        : [cleaned];
    });
  }
  if (!isObject(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      stripRoutingAnchor(entry, key === "content"),
    ]),
  );
}

function hasContent(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasContent);
  if (!isObject(value)) return false;
  if ("text" in value) return hasContent(value.text);
  if ("content" in value) return hasContent(value.content);
  return false;
}

export function filterMessageList(messages: unknown[]): unknown[] {
  const injected: unknown[] = [];
  const original: unknown[] = [];

  for (const message of messages) {
    if (!hasRoutingAnchor(message)) {
      original.push(message);
      continue;
    }

    const cleaned = stripRoutingAnchor(message);
    if (isObject(cleaned) && hasContent(cleaned.content)) injected.push(cleaned);
  }

  // context-mode appends its synthetic user message after the real prompt.
  // Keep any active-memory payload, but move it after any leading system
  // messages (the system prompt stays first) and before the conversation so it
  // cannot supersede the newest user request.
  const firstConversationIndex = original.findIndex(
    (message) => !isObject(message) || message.role !== "system",
  );
  const insertAt =
    firstConversationIndex === -1 ? original.length : firstConversationIndex;

  const filtered = [...original];
  filtered.splice(insertAt, 0, ...injected);
  return filtered;
}

export function filterProviderPayload(payload: unknown): unknown | undefined {
  if (!isObject(payload)) return undefined;

  for (const key of ["messages", "input"] as const) {
    const messages = payload[key];
    if (Array.isArray(messages)) payload[key] = filterMessageList(messages);
  }

  return payload;
}
