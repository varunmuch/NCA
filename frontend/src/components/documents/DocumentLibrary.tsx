"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CircleCheck,
  Download,
  Eye,
  FileText,
  GraduationCap,
  Loader2,
  RefreshCw,
  ScrollText,
  Trash2,
} from "lucide-react";

import { Badge, Card, PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { CardSkeleton, EmptyState, ErrorNotice, InlineNote, Skeleton } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { formatBytes, formatDate } from "@/lib/format";
import type { DocumentDetail, StudentDocument } from "@/types/cie";

import { DocumentUploader } from "./DocumentUploader";

function StatusBadge({ document }: { document: StudentDocument }) {
  if (document.status === "processing") {
    return (
      <Badge tone="primary">
        <Loader2 aria-hidden className="size-3 animate-spin" /> Reading…
      </Badge>
    );
  }

  if (document.status === "failed") {
    return (
      <Badge tone="warm">
        <AlertCircle aria-hidden className="size-3" /> Couldn&apos;t read
      </Badge>
    );
  }

  if (document.needs_processing) {
    return <Badge tone="sun">Not analyzed yet</Badge>;
  }

  return (
    <Badge tone="accent">
      <CircleCheck aria-hidden className="size-3" /> Ready
    </Badge>
  );
}

function ExtractionSummary({ detail }: { detail: DocumentDetail }) {
  const extraction = detail.extraction ?? {};
  const rows: [string, string[]][] = [];

  const list = (key: string) => (Array.isArray(extraction[key]) ? (extraction[key] as unknown[]) : []);

  if (detail.doc_type === "transcript") {
    const courses = list("courses_completed").map((course) => {
      const item = course as { name?: string; term?: string };
      return [item.name, item.term].filter(Boolean).join(" · ");
    });
    rows.push(["Courses completed", courses as string[]]);
    rows.push(["Courses in progress", list("courses_in_progress") as string[]]);
    rows.push(["Subject areas", list("subject_areas") as string[]]);
  } else {
    for (const [key, label] of [
      ["education", "Education"],
      ["activities", "Activities & clubs"],
      ["skills", "Skills"],
      ["projects", "Projects"],
      ["volunteering", "Volunteering"],
      ["awards", "Awards"],
      ["work_experience", "Experience"],
    ] as const) {
      rows.push([label, list(key) as string[]]);
    }
  }

  const filled = rows.filter(([, items]) => items.length);

  return (
    <div className="space-y-4">
      {typeof extraction.summary === "string" && extraction.summary && (
        <p className="leading-relaxed text-ink">{extraction.summary}</p>
      )}
      {detail.doc_type === "transcript" && typeof extraction.institution === "string" && extraction.institution && (
        <p className="text-sm text-ink-muted">
          {extraction.institution}
          {typeof extraction.grade_or_year === "string" && extraction.grade_or_year ? ` · Grade/year: ${extraction.grade_or_year}` : ""}
        </p>
      )}
      {filled.map(([label, items]) => (
        <div key={label}>
          <h4 className="text-xs font-semibold text-ink-muted">{label}</h4>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {items.map((item) => (
              <li key={item} className="rounded-full bg-surface-2 px-2.5 py-1 text-sm text-ink">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {detail.doc_type === "transcript" && (
        <p className="text-xs text-ink-muted">
          Grades are kept with the file and are never used to rule a career in or out.
        </p>
      )}
    </div>
  );
}

function DocumentDetailDialog({
  documentId,
  onClose,
}: {
  documentId: number | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const [loaded, setLoaded] = useState<{ id: number; detail: DocumentDetail | null; error: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Only show data that belongs to the document being viewed.
  const current = loaded?.id === documentId ? loaded : null;
  const detail = current?.detail ?? null;
  const error = current?.error ?? "";

  function setDetail(next: DocumentDetail) {
    setLoaded({ id: next.id, detail: next, error: "" });
  }

  useEffect(() => {
    if (documentId == null) {
      return;
    }

    api
      .document(documentId)
      .then((data) => setLoaded({ id: documentId, detail: data, error: "" }))
      .catch((caught) =>
        setLoaded({
          id: documentId,
          detail: null,
          error: caught instanceof Error ? caught.message : "Couldn't open this document.",
        })
      );
  }, [documentId]);

  const pending = detail?.facts.filter((fact) => fact.status === "suggested") ?? [];

  return (
    <Dialog open={documentId != null} onClose={onClose} title={detail?.original_filename ?? "Document"}>
      {error && <ErrorNotice message={error} />}
      {!detail && !error && (
        <div className="space-y-3" role="status" aria-label="Loading">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}
      {detail && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <a href={api.documentFileUrl(detail.id)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-full border border-line-strong px-3.5 text-sm font-semibold hover:bg-surface-2">
              <Eye aria-hidden className="size-4" /> Open file
            </a>
            <a href={api.documentFileUrl(detail.id, true)} className="inline-flex h-9 items-center gap-2 rounded-full border border-line-strong px-3.5 text-sm font-semibold hover:bg-surface-2">
              <Download aria-hidden className="size-4" /> Download
            </a>
          </div>

          {detail.status === "processed" && detail.extraction ? (
            <>
              <section>
                <h3 className="font-bold">What we found</h3>
                <div className="mt-3">
                  <ExtractionSummary detail={detail} />
                </div>
              </section>
              {pending.length > 0 && (
                <InlineNote>
                  <p>
                    {pending.length} item{pending.length === 1 ? "" : "s"} from this file {pending.length === 1 ? "is" : "are"} waiting for you to confirm.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="accent"
                      loading={confirming}
                      onClick={async () => {
                        setConfirming(true);

                        try {
                          await api.confirmFacts(pending.map((fact) => fact.id));
                          setDetail({ ...detail, facts: detail.facts.map((fact) => ({ ...fact, status: "confirmed" })) });
                          toast("Confirmed. Your counselor will treat these as facts.");
                        } catch (caught) {
                          toast(caught instanceof Error ? caught.message : "Couldn't confirm.", "error");
                        } finally {
                          setConfirming(false);
                        }
                      }}
                    >
                      Confirm all
                    </Button>
                    <Link href="/profile#memory" className="inline-flex h-9 items-center rounded-full px-3 text-sm font-semibold text-primary hover:underline">
                      Review one by one
                    </Link>
                  </div>
                </InlineNote>
              )}
            </>
          ) : detail.status === "processed" && detail.text_preview ? (
            <InlineNote>
              Your counselor can read this file, but we couldn&apos;t list its details automatically. Use “Try again” on the list to retry.
            </InlineNote>
          ) : detail.status === "failed" ? (
            <ErrorNotice message={detail.error_message || "We couldn't read this file."} />
          ) : detail.needs_processing ? (
            <InlineNote>This file was uploaded before your counselor could read documents. Use “Analyze” on the list to let your counselor use it.</InlineNote>
          ) : (
            <InlineNote>Your counselor is still reading this file.</InlineNote>
          )}

          {detail.text_preview && (
            <details className="rounded-2xl border border-line">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Text we read from the file</summary>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t border-line px-4 py-3 font-sans text-xs leading-relaxed text-ink-muted">
                {detail.text_preview}
              </pre>
            </details>
          )}
        </div>
      )}
    </Dialog>
  );
}

export function DocumentLibrary() {
  const toast = useToast();
  const params = useSearchParams();
  const [documents, setDocuments] = useState<StudentDocument[] | null>(null);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState<number | null>(() => {
    const value = Number(params.get("doc"));
    return Number.isFinite(value) && value > 0 ? value : null;
  });
  const [deleting, setDeleting] = useState<StudentDocument | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    return api
      .documents()
      .then((data) => {
        setDocuments(data.documents);
        setError("");
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Couldn't load your documents."));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while anything is being read.
  const processing = documents?.some((document) => document.status === "processing");

  useEffect(() => {
    if (!processing) {
      return;
    }

    const timer = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(timer);
  }, [processing, load]);

  async function reprocess(document: StudentDocument) {
    try {
      const updated = await api.reprocessDocument(document.id);
      setDocuments((current) => current?.map((item) => (item.id === updated.id ? updated : item)) ?? null);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Couldn't start reading this file.", "error");
    }
  }

  async function remove() {
    if (!deleting) {
      return;
    }

    setBusy(true);

    try {
      await api.deleteDocument(deleting.id);
      setDocuments((current) => current?.filter((item) => item.id !== deleting.id) ?? null);
      toast("Document deleted");
      setDeleting(null);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Couldn't delete this document.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="My Documents"
        title="Resumes and transcripts"
        description="Share your resume or transcript and your counselor can give advice that fits your actual classes and activities. This is optional."
      />

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="h-fit p-5 sm:p-6">
          <h2 className="text-lg font-bold">Upload a file</h2>
          <div className="mt-4">
            <DocumentUploader
              onUploaded={(document) => {
                setDocuments((current) => [document, ...(current ?? [])]);
                toast(`Uploaded ${document.original_filename}`);
              }}
            />
          </div>
        </Card>

        <section aria-labelledby="library-title">
          <h2 id="library-title" className="text-lg font-bold">
            Your files
          </h2>

          {error && <ErrorNotice className="mt-4" message={error} onRetry={load} />}
          {documents === null && !error && (
            <div className="mt-4 space-y-3">
              <CardSkeleton lines={2} />
              <CardSkeleton lines={2} />
            </div>
          )}

          {documents?.length === 0 && (
            <EmptyState
              className="mt-4"
              icon={<FileText aria-hidden className="size-5" />}
              title="No documents yet"
              description="Upload a resume or transcript whenever you like. You can explore and chat without one."
            />
          )}

          <ul className="mt-4 space-y-3">
            {documents?.map((document) => {
              const Icon = document.doc_type === "transcript" ? GraduationCap : ScrollText;

              return (
                <li key={document.id}>
                  <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-softer text-primary">
                      <Icon aria-hidden className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink">{document.original_filename}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                        <Badge>{document.doc_type === "transcript" ? "Transcript" : "Resume"}</Badge>
                        <StatusBadge document={document} />
                        <span>
                          {formatDate(document.uploaded_at)} · {formatBytes(document.size_bytes)}
                        </span>
                      </div>
                      {document.status === "failed" && document.error_message && (
                        <p className="mt-1.5 text-sm text-warm-ink">{document.error_message}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(document.status === "failed" || document.needs_processing || document.needs_details) && (
                        <Button size="sm" variant="soft" onClick={() => reprocess(document)} icon={<RefreshCw aria-hidden className="size-3.5" />}>
                          {document.needs_processing ? "Analyze" : "Try again"}
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => setViewing(document.id)} icon={<Eye aria-hidden className="size-3.5" />}>
                        View
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleting(document)} aria-label={`Delete ${document.original_filename}`}>
                        <Trash2 aria-hidden className="size-4" />
                      </Button>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <DocumentDetailDialog documentId={viewing} onClose={() => setViewing(null)} />

      <Dialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this document?"
        description="The file and the text read from it are removed right away. Things you already confirmed on your profile stay until you remove them."
      >
        <p className="font-semibold">{deleting?.original_filename}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={remove} loading={busy}>
            Delete
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
