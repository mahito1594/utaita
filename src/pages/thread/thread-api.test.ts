// @vitest-environment happy-dom
// These are the first calls in the app that interpolate a path parameter, so
// what is pinned here is the request the client actually sends. MSW is the
// only mock seam (ADR-0009); happy-dom provides the origin the client's
// relative baseUrl resolves against.
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { fetchContext, fetchStatus, resolveStatus } from "./thread-api";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test("fetchStatus asks for the status with that id", async () => {
  server.use(
    http.get<{ id: string }>("*/api/v1/statuses/:id", ({ params }) =>
      HttpResponse.json({ id: params.id }),
    ),
  );

  const result = await fetchStatus("110000000000000001");

  expect(result).toEqual({ ok: true, value: { id: "110000000000000001" } });
});

test("fetchContext asks for the context of that id", async () => {
  server.use(
    http.get<{ id: string }>("*/api/v1/statuses/:id/context", ({ params }) =>
      HttpResponse.json({
        ancestors: [{ id: params.id }],
        descendants: [],
      }),
    ),
  );

  const result = await fetchContext("110000000000000001");

  expect(result).toEqual({
    ok: true,
    value: { ancestors: [{ id: "110000000000000001" }], descendants: [] },
  });
});

test("a status that is gone comes back as a value, not a throw", async () => {
  server.use(
    http.get("*/api/v1/statuses/:id", () =>
      HttpResponse.json({ error: "Record not found" }, { status: 404 }),
    ),
  );

  const result = await fetchStatus("110000000000000001");

  expect(result).toEqual({
    ok: false,
    error: { kind: "http", status: 404, message: "Record not found" },
  });
});

test("resolveStatus asks the instance to ingest the AP id", async () => {
  const apId = "https://remote.example/objects/abc";
  const seen: URLSearchParams[] = [];
  server.use(
    http.get("*/api/v2/search", ({ request }) => {
      seen.push(new URL(request.url).searchParams);
      return HttpResponse.json({
        accounts: [],
        hashtags: [],
        statuses: [{ id: "110000000000000001" }],
      });
    }),
  );

  const result = await resolveStatus(apId);

  expect(seen[0]?.get("q")).toBe(apId);
  expect(seen[0]?.get("resolve")).toBe("true");
  expect(result).toEqual({ ok: true, value: { id: "110000000000000001" } });
});

test("an AP id the instance cannot ingest resolves to nothing", async () => {
  // The request succeeded; the post is simply not obtainable. The caller has
  // to tell that apart from the request itself failing.
  server.use(
    http.get("*/api/v2/search", () =>
      HttpResponse.json({ accounts: [], hashtags: [], statuses: [] }),
    ),
  );

  const result = await resolveStatus("https://remote.example/objects/gone");

  expect(result).toEqual({ ok: true, value: null });
});
