import type { components } from "../../api/schema";

// Lives apart from StatusCard so sibling components (QuoteCard, ActionBar)
// can name the type without a cycle through the component module;
// StatusCard re-exports it for outside consumers.
export type Status = components["schemas"]["Status"];
