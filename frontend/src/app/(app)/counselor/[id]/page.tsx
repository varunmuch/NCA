import type { Metadata } from "next";

import { CounselorWorkspace } from "@/components/counselor/CounselorWorkspace";

export const metadata: Metadata = { title: "AI Counselor" };

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <CounselorWorkspace key={id} conversationId={id} />;
}
