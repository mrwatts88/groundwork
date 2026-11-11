// Serves the built client at / so one port does everything (DESIGN.md 12.1).
// Only files inside the client dir are served. Anything else is a 404.

import { readFile, stat } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".map": "application/json",
};

/** The file a request path maps to, or undefined if it would leave the root. */
export function resolveStatic(root: string, urlPath: string): string | undefined {
  let path: string;
  try {
    path = decodeURIComponent(urlPath.split("?")[0]!.split("#")[0]!);
  } catch {
    return undefined;
  }
  if (path.includes("\0")) return undefined;
  if (path === "/" || path === "") path = "/index.html";
  const base = normalize(root);
  const file = normalize(join(base, path));
  if (file !== base && !file.startsWith(base.endsWith(sep) ? base : base + sep)) return undefined;
  return file;
}

/** Serve one file from the client dir. Returns false if there is nothing to serve. */
export async function serveStatic(root: string, urlPath: string, res: ServerResponse): Promise<boolean> {
  const file = resolveStatic(root, urlPath);
  if (file === undefined) return false;
  try {
    const info = await stat(file);
    if (!info.isFile()) return false;
    const body = await readFile(file);
    const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
    // Vite puts a content hash in asset names, so those can be cached for good.
    const cache = urlPath.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
    res.writeHead(200, { "content-type": type, "content-length": body.length, "cache-control": cache });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}
