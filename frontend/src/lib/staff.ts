import "server-only";

import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { identityFromSession, studentFetch } from "@/lib/cie-server";

/** Server-side read of a staff-only API route. */
export async function fetchAsStaff<T>(path: string): Promise<T> {
  const identity = identityFromSession(await auth());

  if (!identity) {
    redirect("/login");
  }

  const response = await studentFetch(identity, `/staff${path}`);

  // Non-staff get the ordinary not-found page.
  if (response.status === 403 || response.status === 404) {
    notFound();
  }

  if (!response.ok) {
    throw new Error("We couldn't load this page. Please try again.");
  }

  return (await response.json()) as T;
}
