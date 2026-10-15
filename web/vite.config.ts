import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { API_PREFIX, checkingProxy } from "./vite.proxy.ts";

const DEV_PORT = 5173;

function apiPort(): number {
  const raw = process.env.BOARD_PORT ?? "8765"; // the Python server's default (board/__main__.py)
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`BOARD_PORT must be a port number, not "${raw}"`);
  }
  return port;
}

export default defineConfig(() => {
  const api = apiPort();
  return {
    plugins: [react(), tailwindcss(), checkingProxy(DEV_PORT, api)],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    // Fonts and other assets stay files: the server's Content-Security-Policy (ADR 002, decision 6) refuses data: URIs.
    build: { assetsInlineLimit: 0 },
    // Loopback only, on a fixed port: the proxy's check names this port (ADR 004, decisions 2 and 3).
    server: {
      host: "127.0.0.1",
      port: DEV_PORT,
      strictPort: true,
      proxy: { [API_PREFIX]: { target: `http://127.0.0.1:${api}` } },
    },
    test: { environment: "jsdom", include: ["src/**/*.test.{ts,tsx}", "vite.proxy.test.ts"] },
  };
});
