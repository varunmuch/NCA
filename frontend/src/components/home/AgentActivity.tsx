"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, Loader2, Zap } from "lucide-react";

import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import type { AgentActivityItem } from "@/types/cie";

/** What the counselor did on its own, live while something is running. */
export function AgentActivity() {
  const [items, setItems] = useState<AgentActivityItem[] | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const load = () =>
      api
        .agentActivity()
        .then((data) => {
          if (cancelled) {
            return;
          }

          setItems(data.items);
          setRunning(data.running);

          // Check again while a job runs; quiet otherwise.
          if (data.running) {
            timer = window.setTimeout(load, 4000);
          }
        })
        .catch(() => undefined);

    void load();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="agent-activity-title" className="rounded-[var(--radius-card)] border border-primary/20 bg-gradient-to-br from-primary-softer to-white p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="agent-activity-title" className="flex items-center gap-2 font-semibold text-ink">
          <Zap aria-hidden className="size-4 text-primary" />
          {running ? "Your counselor is working on…" : "What your counselor did for you"}
        </h2>
      </div>
      <ul className="mt-3 space-y-3" aria-live="polite">
        {items.slice(0, 4).map((item) => {
          const Icon = item.status === "running" ? Loader2 : item.status === "failed" ? CircleAlert : CircleCheck;
          const tone = item.status === "running" ? "animate-spin text-primary" : item.status === "failed" ? "text-sun" : "text-accent";

          return (
            <li key={item.id} className="flex gap-3">
              <Icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${tone}`} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">
                  {item.href && item.status !== "running" ? (
                    <Link href={item.href} className="hover:text-primary hover:underline">
                      {item.title}
                    </Link>
                  ) : (
                    item.title
                  )}
                </p>
                <p className="text-xs text-ink-muted">
                  {item.reason ? `Because ${item.reason}` : ""}
                  {item.reason && item.created_at ? " · " : ""}
                  {item.created_at ? timeAgo(item.created_at) : ""}
                </p>
                {item.detail && item.status === "done" && <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{item.detail}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
