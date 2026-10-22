import type { Metadata } from "next";

import { InterestQuiz } from "@/components/discover/InterestQuiz";

export const metadata: Metadata = { title: "Interest quiz" };

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;

  // With a career goal the quiz stays in that field; ?mode=general opens the all-careers quiz.
  return <InterestQuiz mode={mode === "general" ? "general" : undefined} />;
}
