import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  AuthLayout,
  GoogleButton,
  OrDivider,
} from "@/components/auth/AuthLayout";
import { LoginForm } from "@/components/auth/PasswordForms";


export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const { reset } = await searchParams;
  const session = await auth();

  if (session) {
    redirect("/");
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to keep exploring your future."
    >
      {reset && (
        <p role="status" className="mb-5 rounded-xl bg-accent-softer px-4 py-3 text-sm text-accent-ink">
          Your password was updated. Sign in with your new password.
        </p>
      )}

      <GoogleButton label="Continue with Google" />

      <OrDivider />

      <LoginForm />

      <p className="mt-6 text-center text-sm text-ink-muted">
        New here?{" "}
        <Link
          href="/signup"
          className="font-semibold text-primary hover:underline"
        >
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
