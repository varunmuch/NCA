"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

type SignOutButtonProps = {
  label?: string;
  className?: string;
};

export function SignOutButton({
  label = "Sign Out",
  className = "",
}: SignOutButtonProps) {
  const [
    isSigningOut,
    setIsSigningOut,
  ] = useState(false);

  async function handleSignOut() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    try {
      await signOut({
        redirect: true,
        redirectTo: "/login",
      });
    } catch (error) {
      console.error(
        "Unable to sign out:",
        error
      );

      setIsSigningOut(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => {
        void handleSignOut();
      }}
      disabled={isSigningOut}
      className={className}
    >
      {isSigningOut
        ? "Signing Out..."
        : label}
    </button>
  );
}
