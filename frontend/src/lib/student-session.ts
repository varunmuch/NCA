import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  ensureStudentLinked,
  identityFromSession,
  studentFetch,
} from "@/lib/cie-server";
import type { MeResponse } from "@/types/cie";

/**
 * Resolve the signed-in student for a server-rendered page, linking the
 * account on first visit. Redirects to /login when there is no usable
 * session. Cached per request.
 */
export const getStudent = cache(async () => {
  const session = await auth();
  const identity = identityFromSession(session);

  if (!session || !identity) {
    redirect("/login");
  }

  const linked = await ensureStudentLinked(session);

  if (linked === "needs_password_link") {
    redirect("/link-account");
  }

  if (linked === "revoked") {
    redirect("/session-expired");
  }

  if (linked !== "linked") {
    throw new Error("We couldn't connect your account. Please try again.");
  }

  const response = await studentFetch(identity, "/me");

  if (!response.ok) {
    throw new Error("We couldn't load your profile. Please try again.");
  }

  const me = (await response.json()) as MeResponse;

  return {
    me,
    email: session.user.email ?? "",
    image: session.user.image ?? null,
  };
});

/**
 * Server-side read of a student-owned API route for the signed-in student.
 */
export async function fetchAsStudent<T>(path: string): Promise<T> {
  const session = await auth();
  const identity = identityFromSession(session);

  if (!identity) {
    redirect("/login");
  }

  const response = await studentFetch(identity, path);

  if (!response.ok) {
    throw new Error("We couldn't load this page. Please try again.");
  }

  return (await response.json()) as T;
}
