import type { Metadata } from "next";

import { CounselorWorkspace } from "@/components/counselor/CounselorWorkspace";

export const metadata: Metadata = { title: "AI Counselor" };

export default async function CounselorPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; ask?: string }>;
}) {
  const { start, ask } = await searchParams;

  return <CounselorWorkspace key="new" conversationId={null} start={start} ask={ask?.slice(0, 500)} />;
}
