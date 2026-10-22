"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Target } from "lucide-react";

import { api } from "@/lib/api";

/**
 * "Make this my goal": the student's goal steers the quiz, the plan, Home
 * and document suggestions toward one field. Only the student sets it.
 */
export function SetGoalButton({ title, size = "md" }: { title: string; size?: "sm" | "md" }) {
  const router = useRouter();
  const [goal, setGoal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .me()
      .then((me) => active && setGoal(me.profile?.career_aspiration ?? ""))
      .catch(() => active && setGoal(""));

    return () => {
      active = false;
    };
  }, []);

  const isGoal = goal !== null && goal.trim().toLowerCase() === title.trim().toLowerCase();
  const sizing = size === "sm" ? "h-9 px-4 text-sm" : "h-11 px-5 text-[15px]";

  if (goal === null) {
    return null;
  }

  if (isGoal) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full bg-accent-softer font-semibold text-accent-ink ${sizing}`}>
        <Target aria-hidden className="size-4" /> Your goal
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);

        try {
          await api.updateProfile({ career_aspiration: title, career_status: "have_goal" });
          setGoal(title);
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className={`inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface font-semibold text-ink transition-colors hover:border-primary/40 hover:bg-primary-softer disabled:opacity-60 ${sizing}`}
    >
      <Target aria-hidden className="size-4" /> Make this my goal
    </button>
  );
}
