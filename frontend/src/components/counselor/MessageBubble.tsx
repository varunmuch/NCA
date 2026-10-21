"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  Compass,
  FileUp,
  Layers,
  Map,
  MessageCircle,
  RotateCcw,
  Route,
  Sparkles,
  Target,
  UserRoundPen,
  X,
} from "lucide-react";

import { FamilyIcon } from "@/components/careers/CareerCard";
import { Markdown } from "@/components/ui/Markdown";
import { api } from "@/lib/api";
import { formatTime } from "@/lib/format";
import type { CareerSuggestion, ChatMessage, CounselorAction, StudentFact } from "@/types/cie";

import { ModuleResult } from "./ModuleResult";

export const ACTION_META: Record<CounselorAction, { label: string; icon: typeof Target; prompt?: string }> = {
  build_plan: { label: "Build my career plan", icon: Map },
  explore_careers: { label: "Explore careers", icon: Compass },
  upload_document: { label: "Upload resume or transcript", icon: FileUp },
  update_profile: { label: "Update my profile", icon: UserRoundPen },
  skill_check: { label: "Skill check", icon: Target, prompt: "Can you do a skill check for the career we're talking about?" },
  project_ideas: { label: "Project ideas", icon: Layers, prompt: "Can you suggest a project I could build for this career?" },
  certificates: { label: "Certificates & courses", icon: BookOpen, prompt: "Which certificates or courses could help me with this career?" },
  interview_practice: { label: "Interview practice", icon: MessageCircle, prompt: "Help me practice for an interview related to this career." },
  career_roadmap: { label: "Career roadmap", icon: Route, prompt: "Can you show me a roadmap for this career?" },
};

export function CounselorAvatar({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const box = size === "lg" ? "size-14" : size === "sm" ? "size-7" : "size-8";
  const glyph = size === "lg" ? "size-7" : size === "sm" ? "size-3.5" : "size-4";

  return (
    <span
      aria-hidden
      className={`flex ${box} shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary via-[#5b4fd6] to-accent text-white shadow-[0_4px_12px_-4px_rgb(67_56_202/0.5)]`}
    >
      <Sparkles className={glyph} />
    </span>
  );
}

function CareerSuggestions({ items }: { items: CareerSuggestion[] }) {
  return (
    <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
      {items.map((item) => {
        const body = (
          <>
            <div className="flex items-start gap-3">
              <FamilyIcon family={item.family} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-snug text-ink">{item.title}</p>
                {item.family_label && <p className="text-xs text-ink-muted">{item.family_label}</p>}
              </div>
              {item.slug && <ArrowUpRight aria-hidden className="size-4 shrink-0 text-ink-soft group-hover:text-primary" />}
            </div>
            {item.why && <p className="mt-2 text-sm leading-relaxed text-ink-muted">{item.why}</p>}
          </>
        );

        return item.slug ? (
          <Link
            key={item.title}
            href={`/explore/${item.slug}`}
            className="group rounded-2xl border border-line bg-surface p-3.5 transition-[border-color,box-shadow] hover:border-primary/30 hover:shadow-[var(--shadow-card)]"
          >
            {body}
          </Link>
        ) : (
          <div key={item.title} className="rounded-2xl border border-line bg-surface p-3.5">
            {body}
          </div>
        );
      })}
    </div>
  );
}

function ProposedFacts({ facts }: { facts: StudentFact[] }) {
  const [states, setStates] = useState<Record<number, StudentFact["status"]>>(() =>
    Object.fromEntries(facts.map((fact) => [fact.id, fact.status]))
  );
  const [busy, setBusy] = useState<number | null>(null);

  async function set(fact: StudentFact, status: "confirmed" | "dismissed") {
    setBusy(fact.id);

    try {
      await api.updateFact(fact.id, { status });
      setStates((current) => ({ ...current, [fact.id]: status }));
    } catch {
      // Leave it unchanged; the student can manage it on their profile.
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-accent/20 bg-accent-softer p-3.5">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-accent-ink">Remember this about you?</p>
      <ul className="mt-2 space-y-2">
        {facts.map((fact) => {
          const status = states[fact.id];

          return (
            <li key={fact.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-ink">
                <span className="text-ink-muted">{fact.category_label}: </span>
                <span className="font-semibold">{fact.value}</span>
              </span>
              {status === "suggested" ? (
                <span className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={busy === fact.id}
                    onClick={() => set(fact, "confirmed")}
                    className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
                  >
                    <Check aria-hidden className="size-3.5" /> Save
                  </button>
                  <button
                    type="button"
                    disabled={busy === fact.id}
                    onClick={() => set(fact, "dismissed")}
                    aria-label={`Don't save ${fact.value}`}
                    className="inline-flex items-center rounded-full border border-line-strong bg-surface px-2 py-1 text-xs font-semibold text-ink-muted hover:text-ink disabled:opacity-60"
                  >
                    <X aria-hidden className="size-3.5" />
                  </button>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent-ink">
                  {status === "confirmed" ? (
                    <>
                      <Check aria-hidden className="size-3.5" /> Saved to your profile
                    </>
                  ) : (
                    "Not saved"
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function MessageBubble({
  message,
  isLast,
  onQuickReply,
  onAction,
  onRetry,
  disabled,
}: {
  message: ChatMessage;
  isLast: boolean;
  onQuickReply: (text: string) => void;
  onAction: (action: CounselorAction) => void;
  onRetry: () => void;
  disabled: boolean;
}) {
  const { metadata } = message;

  if (message.role === "user") {
    return (
      <div className="flex justify-end animate-[var(--animate-fade-up)]">
        <div className="max-w-[85%] sm:max-w-[75%]">
          <div className="whitespace-pre-wrap rounded-[1.25rem] rounded-br-md bg-primary px-4 py-2.5 text-[15px] leading-relaxed text-white shadow-[0_1px_2px_rgb(23_32_51/0.06)]">
            {message.content}
          </div>
          {message.created_at && (
            <p className="mt-1 pr-1 text-right text-[11px] text-ink-soft">{formatTime(message.created_at)}</p>
          )}
        </div>
      </div>
    );
  }

  if (metadata.error) {
    return (
      <div className="flex gap-3">
        <CounselorAvatar />
        <div role="alert" className="rounded-2xl border border-danger/20 bg-danger-soft/50 px-4 py-3 text-sm">
          <p className="text-ink">I couldn&apos;t answer just now. Your message is saved.</p>
          <button
            type="button"
            onClick={onRetry}
            disabled={disabled}
            className="mt-2 inline-flex items-center gap-1.5 font-semibold text-primary hover:underline disabled:opacity-60"
          >
            <RotateCcw aria-hidden className="size-3.5" /> Try again
          </button>
        </div>
      </div>
    );
  }

  const suggestions = metadata.career_suggestions ?? [];
  const actions = metadata.suggested_actions ?? [];
  const facts = metadata.proposed_facts ?? [];
  const quickReplies = isLast ? metadata.quick_replies ?? [] : [];

  return (
    <div className="flex gap-3 animate-[var(--animate-fade-up)]">
      <CounselorAvatar />
      <div className="min-w-0 flex-1 pt-0.5">
        {message.content && (
          <Markdown text={message.content} className="text-[15px] leading-[1.7] text-ink" />
        )}

        {metadata.module && (
          <div className="mt-4">
            <ModuleResult type={metadata.module.type} result={metadata.module.result} />
          </div>
        )}

        {suggestions.length > 0 && <CareerSuggestions items={suggestions} />}

        {metadata.follow_up_question && (
          <div className="mt-4 rounded-2xl bg-primary-softer px-4 py-3">
            <p className="font-semibold leading-relaxed text-primary-ink">{metadata.follow_up_question}</p>
            {quickReplies.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {quickReplies.map((reply) => (
                  <button
                    key={reply}
                    type="button"
                    disabled={disabled}
                    onClick={() => onQuickReply(reply)}
                    className="rounded-full border border-primary/20 bg-surface px-3.5 py-1.5 text-sm font-medium text-primary-ink transition-colors hover:border-primary/50 hover:bg-primary-soft disabled:opacity-60"
                  >
                    {reply}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {facts.length > 0 && <ProposedFacts facts={facts} />}

        {isLast && actions.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {actions.map((action) => {
              const meta = ACTION_META[action];

              if (!meta) {
                return null;
              }

              const Icon = meta.icon;

              return (
                <button
                  key={action}
                  type="button"
                  disabled={disabled}
                  onClick={() => onAction(action)}
                  className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:border-primary/40 hover:bg-primary-softer disabled:opacity-60"
                >
                  <Icon aria-hidden className="size-4 text-primary" />
                  {meta.label}
                </button>
              );
            })}
          </div>
        )}

        {message.created_at && <p className="mt-2 text-[11px] text-ink-soft">{formatTime(message.created_at)}</p>}
      </div>
    </div>
  );
}
