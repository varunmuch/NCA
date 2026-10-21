"use client";

import Link from "next/link";
import { useState } from "react";
import { History, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextInput } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Feedback";
import { parseDate, timeAgo } from "@/lib/format";
import type { ConversationSummary } from "@/types/cie";

function group(conversations: ConversationSummary[]) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const groups: { label: string; items: ConversationSummary[] }[] = [
    { label: "Today", items: [] },
    { label: "This week", items: [] },
    { label: "Earlier", items: [] },
  ];

  for (const conversation of conversations) {
    const updated = parseDate(conversation.updated_at)?.getTime() ?? 0;
    const age = now - updated;
    groups[age < day ? 0 : age < 7 * day ? 1 : 2].items.push(conversation);
  }

  return groups.filter((item) => item.items.length);
}

export function ConversationList({
  conversations,
  loading,
  activeId,
  onNew,
  onNavigate,
  onRename,
  onDelete,
}: {
  conversations: ConversationSummary[];
  loading: boolean;
  activeId: string | null;
  onNew: () => void;
  onNavigate?: () => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [renaming, setRenaming] = useState<ConversationSummary | null>(null);
  const [deleting, setDeleting] = useState<ConversationSummary | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <Button onClick={onNew} variant="secondary" className="w-full justify-start" icon={<Plus aria-hidden className="size-4" />}>
        New conversation
      </Button>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="space-y-3 px-2">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-ink-muted">
            <History aria-hidden className="mx-auto size-5 text-ink-soft" />
            <p className="mt-2">Your conversations will appear here.</p>
          </div>
        ) : (
          group(conversations).map((section) => (
            <div key={section.label} className="mb-4">
              <p className="px-3 pb-1 text-[11px] font-semibold text-ink-soft">
                {section.label}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((conversation) => {
                  const active = conversation.id === activeId;

                  return (
                    <li key={conversation.id} className="group relative">
                      <Link
                        href={`/counselor/${conversation.id}`}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={`block rounded-xl py-2 pl-3 pr-16 transition-colors ${
                          active ? "bg-primary-softer" : "hover:bg-surface-2"
                        }`}
                      >
                        <p className={`truncate text-sm ${active ? "font-semibold text-primary-ink" : "font-medium text-ink"}`}>
                          {conversation.title}
                        </p>
                        <p className="text-xs text-ink-soft">{timeAgo(conversation.updated_at)}</p>
                      </Link>
                      <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
                        <button
                          type="button"
                          aria-label={`Rename ${conversation.title}`}
                          onClick={() => {
                            setRenaming(conversation);
                            setTitle(conversation.title);
                          }}
                          className="rounded-lg p-1.5 text-ink-soft hover:bg-surface hover:text-ink"
                        >
                          <Pencil aria-hidden className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${conversation.title}`}
                          onClick={() => setDeleting(conversation)}
                          className="rounded-lg p-1.5 text-ink-soft hover:bg-surface hover:text-danger"
                        >
                          <Trash2 aria-hidden className="size-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>

      <Dialog open={Boolean(renaming)} onClose={() => setRenaming(null)} title="Rename conversation">
        <form
          onSubmit={async (event) => {
            event.preventDefault();

            if (!renaming || !title.trim()) {
              return;
            }

            setBusy(true);
            await onRename(renaming.id, title.trim());
            setBusy(false);
            setRenaming(null);
          }}
        >
          <label htmlFor="rename-title" className="sr-only">
            Title
          </label>
          <TextInput id="rename-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} autoFocus />
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Save
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this conversation?"
        description="This permanently removes the conversation and its messages. Things you saved to your profile stay."
      >
        <p className="font-semibold">{deleting?.title}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={async () => {
              if (!deleting) {
                return;
              }

              setBusy(true);
              await onDelete(deleting.id);
              setBusy(false);
              setDeleting(null);
            }}
          >
            Delete
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
