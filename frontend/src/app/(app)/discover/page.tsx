import type { Metadata } from "next";

import { InterestQuiz } from "@/components/discover/InterestQuiz";

export const metadata: Metadata = { title: "Interest quiz" };

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<{ retake?: string }> }) {
  const { retake } = await searchParams;

  // ?retake=1 comes from the counselor: start the quiz over.
  return <InterestQuiz retake={retake === "1"} />;
}
