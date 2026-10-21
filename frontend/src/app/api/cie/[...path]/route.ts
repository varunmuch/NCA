import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/auth";
import { identityFromSession, studentFetch } from "@/lib/cie-server";

/**
 * Same-origin proxy from the browser to the CIE API.
 *
 * The browser only ever talks to Next.js. This handler checks the Auth.js
 * session and forwards the request with the bridge secret and the
 * session's identity, so the backend never trusts a browser-supplied
 * student ID.
 */

// Plan generation can take a minute or more on the local model.
export const maxDuration = 300;

const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "content-disposition",
  "content-length",
];

async function forward(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const session = await auth();
  const identity = identityFromSession(session);

  if (!identity) {
    return NextResponse.json(
      { detail: "Please sign in again." },
      { status: 401 }
    );
  }

  const { path } = await context.params;

  // Only allow plain path segments through.
  if (path.some((segment) => segment === ".." || segment.includes("/"))) {
    return NextResponse.json({ detail: "Not found." }, { status: 404 });
  }

  const target =
    "/" + path.map(encodeURIComponent).join("/") + request.nextUrl.search;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");

  if (contentType) {
    headers.set("content-type", contentType);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  let response: Response;

  try {
    response = await studentFetch(identity, target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      duplex: hasBody ? "half" : undefined,
    });
  } catch (error) {
    console.error("CIE API unreachable:", error);

    return NextResponse.json(
      { detail: "We couldn't reach the server. Please try again in a moment." },
      { status: 502 }
    );
  }

  const responseHeaders = new Headers();

  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = response.headers.get(name);

    if (value) {
      responseHeaders.set(name, value);
    }
  }

  responseHeaders.set("cache-control", "no-store");

  return new NextResponse(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}

export {
  forward as GET,
  forward as POST,
  forward as PUT,
  forward as PATCH,
  forward as DELETE,
};
