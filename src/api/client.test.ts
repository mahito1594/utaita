// @vitest-environment happy-dom
// Pins toResult's folding of openapi-fetch edge shapes that page tests
// never exercise. MSW is the only mock seam (ADR-0009); happy-dom provides
// the origin the client's relative baseUrl resolves against.
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { client, toResult } from "./client";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test("a bodyless success is a malformed response, not a silent undefined", async () => {
  // Every endpoint this app calls is typed with a JSON body; openapi-fetch
  // reports a 204 as data: undefined, which must not leak out as ok().
  server.use(
    http.get(
      "*/api/v1/timelines/home",
      () => new HttpResponse(null, { status: 204 }),
    ),
  );

  const result = await toResult(client.GET("/api/v1/timelines/home"));

  expect(result).toEqual({
    ok: false,
    error: { kind: "http", status: 204, message: "empty response body" },
  });
});

test("an HTTP failure carries the instance's error message", async () => {
  server.use(
    http.get("*/api/v1/timelines/home", () =>
      HttpResponse.json({ error: "Invalid credentials." }, { status: 403 }),
    ),
  );

  const result = await toResult(client.GET("/api/v1/timelines/home"));

  expect(result).toEqual({
    ok: false,
    error: { kind: "http", status: 403, message: "Invalid credentials." },
  });
});
