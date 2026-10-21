import type { Metadata } from "next";
import Link from "next/link";
import { Brain, FileText, MessageCircle, ShieldCheck } from "lucide-react";

import { auth } from "@/auth";
import { Card, PageHeader } from "@/components/ui/Card";
import { getStudent } from "@/lib/student-session";

export const metadata: Metadata = { title: "Settings" };

const DATA_LINKS = [
  {
    href: "/conversations",
    icon: MessageCircle,
    title: "Conversations",
    body: "Rename or permanently delete any chat.",
  },
  {
    href: "/profile#memory",
    icon: Brain,
    title: "What your counselor remembers",
    body: "Confirm, correct, or remove saved information.",
  },
  {
    href: "/documents",
    icon: FileText,
    title: "Documents",
    body: "View, download, or delete resumes and transcripts.",
  },
];

export default async function SettingsPage() {
  const session = await auth();
  const { me, email } = await getStudent();
  const provider = session?.user.provider === "google" ? "Google" : "Email and password";

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Settings" title="Account and privacy" />

      <Card className="p-6">
        <h2 className="text-lg font-bold">Account</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-ink-muted">Name</dt>
            <dd className="font-semibold">{me.profile.name || "Not set"}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-muted">Email</dt>
            <dd className="break-all font-semibold">{email}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-muted">Signed in with</dt>
            <dd className="font-semibold">{provider}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-ink-muted">
          Edit your name and details on{" "}
          <Link href="/profile" className="font-semibold text-primary hover:underline">
            My Profile
          </Link>
          .
        </p>
      </Card>

      <section aria-labelledby="your-data" className="space-y-4">
        <div>
          <h2 id="your-data" className="text-lg font-bold">
            Your information
          </h2>
          <p className="mt-1 text-sm text-ink-muted">You&apos;re in control of what Career Explorer keeps.</p>
        </div>
        <ul className="grid gap-3 md:grid-cols-3">
          {DATA_LINKS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-[var(--shadow-raised)]"
              >
                <item.icon aria-hidden className="size-5 text-primary" />
                <span className="mt-3 font-semibold text-ink">{item.title}</span>
                <span className="mt-1 text-sm text-ink-muted">{item.body}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Card className="flex gap-4 p-6">
        <ShieldCheck aria-hidden className="size-6 shrink-0 text-accent" />
        <div className="space-y-2 text-sm leading-relaxed text-ink-muted">
          <h2 className="text-base font-bold text-ink">How your information is used</h2>
          <p>
            Your counselor is an AI model that runs on NeoCity Academy&apos;s own server. Your chats and files are not sent to outside AI companies.
          </p>
          <p>
            Only you can see your conversations, documents, and plans in this app. Deleting a conversation or document removes it right away. Deleting your whole account isn&apos;t available in the app yet.
          </p>
        </div>
      </Card>
    </div>
  );
}
