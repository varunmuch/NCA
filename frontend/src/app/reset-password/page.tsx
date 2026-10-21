import type { Metadata } from "next";
import Link from "next/link";

import { AuthLayout } from "@/components/auth/AuthLayout";
import { ResetPasswordForm } from "@/components/auth/PasswordForms";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Pick something you'll remember. You'll be signed in right after."
    >
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p className="text-sm text-ink-muted">
          This link is missing its code.{" "}
          <Link href="/forgot-password" className="font-semibold text-primary hover:underline">
            Request a new link
          </Link>
          .
        </p>
      )}
    </AuthLayout>
  );
}
