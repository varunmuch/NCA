"use client";

import { useState } from "react";
import { MailCheck, X } from "lucide-react";

import { api } from "@/lib/api";

import { useStudent } from "./StudentContext";

/**
 * Asks password-account students to confirm their email, so they can
 * reset a forgotten password. Dismissal lasts for this page view only.
 */
export function VerifyEmailBanner() {
  const { me, email } = useStudent();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !me.account?.has_password || me.account.email_verified) {
    return null;
  }

  async function resend() {
    setState("sending");

    try {
      await api.resendVerification();
      setState("sent");
    } catch {
      setState("error");
    }
  }

  return (
    <div role="status" className="mb-6 flex items-start gap-3 rounded-2xl border border-sun/40 bg-sun-soft px-4 py-3 text-sm text-ink">
      <MailCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-sun-ink" />
      <p className="flex-1 leading-relaxed">
        {state === "sent" ? (
          <>We sent a confirmation link to <strong>{email}</strong>. Check your inbox (and spam).</>
        ) : (
          <>
            Confirm your email so you can reset your password if you forget it.{" "}
            <button
              type="button"
              onClick={resend}
              disabled={state === "sending"}
              className="font-semibold text-primary underline-offset-2 hover:underline disabled:opacity-60"
            >
              {state === "sending" ? "Sending…" : "Send me the link"}
            </button>
            {state === "error" && <span className="ml-2 text-danger">Couldn&apos;t send. Try again.</span>}
          </>
        )}
      </p>
      <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss" className="rounded-full p-1 text-ink-muted hover:bg-sun/30">
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
