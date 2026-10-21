import type { Metadata } from "next";

import { AuthLayout } from "@/components/auth/AuthLayout";
import { SignOutButton } from "@/components/auth/SignOutButton";

export const metadata: Metadata = { title: "Please sign in again" };

export default function SessionExpiredPage() {
  return (
    <AuthLayout
      title="Please sign in again"
      subtitle="Your password was changed, so we signed you out everywhere to keep your account safe."
    >
      <SignOutButton
        label="Go to sign in"
        className="h-12 w-full rounded-full bg-primary px-5 text-base font-semibold text-white hover:bg-primary-hover"
      />
    </AuthLayout>
  );
}
