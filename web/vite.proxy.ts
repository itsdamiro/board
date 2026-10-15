// The dev server's way to the API (ADR 004). The Python server accepts only its own Host and Origin (ADR 001, decision 1).
// This file never loosens that: it refuses a request that does not come from the dev page itself, and only then speaks as
// the server's own page would. Overwriting Origin without the check would let any web page write to the vault through here.

import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

export const API_PREFIX = "/api";
const LOOPBACK = ["127.0.0.1", "localhost"];

export function isApiPath(url: string | undefined): boolean {
  return (url ?? "").startsWith(API_PREFIX);
}

/** Why a request to the dev server must be refused, or null. `devPort` is the one Vite listens on. */
export function refusal(headers: IncomingHttpHeaders, devPort: number): string | null {
  const hosts = LOOPBACK.map((name) => `${name}:${devPort}`);
  if (!hosts.includes(headers.host ?? "")) return "this request names another host";
  const origin = headers.origin;
  if (origin === undefined) return null;
  // A repeated Origin reaches here as one string with a comma in it, which matches nothing and is refused.
  return hosts.some((host) => origin === `http://${host}`) ? null : "this request comes from another origin";
}

/** The headers the Python server expects from its own page: its own Host and Origin. */
export function asApiHeaders(apiPort: number): { host: string; origin: string } {
  const host = `127.0.0.1:${apiPort}`;
  return { host, origin: `http://${host}` };
}

export function checkingProxy(devPort: number, apiPort: number): Plugin {
  return {
    name: "board-checking-proxy",
    // Runs before Vite's own proxy middleware (a hook that returns no function is a pre-hook), so nothing reaches the
    // proxy without passing refusal().
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (!isApiPath(req.url)) return next();
        const why = refusal(req.headers, devPort);
        if (why !== null) {
          res.statusCode = 403;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(why);
          return;
        }
        Object.assign(req.headers, asApiHeaders(apiPort));
        next();
      });
    },
  };
}
