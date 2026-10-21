import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";

import { EarlierAnswers } from "@/components/profile/EarlierAnswers";
import { MemoryReview } from "@/components/profile/MemoryReview";
import { ProfileEditor } from "@/components/profile/ProfileEditor";
import { PageHeader } from "@/components/ui/Card";

export const metadata: Metadata = { title: "My Profile" };

export default function ProfilePage() {
  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="My Profile"
        title="All about you"
        description="The more your counselor knows, the better its advice fits. Everything here is optional, and only you can see it."
        actions={
          <Link
            href="/documents"
            className="inline-flex h-11 items-center gap-2 rounded-full border border-line-strong bg-surface px-5 text-[15px] font-semibold text-ink hover:bg-surface-2"
          >
            <FileText aria-hidden className="size-4" /> My documents
          </Link>
        }
      />
      <ProfileEditor />
      <MemoryReview />
      <EarlierAnswers />
    </div>
  );
}
