"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useStickToBottom } from "@/lib/use-stick-to-bottom";
import {
  ArrowDown,
  ArrowLeft,
  Compass,
  History,
  Info,
  Lightbulb,
  Map,
  Palette,
  Plus,
  Stethoscope,
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
  { text: "Help me figure out what I might enjoy doing.", icon: Lightbulb, tone: "bg-sun-soft text-sun" },
  { text: "I love science and art. What careers combine both?", icon: Palette, tone: "bg-pink-soft text-pink" },
  { text: "I want to become a doctor. Where should I start?", icon: Stethoscope, tone: "bg-teal-soft text-teal" },
  { text: "Can you build a career plan based on my profile?", icon: Map, tone: "bg-sky-soft text-sky" },
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
    <div className="pb-6 pt-6 sm:pt-10">
      <div className="rounded-[var(--radius-hero)] border border-line bg-primary-softer p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white shadow-[var(--shadow-card)] ring-2 ring-primary/15">
            <CounselorAvatar size="lg" />
          </span>
          <div>
            <p className="text-sm font-semibold text-primary">Your career counselor</p>
            <h1 className="font-display text-[1.6rem] font-semibold leading-tight text-ink sm:text-[2rem]">
              {name ? `Hi ${name}, let's talk careers.` : "Let's talk careers."}
            </h1>
          </div>
        </div>
        <p className="mt-4 max-w-lg leading-relaxed text-ink-muted">
          Talk through what you enjoy, a career you&apos;re curious about, or what to do next. I remember what you confirm.
        </p>

        <div className="mt-6 flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => onStart("exploring")}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-raised)] transition hover:brightness-110"
          >
            <Compass aria-hidden className="size-4" />
            I&apos;m still figuring it out
          </button>
          <button
            type="button"
            onClick={() => onStart("have_goal")}
            className="inline-flex items-center gap-2 rounded-full border border-pink/30 bg-white px-5 py-2.5 text-sm font-semibold text-pink transition hover:bg-pink-soft"
          >
            <Target aria-hidden className="size-4" />
            I have a career in mind
          </button>
        </div>
      </div>

      <p className="mt-8 text-sm font-semibold text-ink-muted">Or start with one of these</p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {EXAMPLES.map((example) => {
          const Icon = example.icon;

          return (
            <li key={example.text}>
              <button
                type="button"
                onClick={() => onExample(example.text)}
                className="flex h-full w-full items-start gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 text-left text-[15px] text-ink transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[var(--shadow-raised)]"
              >
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${example.tone}`}>
                  <Icon aria-hidden className="size-[18px]" />
                </span>
                {example.text}
              </button>
            </li>
          );
        })}
      </ul>
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
    <div className="flex flex-col">
      <div className="space-y-5 text-sm">
        {rows.length === 0 && confirmed.length === 0 && facts !== null && (
          <p className="text-ink-muted">Not much yet. As we talk, I&apos;ll ask before remembering anything.</p>
        )}
        {rows.length > 0 && (
          <dl className="space-y-2.5">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-semibold text-ink-soft">{label}</dt>
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
              <p className="text-xs font-semibold text-ink-soft">Things you confirmed</p>
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
        <Link href="/profile#memory" onClick={onClose} className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
          <UserRoundPen aria-hidden className="size-4" />
          Review or correct
        </Link>
      </div>
    </div>
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
  const { follow, jumpToLatest, showJump } = useStickToBottom(scrollRef);

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
  const [contextOpen, setContextOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

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

  // Follow the reply as it streams, unless the student scrolled up to reread.
  useLayoutEffect(() => {
    follow(messages[messages.length - 1]?.role === "user");
  }, [messages, sending, follow]);

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

  // Word-by-word reveal of the streaming reply.
  const reveal = useRef({ target: "", shown: 0, frame: 0 });

  function showDraft(text: string) {
    setMessages((current) => {
      const last = current[current.length - 1];

      if (!last?.metadata.streaming) {
        return current;
      }

      return [...current.slice(0, -1), { ...last, content: text }];
    });
  }

  function startReveal() {
    const state = reveal.current;

    if (state.frame) {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      state.shown = state.target.length;
      showDraft(state.target);
      return;
    }

    const tick = () => {
      const remaining = state.target.length - state.shown;

      if (remaining <= 0) {
        state.frame = 0;
        return;
      }

      // About 90 characters a second, faster when a lot is waiting.
      let next = Math.min(state.target.length, state.shown + Math.max(2, Math.ceil(remaining / 40)));
      // End on a word boundary so words appear whole.
      const space = state.target.indexOf(" ", next);
      next = space === -1 || space - next > 12 ? next : space + 1;
      state.shown = Math.min(next, state.target.length);
      showDraft(state.target.slice(0, state.shown));
      state.frame = window.requestAnimationFrame(tick);
    };

    state.frame = window.requestAnimationFrame(tick);
  }

  function revealDone(): Promise<void> {
    const state = reveal.current;
    const started = Date.now();

    return new Promise((resolve) => {
      const check = () => {
        if (state.shown >= state.target.length || Date.now() - started > 6000) {
          resolve();
        } else {
          window.setTimeout(check, 50);
        }
      };

      check();
    });
  }

  function stopReveal() {
    window.cancelAnimationFrame(reveal.current.frame);
    reveal.current = { target: "", shown: 0, frame: 0 };
  }

  useEffect(() => () => window.cancelAnimationFrame(reveal.current.frame), []);

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

    follow(true);
    stopReveal();
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
            // Text is revealed at a steady pace by the reveal loop, even
            // when the network delivers it in one burst.
            reveal.current.target += event.text;
            startReveal();
          }
        }
      );

      // Let the visible text catch up before the saved reply replaces it.
      await revealDone();
      setMessages((current) => [...withoutDraft(current), result.assistant_message]);

      // "Open the quiz": take them there once the reply is on screen.
      if (result.assistant_message.metadata.navigate) {
        const target = result.assistant_message.metadata.navigate;
        window.setTimeout(() => router.push(target), 900);
      }

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
      stopReveal();
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
      // The counselor does these itself, right here in the chat.
      case "build_plan":
      case "career_roadmap":
        void send("Build My Path for me");
        break;
      case "explore_careers":
        void send("Which careers fit me? Show me a few.");
        break;
      case "upload_document":
        setUploadOpen(true);
        break;
      case "update_profile":
        void send("I'd like to update my profile.");
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
      <section className="relative flex min-w-0 flex-1 flex-col">
        <header className="relative flex h-14 shrink-0 items-center gap-1 border-b border-line bg-white px-2 sm:px-4">
          <Link
            href="/"
            aria-label="Back to Home"
            className="flex size-10 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2 lg:hidden"
          >
            <ArrowLeft aria-hidden className="size-5" />
          </Link>
          <IconButton label="Conversations" onClick={() => setHistoryOpen(true)}>
            <History aria-hidden className="size-5" />
          </IconButton>
          <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
            <span className="flex size-8 -rotate-6 items-center justify-center rounded-xl border-2 border-black/5 bg-sunny">
              <CounselorAvatar size="sm" />
            </span>
            <p className="truncate text-[15px] font-semibold text-ink">{title || "Counselor"}</p>
          </div>
          <IconButton label="What the counselor knows about you" onClick={() => setContextOpen(true)}>
            <Info aria-hidden className="size-[18px]" />
          </IconButton>
          <IconButton label="New conversation" onClick={newConversation}>
            <Plus aria-hidden className="size-5" />
          </IconButton>
        </header>

        <div
          ref={scrollRef}
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-y-auto outline-none bg-[radial-gradient(circle_at_1px_1px,var(--color-line)_1px,transparent_0)] [background-size:22px_22px]"
        >
          <div className="mx-auto w-full max-w-[860px] px-3 py-6 sm:px-6">
            {loading && (
              <div className="space-y-6" role="status" aria-label="Loading conversation">
                <Skeleton className="ml-auto h-10 w-2/3 rounded-2xl" />
                <div className="flex gap-3">
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

            <div className="space-y-5">
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
                  <span className="hidden size-9 shrink-0 items-center justify-center rounded-full bg-white shadow-[var(--shadow-card)] ring-2 ring-primary/15 sm:flex">
                    <CounselorAvatar />
                  </span>
                  <div className="flex items-center gap-3 rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-3 shadow-[var(--shadow-card)]">
                    <ThinkingDots />
                    <span className="text-sm text-ink-muted">{pendingLabel || "Reading your transcript, resume and quiz…"}</span>
                    <span className="sr-only">Your counselor is writing</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {showJump && (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute bottom-32 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-semibold text-ink shadow-[var(--shadow-raised)]"
          >
            <ArrowDown aria-hidden className="size-4" /> Latest
          </button>
        )}

        <div className="shrink-0 border-t border-line bg-white px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-6">
          <div className="mx-auto w-full max-w-[860px]">
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

      <Dialog open={contextOpen} onClose={() => setContextOpen(false)} title="What I know about you" side="right">
        {contextOpen && <ContextPanel onClose={() => setContextOpen(false)} />}
      </Dialog>

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
