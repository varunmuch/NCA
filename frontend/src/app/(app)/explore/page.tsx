import type { Metadata } from "next";
import { Suspense } from "react";

import { ExploreCareers } from "@/components/careers/ExploreCareers";

export const metadata: Metadata = { title: "Explore Careers" };

export default function ExplorePage() {
  return (
    <Suspense>
      <ExploreCareers />
    </Suspense>
  );
}
