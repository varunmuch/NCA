import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { LinkAccountForm } from "@/components/auth/PasswordForms";
import { SignOutButton } from "@/components/auth/SignOutButton";

export const metadata: Metadata = { title: "Connect your account" };

export const dynamic = "force-dynamic";

export default async function LinkAccountPage() {
  const session = await auth();
  const user = session?.user;

  if (!user) {
    redirect("/login");
  }

  if (user.provider !== "google" || !user.email) {
    redirect("/");
  }

  return (
    <AuthLayout
      title="You already have an account"
      subtitle="You signed up with this email and a password before. Enter that password once and Google sign-in will open the same account, with all your conversations, documents, and plans."
    >
      <LinkAccountForm email={user.email} />

      <p className="mt-6 text-center text-sm text-ink-muted">
        Not you, or want to use a different account?{" "}
        <SignOutButton
          label="Sign out"
          className="font-semibold text-primary hover:underline"
        />
      </p>
    </AuthLayout>
  );
}
