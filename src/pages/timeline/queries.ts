import { query } from "@solidjs/router";
import { client, toResult } from "../../api/client";

// Query definitions ARE the endpoint calls — no separate endpoint-function
// layer (ADR-0010). Key names are colon-scoped so related entries can be
// revalidated by prefix later (e.g. everything under "timeline:" after login).
export const getHomeTimeline = query(
  () => toResult(client.GET("/api/v1/timelines/home")),
  "timeline:home",
);
