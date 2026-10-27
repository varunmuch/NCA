import type { Metadata } from "next";

import { AcademicRecord } from "@/components/profile/AcademicRecord";
import { EarlierAnswers } from "@/components/profile/EarlierAnswers";
import { MemoryReview } from "@/components/profile/MemoryReview";
import { ProfileEditor } from "@/components/profile/ProfileEditor";
import { PageHeader } from "@/components/ui/Card";

export const metadata: Metadata = { title: "My Profile" };

export default function ProfilePage() {
  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="My Profile"
        title="Your grades, resume and interests"
        description="This is what decides your major, colleges and scholarships. Your counselor, quiz and plan all read it first. Only you can see it."
      />
      <AcademicRecord />
      <ProfileEditor />
      <MemoryReview />
      <EarlierAnswers />
    </div>
  );
}
