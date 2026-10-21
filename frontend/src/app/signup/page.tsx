import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  AuthLayout,
  GoogleButton,
  OrDivider,
} from "@/components/auth/AuthLayout";
import { SignupForm } from "@/components/auth/PasswordForms";


export default async function SignupPage() {
  const session = await auth();

  if (session) {
    redirect("/");
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="It's free and takes less than a minute."
    >
      <GoogleButton label="Sign up with Google" />

      <OrDivider />

      <SignupForm />

      <p className="mt-6 text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-semibold text-primary hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
