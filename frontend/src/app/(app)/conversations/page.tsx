import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, Plus } from "lucide-react";

import { PageHeader } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Feedback";
import { timeAgo } from "@/lib/format";
import { fetchAsStudent } from "@/lib/student-session";
import type { ConversationSummary } from "@/types/cie";

export const metadata: Metadata = { title: "Conversations" };

export default async function ConversationsPage() {
  const { conversations } = await fetchAsStudent<{ conversations: ConversationSummary[] }>("/me/conversations");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Conversations"
        title="Your chats"
        description="Pick up any conversation where you left off. Your counselor remembers what you've confirmed across all of them."
        actions={
          <ButtonLink href="/counselor" icon={<Plus aria-hidden className="size-4" />}>
            New conversation
          </ButtonLink>
        }
      />
      {conversations.length === 0 ? (
        <EmptyState
          icon={<MessageCircle aria-hidden className="size-5" />}
          title="No conversations yet"
          description="Start one whenever you're ready. There's no wrong first question."
          action={<ButtonLink href="/counselor">Talk to my counselor</ButtonLink>}
        />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link href={`/counselor/${conversation.id}`} className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-surface-2/70">
                <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-softer text-primary">
                  <MessageCircle aria-hidden className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-semibold text-ink">{conversation.title}</span>
                    <span className="shrink-0 text-xs text-ink-soft">{timeAgo(conversation.updated_at)}</span>
                  </span>
                  {conversation.preview && <span className="mt-0.5 block truncate text-sm text-ink-muted">{conversation.preview}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
