"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, Maximize2, Plus, SendHorizontal, X } from "lucide-react";

import { useStickToBottom } from "@/lib/use-stick-to-bottom";

import { ThinkingDots } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { ASK_EVENT } from "@/lib/counselor-events";
import type { ChatMessage, CounselorAction } from "@/types/cie";

import { ACTION_META, CounselorAvatar, MessageBubble } from "./MessageBubble";

const STORAGE_KEY = "cie.widget.conversation";
const GREETED_KEY = "cie.knight.greeted";

/** Starters that fit the page the student is on. */
function starters(pathname: string): string[] {
  if (pathname.startsWith("/plan/")) {
    return ["Why are these colleges in my plan?", "Swap a college for a cheaper one", "Add more AP classes to my plan"];
  }

  if (pathname.startsWith("/plan")) {
    return ["Build My Path for me", "What should my plan focus on?"];
  }

  if (pathname.startsWith("/profile")) {
    return ["What's missing from my profile?", "What do my grades say about me?", "I have more volunteer hours to add"];
  }

  if (pathname.startsWith("/discover")) {
    return ["Explain my interest type", "Why this major and minor?", "Suggest different majors"];
  }

  if (pathname.startsWith("/explore/")) {
    return ["Is this a good fit for me?", "Save this career", "Make this my goal and build My Path"];
  }

  if (pathname.startsWith("/explore")) {
    return ["Which careers fit me?", "Show me careers with good pay near Orlando"];
  }

  return ["What should I do next?", "Which colleges should I look at?", "How am I doing on Bright Futures?"];
}

function pageLabel(pathname: string): string {
  if (pathname === "/") return "Home";
  if (pathname.startsWith("/plan")) return "My Path";
  if (pathname.startsWith("/profile")) return "My Profile";
  if (pathname.startsWith("/discover")) return "Interest Quiz";
  if (pathname.startsWith("/explore/")) return "this career";
  if (pathname.startsWith("/explore")) return "Explore";
  return "this page";
}

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string | null) {
  try {
    if (id) {
      window.localStorage.setItem(STORAGE_KEY, id);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage can be unavailable; the chat still works for this visit.
  }
}

/**
 * The counselor on every page: a floating button that opens a small chat.
 * It knows the page it's on, acts for the student, and refreshes the page
 * when it changes something, so the student never has to go elsewhere.
 */
export function CounselorWidget() {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [watching, setWatching] = useState(false);
  const [hello, setHello] = useState<{ message: string; action_label: string; action_prompt: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Pick up the last widget conversation when it opens.
  function toggle() {
    const next = !open;
    setOpen(next);
    setHello(null);

    if (!next || conversationId) {
      return;
    }

    const stored = readStored();

    if (stored) {
      setConversationId(stored);
      api
        .conversation(stored)
        .then((data) => setMessages(data.messages.slice(-20)))
        .catch(() => {
          writeStored(null);
          setConversationId(null);
        });
    }
  }

  // The knight says hello once per visit, with something written for this student.
  useEffect(() => {
    // Not over the chat, and not over the quiz's buttons.
    if (window.location.pathname.startsWith("/counselor") || window.location.pathname.startsWith("/discover")) {
      return;
    }

    try {
      if (window.sessionStorage.getItem(GREETED_KEY)) {
        return;
      }

      window.sessionStorage.setItem(GREETED_KEY, "1");
    } catch {
      // Without storage it simply greets on each page load.
    }

    let hide: number | undefined;

    api
      .greeting()
      .then((data) => {
        setHello(data);
        // Phones have less room, so the hello steps aside sooner.
        hide = window.setTimeout(() => setHello(null), window.innerWidth < 640 ? 15_000 : 30_000);
      })
      .catch(() => undefined);

    return () => window.clearTimeout(hide);
  }, []);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Follow the reply as it streams, unless the student scrolled up to reread.
  const { follow, jumpToLatest, showJump } = useStickToBottom(scrollRef, open);

  useLayoutEffect(() => {
    follow(messages[messages.length - 1]?.role === "user");
  }, [messages, sending, open, follow]);

  // When the counselor starts a background job, refresh the page once it's done.
  useEffect(() => {
    if (!watching) {
      return;
    }

    let cancelled = false;
    let timer: number | undefined;

    const check = () =>
      api
        .agentActivity()
        .then((data) => {
          if (cancelled) {
            return;
          }

          if (data.running) {
            timer = window.setTimeout(check, 4000);
          } else {
            setWatching(false);
            router.refresh();
            toast(data.items[0]?.title ? `${data.items[0].title}.` : "Done.");
          }
        })
        .catch(() => setWatching(false));

    timer = window.setTimeout(check, 4000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [watching, router, toast]);

  const send = useCallback(
    async (value: string, action?: CounselorAction) => {
      const message = value.trim();

      if (!message || sending) {
        return;
      }

      setText("");
      setSending(true);
      setMessages((current) => [
        ...current.filter((item) => !item.metadata.error),
        { id: null, role: "user", content: message, metadata: action ? { action } : {}, created_at: null },
      ]);

      try {
        const result = await api.streamMessage({ conversation_id: conversationId, text: message, action: action ?? null, page: pathname }, (event) => {
          if (event.event === "start") {
            setConversationId(event.conversation_id);
            writeStored(event.conversation_id);
            setMessages((current) => [
              ...current.slice(0, -1),
              event.user_message,
              { id: null, role: "assistant", content: "", metadata: { streaming: true }, created_at: null },
            ]);
          } else if (event.event === "delta") {
            setMessages((current) => {
              const last = current[current.length - 1];
              return last?.metadata.streaming ? [...current.slice(0, -1), { ...last, content: last.content + event.text }] : current;
            });
          }
        });

        setMessages((current) => [...current.filter((item) => !item.metadata.streaming), result.assistant_message]);

        const metadata = result.assistant_message.metadata;

        // "Open the quiz": go there; the chat stays open beside it.
        if (metadata.navigate) {
          router.push(metadata.navigate);
        }
        const changed = (metadata.record_updates?.length ?? 0) > 0 || (metadata.agent_actions?.length ?? 0) > 0;

        // The page underneath shows the change right away.
        if (changed) {
          router.refresh();
        }

        if (metadata.agent_actions?.some((item) => item.running)) {
          setWatching(true);
        }
      } catch (error) {
        setMessages((current) => [
          ...current.filter((item) => !item.metadata.streaming),
          { id: null, role: "assistant", content: "", metadata: { error: true }, created_at: null },
        ]);
        toast(error instanceof Error ? error.message : "The counselor couldn't answer just now.", "error");
      } finally {
        setSending(false);
      }
    },
    [conversationId, pathname, router, sending, toast]
  );

  // Any page can hand the counselor a question ("Ask about this class").
  const sendRef = useRef(send);

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  useEffect(() => {
    const listener = (event: Event) => {
      const question = (event as CustomEvent<string>).detail;
      setOpen(true);

      if (question) {
        void sendRef.current(question);
      }
    };

    window.addEventListener(ASK_EVENT, listener);
    return () => window.removeEventListener(ASK_EVENT, listener);
  }, []);

  function onAction(action: CounselorAction) {
    if (action === "build_plan" || action === "career_roadmap") {
      void send("Build My Path for me");
    } else if (action === "explore_careers") {
      void send("Which careers fit me? Show me a few.");
    } else if (action === "update_profile") {
      void send("I'd like to update my profile.");
    } else if (action === "upload_document") {
      router.push("/profile#documents");
    } else {
      void send(ACTION_META[action].prompt ?? ACTION_META[action].label, action);
    }
  }

  // The AI Counselor page is the full chat; no bubble there.
  if (pathname.startsWith("/counselor")) {
    return null;
  }

  const empty = messages.length === 0;

  return (
    <div className="no-print">
      {open && (
        <section
          aria-label="Chat with your counselor"
          className="fixed inset-x-0 bottom-0 top-14 z-50 flex flex-col overflow-hidden border-2 border-black/5 bg-white sm:shadow-[var(--shadow-raised)] animate-[var(--animate-fade-up)] sm:inset-auto sm:bottom-24 sm:right-6 sm:top-auto sm:h-[min(620px,calc(100dvh-8rem))] sm:w-[400px] sm:rounded-[1.5rem] lg:right-8"
        >
          <header className="relative flex items-center gap-3 border-b border-line bg-white px-4 py-3 text-ink">
            <span className="flex size-10 -rotate-6 items-center justify-center rounded-xl border-2 border-black/5 bg-sunny">
              <CounselorAvatar />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-tight">Your counselor</p>
              <p className="truncate text-xs text-ink-muted">Looking at {pageLabel(pathname)} with you</p>
            </div>
            <button
              type="button"
              aria-label="New conversation"
              title="New conversation"
              onClick={() => {
                writeStored(null);
                setConversationId(null);
                setMessages([]);
              }}
              className="flex size-9 items-center justify-center rounded-full hover:bg-surface-2"
            >
              <Plus aria-hidden className="size-4" />
            </button>
            {conversationId && (
              <Link
                href={`/counselor/${conversationId}`}
                aria-label="Open in the full counselor"
                title="Open in the full counselor"
                className="flex size-9 items-center justify-center rounded-full hover:bg-surface-2"
              >
                <Maximize2 aria-hidden className="size-4" />
              </Link>
            )}
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="flex size-9 items-center justify-center rounded-full hover:bg-surface-2"
            >
              <X aria-hidden className="size-5" />
            </button>
          </header>

          <div ref={scrollRef} tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none bg-[radial-gradient(circle_at_1px_1px,var(--color-line)_1px,transparent_0)] px-3 py-4 [background-size:20px_20px]">
            {empty ? (
              <div className="px-1">
                <p className="text-[15px] leading-relaxed text-ink">
                  Hi! I can explain anything here, or change it for you: your plan, colleges, classes, profile and checklist. What would you like?
                </p>
                <div className="mt-4 flex flex-col items-start gap-2">
                  {starters(pathname).map((starter) => (
                    <button
                      key={starter}
                      type="button"
                      onClick={() => void send(starter)}
                      className="rounded-2xl border border-primary/20 bg-primary-softer px-3.5 py-2 text-left text-sm font-medium text-primary-ink hover:border-primary/40 hover:bg-primary-soft"
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <MessageBubble
                    key={message.id ?? `w-${index}`}
                    message={message}
                    isLast={index === messages.length - 1}
                    onQuickReply={(value) => void send(value)}
                    onAction={onAction}
                    onRetry={() => {
                      const lastUser = [...messages].reverse().find((item) => item.role === "user");

                      if (lastUser) {
                        setMessages((current) => current.filter((item) => !item.metadata.error && item !== lastUser));
                        void send(lastUser.content);
                      }
                    }}
                    disabled={sending}
                    compact
                  />
                ))}
                {sending && !messages.some((message) => message.metadata.streaming && message.content) && (
                  <div className="flex items-center gap-2 px-1 text-sm text-ink-muted" aria-live="polite">
                    <ThinkingDots /> Reading your records…
                  </div>
                )}
              </div>
            )}
          </div>

          {showJump && (
            <button
              type="button"
              onClick={jumpToLatest}
              className="absolute bottom-24 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink shadow-[var(--shadow-raised)]"
            >
              <ArrowDown aria-hidden className="size-3.5" /> Latest
            </button>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send(text);
            }}
            className="flex items-end gap-2 border-t border-line bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
          >
            <label htmlFor="widget-composer" className="sr-only">
              Message your counselor
            </label>
            <textarea
              id="widget-composer"
              ref={inputRef}
              rows={1}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void send(text);
                }
              }}
              placeholder="Ask or tell me to change something…"
              maxLength={4000}
              className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl border border-line-strong bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-soft focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              disabled={sending || !text.trim()}
              aria-label="Send"
              className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-black/5 bg-primary text-white disabled:border-line-strong disabled:bg-surface-3 disabled:text-ink-soft"
            >
              <SendHorizontal aria-hidden className="size-5" />
            </button>
          </form>
        </section>
      )}

      {hello && !open && (
        <div
          role="status"
          className="fixed bottom-[calc(10rem+env(safe-area-inset-bottom))] right-4 z-50 w-[min(290px,calc(100vw-2rem))] animate-[var(--animate-fade-up)] rounded-2xl rounded-br-sm border-2 border-black/5 bg-white p-3.5 shadow-[var(--shadow-raised)] lg:bottom-28 lg:right-8"
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setHello(null)}
            className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full text-ink-soft hover:bg-surface-2 hover:text-ink"
          >
            <X aria-hidden className="size-4" />
          </button>
          <p className="pr-6 text-sm leading-snug text-ink">{hello.message}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {hello.action_label && hello.action_prompt && (
              <button
                type="button"
                onClick={() => {
                  const prompt = hello.action_prompt;
                  setHello(null);
                  setOpen(true);
                  void send(prompt);
                }}
                className="press rounded-full border-2 border-black/5 bg-sunny px-3 py-1 text-xs font-bold text-ink shadow-[var(--shadow-raised)]"
              >
                {hello.action_label}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setHello(null);
                toggle();
              }}
              className="rounded-full border-2 border-black/5 bg-white px-3 py-1 text-xs font-semibold text-ink hover:bg-sunny-soft"
            >
              Chat with me
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={open ? "Close the counselor" : "Chat with your counselor"}
        title={open ? "Close" : "Chat with your counselor"}
        className={`press wiggle fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-50 flex size-16 items-center justify-center rounded-full border-[3px] border-black/5 bg-sunny shadow-[var(--shadow-raised)] lg:bottom-8 lg:right-8 ${
          open ? "max-sm:hidden" : ""
        }`}
      >
        {open ? (
          <X aria-hidden className="size-6 text-ink" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/brand/neocity-knight-mark.png" alt="" className="relative size-11 object-contain" />
        )}
      </button>
    </div>
  );
}
