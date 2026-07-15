import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { filterProviderPayload } from "../lib/filter-provider-payload.ts";

export default function contextModeInjectionFilter(pi: ExtensionAPI) {
  pi.on("before_provider_request", (event) => {
    return filterProviderPayload(event.payload);
  });
}
