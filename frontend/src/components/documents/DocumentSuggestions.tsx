"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Award, Check, CircleDashed, Lightbulb, RefreshCw, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/Card";
import { ErrorNotice, Skeleton } from "@/components/ui/Feedback";
import { api } from "@/lib/api";
import type { DocumentReview } from "@/types/cie";

type Ready = Extract<DocumentReview, { status: "ready" }>;

function Chip({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ${
        done ? "bg-accent-softer text-accent-ink" : "bg-surface-2 text-ink-muted"
      }`}
    >
      {done ? <Check aria-hidden className="size-3.5" /> : <CircleDashed aria-hidden className="size-3.5" />}
      {children}
    </li>
  );
}

function TranscriptReview({ review }: { review: Ready }) {
  const done = review.done ?? [];
  const underway = review.in_progress ?? [];

  return (
    <div className="space-y-5">
      {(done.length > 0 || underway.length > 0) && (
        <div>
          <h4 className="text-sm font-semibold text-ink-muted">Already on your transcript</h4>
          <ul className="mt-2 flex flex-wrap gap-2">
            {done.map((item) => (
              <Chip key={item.course} done>
                {item.course}
              </Chip>
            ))}
            {underway.map((item) => (
              <Chip key={item.course} done={false}>
                {item.course} (in progress)
              </Chip>
            ))}
          </ul>
        </div>
      )}

      {(review.next_courses ?? []).length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-ink-muted">Take next</h4>
          <ol className="mt-2 space-y-2.5">
            {review.next_courses!.map((item, index) => (
              <li key={item.course} className="flex gap-3 rounded-2xl border border-line p-3.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary">{index + 1}</span>
                <div>
                  <p className="font-semibold text-ink">
                    {item.course} <Badge>{item.kind}</Badge>
                  </p>
                  {item.why && <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{item.why}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {(review.tips ?? []).length > 0 && (
        <ul className="space-y-1.5">
          {review.tips!.map((tip) => (
            <li key={tip} className="flex gap-2 text-sm text-ink">
              <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
              {tip}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ResumeReview({ review }: { review: Ready }) {
  return (
    <div className="space-y-5">
      {((review.strengths ?? []).length > 0 || (review.gaps ?? []).length > 0) && (
        <div>
          <h4 className="text-sm font-semibold text-ink-muted">Skills this career uses</h4>
          <ul className="mt-2 flex flex-wrap gap-2">
            {(review.strengths ?? []).map((item) => (
              <Chip key={item.skill} done>
                {item.skill}
              </Chip>
            ))}
            {(review.gaps ?? []).slice(0, 6).map((skill) => (
              <Chip key={skill} done={false}>
                {skill}
              </Chip>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-ink-muted">Checked: shown on your resume. Dashed: not shown yet.</p>
        </div>
      )}

      {(review.suggestions ?? []).length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-ink-muted">Ways to make it stronger</h4>
          <ol className="mt-2 space-y-2">
            {review.suggestions!.map((item, index) => (
              <li key={item} className="flex gap-3 text-[15px] text-ink">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary">{index + 1}</span>
                {item}
              </li>
            ))}
          </ol>
        </div>
      )}

      {(review.certifications ?? []).length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-ink-muted">Certifications to work toward</h4>
          <ul className="mt-2 space-y-2">
            {review.certifications!.map((cert) => (
              <li key={cert.name} className="flex gap-3 rounded-2xl border border-line p-3.5">
                <Award aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
                <div>
                  <p className="font-semibold text-ink">
                    {cert.url ? (
                      <a href={cert.url} target="_blank" rel="noreferrer" className="hover:underline">
                        {cert.name}
                      </a>
                    ) : (
                      cert.name
                    )}
                  </p>
                  <p className="text-xs text-ink-muted">From {cert.organization}</p>
                  {cert.why && <p className="mt-1 text-sm text-ink-muted">{cert.why}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Suggestions from a transcript or resume, aimed at the student's goal.
 * The comparison is done by code against official course and skill lists;
 * the counselor explains it.
 */
export function DocumentSuggestions({ documentId }: { documentId: number }) {
  const [review, setReview] = useState<DocumentReview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  async function load(refresh = false) {
    setBusy(true);
    setError("");

    try {
      setReview(await api.reviewDocument(documentId, refresh));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Suggestions couldn't be made just now.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;

    api
      .reviewDocument(documentId)
      .then((data) => active && setReview(data))
      .catch((caught) => active && setError(caught instanceof Error ? caught.message : "Suggestions couldn't be made just now."))
      .finally(() => active && setBusy(false));

    return () => {
      active = false;
    };
  }, [documentId]);

  return (
    <section aria-labelledby={`suggest-${documentId}`} className="rounded-2xl border border-primary/25 bg-primary-softer/60 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles aria-hidden className="size-4 text-primary" />
          <h3 id={`suggest-${documentId}`} className="font-bold text-ink">
            {review?.status === "ready" ? `Suggestions for becoming: ${review.goal_title}` : "Suggestions for your goal"}
          </h3>
        </div>
        {review?.status === "ready" && !busy && (
          <button
            type="button"
            onClick={() => load(true)}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-ink-muted hover:bg-surface hover:text-ink"
          >
            <RefreshCw aria-hidden className="size-3.5" /> Refresh
          </button>
        )}
      </div>

      <div className="mt-3">
        {busy && (
          <div className="space-y-2.5" role="status" aria-label="Reading your document">
            <p className="text-sm text-ink-muted">Comparing this document with what your goal career needs…</p>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}
        {!busy && error && <ErrorNotice message={error} onRetry={() => load()} />}
        {!busy && review && review.status !== "ready" && (
          <div className="text-sm text-ink">
            <p>{review.message}</p>
            {review.status === "needs_goal" && (
              <div className="mt-2 flex flex-wrap gap-3">
                <Link href="/explore" className="font-semibold text-primary hover:underline">
                  Find a career
                </Link>
                <Link href="/discover?mode=general" className="font-semibold text-primary hover:underline">
                  Take the interest quiz
                </Link>
              </div>
            )}
          </div>
        )}
        {!busy && review?.status === "ready" && (
          <div className="space-y-5">
            {review.goal_source === "quiz" && (
              <p className="text-xs text-ink-muted">
                Based on your top quiz match. Set a career goal to aim these suggestions at it.
              </p>
            )}
            {review.summary && <p className="leading-relaxed text-ink">{review.summary}</p>}
            {review.doc_type === "transcript" ? <TranscriptReview review={review} /> : <ResumeReview review={review} />}
          </div>
        )}
      </div>
    </section>
  );
}
