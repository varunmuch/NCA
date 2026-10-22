import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CareerDetailView } from "@/components/careers/CareerDetailView";
import { identityFromSession, studentFetch } from "@/lib/cie-server";
import { auth } from "@/auth";
import type { CareerDetail } from "@/types/cie";

async function loadCareer(slug: string): Promise<CareerDetail | null> {
  const identity = identityFromSession(await auth());

  if (!identity) {
    return null;
  }

  const response = await studentFetch(identity, `/careers/${encodeURIComponent(slug)}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error("We couldn't load this career. Please try again.");
  }

  return (await response.json()) as CareerDetail;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const career = await loadCareer(slug);

  return { title: career?.title ?? "Career" };
}

export default async function CareerPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ build?: string }>;
}) {
  const { slug } = await params;
  const { build } = await searchParams;
  const career = await loadCareer(slug);

  if (!career) {
    notFound();
  }

  // ?build=roadmap comes from the counselor's "Build my roadmap" button.
  return <CareerDetailView career={career} autoBuildRoadmap={build === "roadmap"} />;
}
