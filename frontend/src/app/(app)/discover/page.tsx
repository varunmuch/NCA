import type { Metadata } from "next";

import { InterestQuiz } from "@/components/discover/InterestQuiz";

export const metadata: Metadata = { title: "Interest quiz" };

export default function DiscoverPage() {
  return <InterestQuiz />;
}
