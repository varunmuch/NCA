import type { Metadata } from "next";
import Link from "next/link";

import { AuthLayout } from "@/components/auth/AuthLayout";
import { callAuthBridge, getBridgeErrorMessage } from "@/lib/cie-server";

export const metadata: Metadata = { title: "Confirm your email" };

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  let message = "This link is missing its code.";
  let ok = false;

  if (token) {
    try {
      const result = await callAuthBridge("/api/v1/auth/email/verify", { token });
      ok = result.ok;
      message = ok
        ? "Your email is confirmed. You can always reset your password with it."
        : getBridgeErrorMessage(result.data, "This link is invalid or has expired.");
    } catch {
      message = "We couldn't reach the server. Please try again in a moment.";
    }
  }

  return (
    <AuthLayout title={ok ? "Email confirmed" : "We couldn't confirm your email"} subtitle={message}>
      <Link
        href="/"
        className="inline-flex h-12 w-full items-center justify-center rounded-full bg-primary px-5 text-base font-semibold text-white hover:bg-primary-hover"
      >
        Continue to Career Explorer
      </Link>
      {!ok && (
        <p className="mt-4 text-center text-sm text-ink-muted">
          Signed in? You can send a new link from the banner at the top of any page.
        </p>
      )}
    </AuthLayout>
  );
}
