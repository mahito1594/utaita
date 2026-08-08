import { type ApiError, client, toResult } from "../../api/client";
import type { Result } from "../../api/result";
import type { Status } from "../../entities/status/types";

// The store's own paging vocabulary (timeline-store.ts): every fetchPage
// below is a thin wrapper that plugs an endpoint into this same shape, so
// the store stays endpoint-agnostic.
export type TimelinePageParams = {
  since_id?: string;
  max_id?: string;
  limit?: number;
};

export type FetchTimelinePage = (
  params: TimelinePageParams,
) => Promise<Result<Status[], ApiError>>;

export type TimelineDefinition = {
  label: string;
  path: string;
  fetchPage: FetchTimelinePage;
};

// openapi-fetch's per-path typing doesn't parametrize over the path string
// (each `client.GET(path, ...)` call site is where the query type gets
// resolved), so each timeline gets its own thin wrapper rather than one
// function taking a path argument.
export const home: TimelineDefinition = {
  label: "Home",
  path: "/",
  fetchPage: (params) =>
    toResult(
      client.GET("/api/v1/timelines/home", { params: { query: params } }),
    ),
};

export const local: TimelineDefinition = {
  label: "Local",
  path: "/local",
  fetchPage: (params) =>
    toResult(
      client.GET("/api/v1/timelines/public", {
        params: { query: { ...params, local: true } },
      }),
    ),
};

export const bubble: TimelineDefinition = {
  label: "Bubble",
  path: "/bubble",
  fetchPage: (params) =>
    toResult(
      client.GET("/api/v1/timelines/bubble", { params: { query: params } }),
    ),
};

export const federated: TimelineDefinition = {
  label: "Federated",
  path: "/federated",
  fetchPage: (params) =>
    toResult(
      client.GET("/api/v1/timelines/public", { params: { query: params } }),
    ),
};
