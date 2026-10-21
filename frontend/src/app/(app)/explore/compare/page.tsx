import type { Metadata } from "next";

import { CompareCareers } from "@/components/careers/CompareCareers";
import { fetchAsStudent } from "@/lib/student-session";
import type { CareerDetail } from "@/types/cie";

export const metadata: Metadata = { title: "Compare Careers" };

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c = "" } = await searchParams;
  const slugs = c.split(",").map((slug) => slug.trim()).filter(Boolean).slice(0, 3);

  const data = slugs.length
    ? await fetchAsStudent<{ careers: CareerDetail[] }>(
        `/careers/compare?slugs=${slugs.map(encodeURIComponent).join(",")}`
      )
    : { careers: [] };

  return <CompareCareers careers={data.careers} />;
}
