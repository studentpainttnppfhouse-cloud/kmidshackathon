import type { NextRequest } from "next/server";

/**
 * The origin the browser actually used.
 *
 * Behind Render's proxy `request.nextUrl` carries the internal origin the Node
 * server sees, so a redirect built from it sends the browser to a host that
 * does not exist publicly — the same trap `middleware.ts` documents. The Host
 * header is the name the browser asked for, so redirects are built from that.
 */
export function requestOrigin(request: NextRequest): string {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const proto = forwarded || request.nextUrl.protocol.replace(":", "") || "https";
  return `${proto}://${host}`;
}

/**
 * CSRF check for route handlers that accept a form post.
 *
 * Server Actions get this from Next for free; a plain `<form action="/…">` —
 * which is what an upload has to be, because Server Actions cap the request
 * body — does not. The session cookie is `SameSite=Lax`, so a cross-site POST
 * arrives without it and fails anyway; this is the second lock: the request
 * must say it came from this origin, and a request that says nothing at all is
 * refused rather than trusted.
 */
export function sameOrigin(request: NextRequest): boolean {
  const host = request.headers.get("host");
  if (!host) return false;

  const stated = request.headers.get("origin") ?? request.headers.get("referer");
  if (!stated) return false;

  try {
    return new URL(stated).host === host;
  } catch {
    return false;
  }
}
