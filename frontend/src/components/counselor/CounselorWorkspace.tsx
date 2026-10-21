"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  Compass,
  History,
  Info,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightOpen,
  Plus,
  Target,
  UserRoundPen,
} from "lucide-react";

import { DocumentUploader } from "@/components/documents/DocumentUploader";
import { useStudent } from "@/components/layout/StudentContext";
import { IconButton } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ErrorNotice, Skeleton, ThinkingDots } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import type { ChatMessage, ConversationSummary, CounselorAction, StudentDocument, StudentFact } from "@/types/cie";

import { Composer, type ComposerHandle } from "./Composer";
import { ConversationList } from "./ConversationList";
import { ACTION_META, CounselorAvatar, MessageBubble } from "./MessageBubble";

const EXAMPLES = [
  "Help me figure out what I might enjoy doing.",
  "I love science and art. What careers combine both?",
  "I want to become a doctor. Where should I start?",
  "Can you build a career plan based on my profile?",
];

function nowIso() {
  return new Date().toISOString().replace("Z", "");
}

function Intro({
  name,
  onStart,
  onExample,
}: {
  name: string;
  onStart: (kind: "have_goal" | "exploring") => void;
  onExample: (text: string) => void;
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-1 pb-6 pt-6 text-center sm:pt-12 animate-[var(--animate-fade-up)]">
      <CounselorAvatar size="lg" />
      <h1 className="font-display mt-5 text-[2rem] font-semibold leading-tight sm:text-[2.5rem]">
        Hi{name ? ` ${name}` : ""}! I&apos;m your AI Career Counselor.
      </h1>
      <p className="mt-3 max-w-lg text-[17px] leading-relaxed text-ink-muted">
        I&apos;m here to help you understand your interests, explore careers, and make a plan that works for you.
      </p>

      <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onStart("have_goal")}
          className="group rounded-[var(--radius-card)] border border-line bg-surface p-5 text-left shadow-[var(--shadow-card)] transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[var(--shadow-raised)]"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Target aria-hidden className="size-5" />
          </span>
          <p className="mt-3 font-bold text-ink">I have a career in mind</p>
          <p className="mt-1 text-sm text-ink-muted">Let&apos;s figure out the steps to get there.</p>
        </button>
        <button
          type="button"
          onClick={() => onStart("exploring")}
          className="group rounded-[var(--radius-card)] border border-line bg-surface p-5 text-left shadow-[var(--shadow-card)] transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-[var(--shadow-raised)]"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
            <Compass aria-hidden className="size-5" />
          </span>
          <p className="mt-3 font-bold text-ink">I&apos;m still figuring it out</p>
          <p className="mt-1 text-sm text-ink-muted">Totally normal. Let&apos;s discover what fits you.</p>
        </button>
      </div>

      <p className="mt-8 text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">Or try asking</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onExample(example)}
            className="rounded-full border border-line bg-surface px-3.5 py-2 text-sm text-ink-muted transition-colors hover:border-primary/30 hover:bg-primary-softer hover:text-primary-ink"
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}

function ContextPanel({ onClose }: { onClose: () => void }) {
  const [facts, setFacts] = useState<StudentFact[] | null>(null);
  const { me } = useStudent();

  useEffect(() => {
    api
      .facts()
      .then((data) => setFacts(data.facts))
      .catch(() => setFacts([]));
  }, []);

  const confirmed = (facts ?? []).filter((fact) => fact.status === "confirmed");
  const pending = (facts ?? []).filter((fact) => fact.status === "suggested");
  const profile = me.profile;

  const rows: [string, string][] = [
    ["Grade", profile.grade_level],
    ["Favorite subjects", profile.favorite_subjects.join(", ")],
    ["Interests", profile.interests.join(", ")],
    ["Career goal", profile.career_aspiration],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <aside className="hidden w-80 shrink-0 flex-col border-l border-line bg-surface/60 xl:flex">
      <div className="flex h-16 items-center justify-between px-5">
        <p className="font-bold">What I know about you</p>
        <IconButton label="Close panel" onClick={onClose}>
          <PanelRightOpen aria-hidden className="size-[18px]" />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-6 text-sm">
        {rows.length === 0 && confirmed.length === 0 && facts !== null && (
          <p className="text-ink-muted">Not much yet. As we talk, I&apos;ll ask before remembering anything.</p>
        )}
        {rows.length > 0 && (
          <dl className="space-y-2.5">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">{label}</dt>
                <dd className="mt-0.5 text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {facts === null ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          confirmed.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">Things you confirmed</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {confirmed.slice(0, 18).map((fact) => (
                  <li key={fact.id} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-ink">
                    {fact.value}
                  </li>
                ))}
              </ul>
            </div>
          )
        )}
        {pending.length > 0 && (
          <div className="rounded-xl bg-accent-softer p-3 text-accent-ink">
            {pending.length} thing{pending.length === 1 ? "" : "s"} waiting for your review.
          </div>
        )}
        <Link href="/profile#memory" className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
          <UserRoundPen aria-hidden className="size-4" />
          Review or correct
        </Link>
      </div>
    </aside>
  );
}

export function CounselorWorkspace({
  conversationId: initialId,
  start,
  ask,
}: {
  conversationId: string | null;
  start?: string;
  ask?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const { me } = useStudent();
  const composerRef = useRef<ComposerHandle>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);

  const [conversationId, setConversationId] = useState<string | null>(initialId);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [title, setTitle] = useState("");
  const [isLegacy, setIsLegacy] = useState(false);
  const [loading, setLoading] = useState(Boolean(initialId));
  const [loadError, setLoadError] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingLabel, setPendingLabel] = useState("");
  const [modelAvailable, setModelAvailable] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [showJump, setShowJump] = useState(false);

  const name = me.display_name;
  const aspiration = me.profile.career_aspiration;

  const loadConversations = useCallback(() => {
    return api
      .conversations()
      .then((data) => setConversations(data.conversations))
      .catch(() => undefined) // The list is secondary; the chat still works.
      .finally(() => setListLoading(false));
  }, []);

  const fetchConversation = useCallback((id: string) => {
    return api
      .conversation(id)
      .then((data) => {
        setMessages(data.messages);
        setTitle(data.title);
        setIsLegacy(data.is_legacy);
        setLoadError("");
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "We couldn't open this conversation."))
      .finally(() => setLoading(false));
  }, []);

  function reloadConversation() {
    if (conversationId) {
      setLoading(true);
      setLoadError("");
      void fetchConversation(conversationId);
    }
  }

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (initialId) {
      void fetchConversation(initialId);
    }
  }, [initialId, fetchConversation]);

  // Prefill (never auto-send) when arriving from onboarding.
  useEffect(() => {
    if (initialId) {
      return;
    }

    if (ask) {
      composerRef.current?.setText(ask);
    } else if (start === "have_goal") {
      composerRef.current?.setText(
        aspiration ? `I want to become a ${aspiration}. Where should I start?` : "I have a career in mind: "
      );
    } else if (start === "exploring") {
      composerRef.current?.setText("I'm still figuring out what career I want. Can you help me explore?");
    }
  }, [start, ask, initialId, aspiration]);

  // Check the model on load; while it's down, check again every 30 seconds.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const check = () =>
      api
        .modelHealth()
        .then(({ available }) => {
          if (cancelled) {
            return;
          }

          setModelAvailable(available);

          if (!available) {
            timer = window.setTimeout(check, 30_000);
          }
        })
        .catch(() => undefined);

    void check();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  // Follow new messages only when the student is already at the bottom,
  // so scrolling back to reread is never interrupted.
  useLayoutEffect(() => {
    const element = scrollRef.current;

    if (!element) {
      return;
    }

    const last = messages[messages.length - 1];

    if (nearBottom.current || last?.role === "user") {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      element.scrollTo({ top: element.scrollHeight, behavior: reduce ? "auto" : "smooth" });
    }
  }, [messages, sending]);

  function onScroll() {
    const element = scrollRef.current;

    if (!element) {
      return;
    }

    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    nearBottom.current = distance < 120;
    setShowJump(distance > 400);
  }

  function adoptConversation(id: string, newTitle?: string) {
    if (!conversationId) {
      setConversationId(id);
      // Update the URL without remounting the chat.
      window.history.replaceState(null, "", `/counselor/${id}`);
    }

    if (newTitle) {
      setTitle(newTitle);
    }

    void loadConversations();
  }

  async function send(text: string, action?: CounselorAction) {
    if (sending) {
      return;
    }

    const optimistic: ChatMessage = {
      id: null,
      role: "user",
      content: text,
      metadata: action ? { action } : {},
      created_at: nowIso(),
    };

    nearBottom.current = true;
    setMessages((current) => [...current.filter((message) => !message.metadata.error), optimistic]);
    setSending(true);
    setPendingLabel(action ? `Building your ${ACTION_META[action].label.toLowerCase()}…` : "");

    const withoutDraft = (current: ChatMessage[]) => current.filter((message) => !message.metadata.streaming);

    try {
      const result = await api.streamMessage(
        { conversation_id: conversationId, text, action: action ?? null },
        (event) => {
          if (event.event === "start") {
            adoptConversation(event.conversation_id);
            // Swap the optimistic message for the saved one and open an
            // empty reply that fills in as text arrives.
            setMessages((current) => [
              ...current.slice(0, -1),
              event.user_message,
              { id: null, role: "assistant", content: "", metadata: { streaming: true }, created_at: null },
            ]);
          } else if (event.event === "delta") {
            setMessages((current) => {
              const last = current[current.length - 1];

              if (!last?.metadata.streaming) {
                return current;
              }

              return [...current.slice(0, -1), { ...last, content: last.content + event.text }];
            });
          }
        }
      );

      setMessages((current) => [...withoutDraft(current), result.assistant_message]);

      if (result.error) {
        toast(result.error, "error");
      } else {
        adoptConversation(result.conversation_id, result.conversation_title);
      }
    } catch (error) {
      setMessages((current) => [
        ...withoutDraft(current),
        { id: null, role: "assistant", content: "", metadata: { error: true }, created_at: null },
      ]);
      toast(error instanceof Error ? error.message : "The counselor couldn't answer just now.", "error");
    } finally {
      setSending(false);
      setPendingLabel("");
    }
  }

  async function retry() {
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    setMessages((current) => current.filter((message) => !message.metadata.error));

    if (!conversationId || lastUser?.id == null) {
      // The message never reached the server; send it again.
      if (lastUser) {
        setMessages((current) => current.filter((message) => message !== lastUser));
        await send(lastUser.content, lastUser.metadata.action);
      }

      return;
    }

    setSending(true);

    try {
      const result = await api.retryMessage(conversationId);
      setMessages((current) => [...current, result.assistant_message]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        { id: null, role: "assistant", content: "", metadata: { error: true }, created_at: null },
      ]);
      toast(error instanceof Error ? error.message : "Still having trouble. Please try again soon.", "error");
    } finally {
      setSending(false);
    }
  }

  function onAction(action: CounselorAction) {
    switch (action) {
      case "build_plan":
        router.push("/plan?generate=1");
        break;
      case "explore_careers":
        router.push("/explore");
        break;
      case "upload_document":
        setUploadOpen(true);
        break;
      case "update_profile":
        router.push("/profile");
        break;
      default:
        void send(ACTION_META[action].prompt ?? ACTION_META[action].label, action);
    }
  }

  function onStart(kind: "have_goal" | "exploring") {
    if (kind === "exploring") {
      void send("I'm still figuring out what career I want. Can you help me explore?");
    } else if (aspiration) {
      void send(`I have a career in mind: ${aspiration}. Where should I start?`);
    } else {
      composerRef.current?.setText("I have a career in mind: ");
    }
  }

  function newConversation() {
    setHistoryOpen(false);

    if (sending) {
      return;
    }

    setConversationId(null);
    setMessages([]);
    setTitle("");
    setIsLegacy(false);
    setLoadError("");

    if (window.location.pathname !== "/counselor") {
      window.history.pushState(null, "", "/counselor");
    }

    composerRef.current?.focus();
  }

  function onUploaded(document: StudentDocument) {
    setUploadOpen(false);
    toast(`Uploaded ${document.original_filename}. I'll be able to use it in about a minute.`);
    composerRef.current?.setText(
      document.doc_type === "transcript"
        ? "I just uploaded my transcript. Based on my courses, what careers could I explore?"
        : "I just uploaded my resume. What do my activities and skills suggest I could explore?"
    );
  }

  const historyList = (
    <ConversationList
      conversations={conversations}
      loading={listLoading}
      activeId={conversationId}
      onNew={newConversation}
      onNavigate={() => setHistoryOpen(false)}
      onRename={async (id, newTitle) => {
        try {
          await api.renameConversation(id, newTitle);
          if (id === conversationId) {
            setTitle(newTitle);
          }
          await loadConversations();
        } catch (error) {
          toast(error instanceof Error ? error.message : "Couldn't rename.", "error");
        }
      }}
      onDelete={async (id) => {
        try {
          await api.deleteConversation(id);
          toast("Conversation deleted");
          await loadConversations();
          if (id === conversationId) {
            newConversation();
          }
        } catch (error) {
          toast(error instanceof Error ? error.message : "Couldn't delete.", "error");
        }
      }}
    />
  );

  const empty = !loading && !loadError && messages.length === 0;

  return (
    <div className="flex h-dvh">
      {!historyCollapsed && (
        <aside className="hidden w-72 shrink-0 flex-col border-r border-line bg-surface/60 p-4 lg:flex">
          <div className="mb-3 flex items-center justify-between">
            <p className="px-1 text-sm font-bold">Conversations</p>
            <IconButton label="Hide conversations" onClick={() => setHistoryCollapsed(true)}>
              <PanelLeftClose aria-hidden className="size-[18px]" />
            </IconButton>
          </div>
          {historyList}
        </aside>
      )}

      <section className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line/70 bg-canvas/85 px-2 backdrop-blur-xl sm:h-16 sm:px-4">
          <Link
            href="/"
            aria-label="Back to Home"
            className="flex size-10 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2 lg:hidden"
          >
            <ArrowLeft aria-hidden className="size-5" />
          </Link>
          <IconButton label="Show conversations" onClick={() => setHistoryOpen(true)} className="lg:hidden">
            <History aria-hidden className="size-5" />
          </IconButton>
          {historyCollapsed && (
            <IconButton label="Show conversations" onClick={() => setHistoryCollapsed(false)} className="hidden lg:inline-flex">
              <PanelLeftOpen aria-hidden className="size-[18px]" />
            </IconButton>
          )}
          <div className="min-w-0 flex-1 px-1">
            <p className="truncate font-semibold text-ink">{title || "AI Career Counselor"}</p>
            <p className="hidden text-xs text-ink-muted sm:block">AI counselor · remembers what you confirm</p>
          </div>
          <IconButton label="What the counselor knows" onClick={() => setContextOpen((current) => !current)} className="hidden xl:inline-flex">
            <Info aria-hidden className="size-[18px]" />
          </IconButton>
          <IconButton label="New conversation" onClick={newConversation}>
            <Plus aria-hidden className="size-5" />
          </IconButton>
        </header>

        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
            {loading && (
              <div className="space-y-6" role="status" aria-label="Loading conversation">
                <Skeleton className="ml-auto h-10 w-2/3 rounded-2xl" />
                <div className="flex gap-3">
                  <Skeleton className="size-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
              </div>
            )}

            {loadError && (
              <ErrorNotice message={loadError} onRetry={reloadConversation} />
            )}

            {empty && (
              <Intro name={name} onStart={onStart} onExample={(text) => void send(text)} />
            )}

            {isLegacy && messages.length > 0 && (
              <p className="mb-6 rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-muted">
                These are your chats from the earlier version of Career Explorer. You can keep going here.
              </p>
            )}

            <div className="space-y-7">
              {messages.map((message, index) => (
                <MessageBubble
                  key={message.id ?? `local-${index}`}
                  message={message}
                  isLast={index === messages.length - 1}
                  onQuickReply={(text) => void send(text)}
                  onAction={onAction}
                  onRetry={() => void retry()}
                  disabled={sending}
                />
              ))}

              {sending && !messages.some((message) => message.metadata.streaming && message.content) && (
                <div className="flex items-center gap-3" aria-live="polite">
                  <CounselorAvatar />
                  <div className="flex items-center gap-3 px-1 py-3">
                    <ThinkingDots />
                    {pendingLabel ? (
                      <span className="text-sm text-ink-muted">{pendingLabel}</span>
                    ) : (
                      <span className="sr-only">Your counselor is writing</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {showJump && (
          <button
            type="button"
            onClick={() => {
              nearBottom.current = true;
              scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
            }}
            className="absolute bottom-32 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-semibold text-ink shadow-[var(--shadow-raised)]"
          >
            <ArrowDown aria-hidden className="size-4" /> Latest
          </button>
        )}

        <div className="shrink-0 bg-gradient-to-t from-canvas via-canvas to-canvas/0 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 sm:px-6">
          <div className="mx-auto w-full max-w-3xl">
            {!modelAvailable && (
              <p role="status" className="mb-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink">
                Your counselor is taking a short break. Try again in a few minutes. Everything else in Career Explorer still works.
              </p>
            )}
            <Composer
              ref={composerRef}
              onSend={(text) => void send(text)}
              onAttach={() => setUploadOpen(true)}
              disabled={sending || !modelAvailable}
            />
            <p className="mt-2 text-center text-[11px] leading-snug text-ink-soft">
              Your counselor is an AI and can make mistakes. Talk big decisions over with a school counselor or trusted adult.
            </p>
          </div>
        </div>
      </section>

      {contextOpen && <ContextPanel onClose={() => setContextOpen(false)} />}

      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} title="Conversations" side="left">
        {historyList}
      </Dialog>

      <Dialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Share a document"
        description="Your counselor can use your resume or transcript to personalize advice."
      >
        <DocumentUploader compact onUploaded={onUploaded} />
      </Dialog>
    </div>
  );
}
