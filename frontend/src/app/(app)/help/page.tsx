import type { Metadata } from "next";
import { HeartHandshake } from "lucide-react";

import { Card, PageHeader } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Help" };

const FAQ = [
  {
    q: "Is my counselor a real person?",
    a: "No. Your counselor is an AI. It can help you explore ideas and make plans, but it can make mistakes. For big decisions, like choosing classes, colleges, or programs, talk with your school counselor and a parent or guardian.",
  },
  {
    q: "What does my counselor remember?",
    a: "Your conversations are saved so you can pick up where you left off. When you mention something about yourself, like your grade or a favorite subject, your counselor asks before saving it. You can see, correct, or remove everything on My Profile.",
  },
  {
    q: "Why should I upload a resume or transcript?",
    a: "It's optional. If you share one, your counselor can connect advice to your actual classes and activities. You'll review what it found before it's treated as fact, and you can delete the file any time.",
  },
  {
    q: "Will my grades decide what careers I see?",
    a: "Grades matter, a lot. They're one of the biggest things colleges and scholarships like Bright Futures look at, so your counselor uses them to show which colleges are a reach, a match or likely, and what you'd need to get there. You'll still see every career that fits your interests, and if your grades in a subject are low for a goal, your counselor will tell you honestly and help you plan how to raise them or find another route in.",
  },
  {
    q: "Where does the career information come from?",
    a: "Career descriptions, tasks, skills, and education data come from O*NET, a free career database from the U.S. Department of Labor. We don't show salary or job-growth numbers. Ask your counselor or check O*NET OnLine for the latest.",
  },
  {
    q: "I don't know what I want to do. Is that okay?",
    a: "Absolutely. Most people don't know yet, and that's a great place to start. Take the Interest Quiz (about 8 minutes), or choose “I'm still figuring it out” in the counselor and you'll explore together.",
  },
  {
    q: "Can my school counselor see what I do here?",
    a: "Your school's counselors can see your profile, interest quiz results, career plan (including steps you check off), roadmaps, saved careers, and the names of files you upload, so they can help you. They can't see your chats with the AI counselor; those stay private to you.",
  },
  {
    q: "I forgot my password. What do I do?",
    a: "Choose “Forgot your password?” on the sign-in page and we'll email you a link. Confirm your email when we ask so the link can reach you.",
  },
];

export default function HelpPage() {
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Help" title="Questions and answers" />

      <div className="space-y-3">
        {FAQ.map((item) => (
          <details key={item.q} className="group rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]">
            <summary className="cursor-pointer list-none px-5 py-4 font-semibold text-ink marker:hidden">
              <span className="flex items-center justify-between gap-3">
                {item.q}
                <span aria-hidden className="text-xl leading-none text-ink-soft transition-transform group-open:rotate-45">
                  +
                </span>
              </span>
            </summary>
            <p className="px-5 pb-5 leading-relaxed text-ink-muted">{item.a}</p>
          </details>
        ))}
      </div>

      <Card className="flex gap-4 border-warm/30 bg-warm-soft/40 p-6">
        <HeartHandshake aria-hidden className="size-6 shrink-0 text-warm-ink" />
        <div className="text-sm leading-relaxed">
          <h2 className="text-base font-bold text-ink">Need to talk to someone now?</h2>
          <p className="mt-1 text-ink">
            If you&apos;re going through something hard, please reach out to a trusted adult, like a parent, teacher, or school counselor. In the U.S., you can call or text <strong>988</strong> (Suicide &amp; Crisis Lifeline) any time, day or night.
          </p>
        </div>
      </Card>
    </div>
  );
}
