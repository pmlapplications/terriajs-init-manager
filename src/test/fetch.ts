// A fake fetch for frontend tests: routes "METHOD /path" to handlers and
// records every call.

import { vi } from "vitest";

export interface Call {
  method: string;
  url: string;
  body: unknown;
}

type Handler = (call: Call) => unknown | Response;

/**
 * Replaces fetch. Keys are "GET /api/users" (the query string is ignored) and
 * values are a JSON body to return with 200, or a function of the call that
 * returns a body or a Response. Unmatched requests get a 404.
 */
export function mockFetch(routes: Record<string, unknown | Handler>) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    const call = { method, url, body };
    calls.push(call);
    const key = `${method} ${url.split("?")[0]}`;
    if (!(key in routes)) return json({ error: `No mock for ${key}` }, 404);
    const route = routes[key];
    const result = typeof route === "function" ? (route as Handler)(call) : route;
    return result instanceof Response ? result : json(result);
  });
  vi.stubGlobal("fetch", fetch);
  return { fetch, calls };
}

export const json = (body: unknown, status = 200) =>
  status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
