import "server-only";

import type { Session } from "next-auth";

export type BridgeResult<T> = {
  ok: boolean;
  status: number;
  data: T;
};

function backendConfig() {
  const apiBase = process.env.CIE_API_BASE;
  const bridgeSecret = process.env.CIE_AUTH_BRIDGE_SECRET;

  if (!apiBase || !bridgeSecret) {
    throw new Error(
      "CIE_API_BASE and CIE_AUTH_BRIDGE_SECRET must be configured."
    );
  }

  return { apiBase, bridgeSecret };
}

/**
 * Calls a backend auth endpoint from the Next.js server with the bridge
 * secret. Never import this from client components.
 */
export async function callAuthBridge<T = Record<string, unknown>>(
  path: string,
  body: unknown
): Promise<BridgeResult<T>> {
  const { apiBase, bridgeSecret } = backendConfig();

  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CIE-Auth-Bridge": bridgeSecret,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  let data: unknown = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  return {
    ok: response.ok,
    status: response.status,
    data: data as T,
  };
}

export function getBridgeErrorMessage(
  data: unknown,
  fallback: string
): string {
  if (typeof data !== "object" || data === null) {
    return fallback;
  }

  const detail = (data as { detail?: unknown }).detail;

  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (
    typeof detail === "object" &&
    detail !== null &&
    typeof (detail as { message?: unknown }).message === "string"
  ) {
    return (detail as { message: string }).message;
  }

  return fallback;
}

export type StudentIdentity = {
  provider: "google" | "password";
  subject: string;
  authTime?: number;
};

/**
 * The identity the backend uses to resolve the student. It comes only from
 * the verified Auth.js session, never from the browser.
 */
export function identityFromSession(
  session: Session | null
): StudentIdentity | null {
  const user = session?.user;

  if (!user?.providerSubject) {
    return null;
  }

  if (user.provider === "password") {
    return { provider: "password", subject: user.providerSubject, authTime: user.authTime };
  }

  if (user.provider === "google" && user.googleEmailVerified === true) {
    return { provider: "google", subject: user.providerSubject };
  }

  return null;
}

/**
 * Fetch a student-owned backend route on behalf of the signed-in student.
 */
export async function studentFetch(
  identity: StudentIdentity,
  path: string,
  init: RequestInit & { duplex?: "half" } = {}
): Promise<Response> {
  const { apiBase, bridgeSecret } = backendConfig();

  const headers = new Headers(init.headers);
  headers.set("X-CIE-Auth-Bridge", bridgeSecret);
  headers.set("X-CIE-Provider", identity.provider);
  headers.set("X-CIE-Subject", identity.subject);

  if (identity.authTime) {
    headers.set("X-CIE-Auth-Time", String(identity.authTime));
  }

  return fetch(`${apiBase}/api/v1${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

export type LinkResult = "linked" | "needs_password_link" | "revoked" | "failed";

/**
 * Link the session to a CIE student record (creates it on first sign-in).
 * Safe to call repeatedly. A Google sign-in whose email already has a
 * password account must prove ownership first ("needs_password_link").
 */
export async function ensureStudentLinked(
  session: Session | null
): Promise<LinkResult> {
  const user = session?.user;

  if (!user?.providerSubject) {
    return "failed";
  }

  if (user.provider === "password") {
    const result = await callAuthBridge<{ detail?: { code?: string } }>(
      "/api/v1/auth/password/bootstrap",
      {
        student_id: user.providerSubject,
        auth_time: user.authTime ?? null,
      }
    );

    if (result.ok) {
      return "linked";
    }

    return result.data?.detail?.code === "SESSION_REVOKED" ? "revoked" : "failed";
  }

  if (
    user.provider === "google" &&
    user.email &&
    user.googleEmailVerified === true
  ) {
    const result = await callAuthBridge<{ detail?: { code?: string } }>(
      "/api/v1/auth/google/bootstrap",
      {
        provider: "google",
        provider_subject: user.providerSubject,
        email: user.email.trim().toLowerCase(),
        name: user.name?.trim() || "",
      }
    );

    if (result.ok) {
      return "linked";
    }

    return result.data?.detail?.code === "LINK_PASSWORD_REQUIRED"
      ? "needs_password_link"
      : "failed";
  }

  return "failed";
}
