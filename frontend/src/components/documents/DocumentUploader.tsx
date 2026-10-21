"use client";

import { useRef, useState, type DragEvent } from "react";
import { FileUp, GraduationCap, ScrollText } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { ErrorNotice } from "@/components/ui/Feedback";
import { formatBytes } from "@/lib/format";
import type { StudentDocument } from "@/types/cie";

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type DocType = "resume" | "transcript";

function validate(file: File): string {
  const name = file.name.toLowerCase();

  if (!name.endsWith(".pdf") && !name.endsWith(".docx")) {
    return "Please choose a PDF or Word (.docx) file.";
  }

  if (file.size > MAX_BYTES) {
    return `That file is ${formatBytes(file.size)}. Files can be up to 8 MB.`;
  }

  if (file.size === 0) {
    return "That file is empty.";
  }

  return "";
}

/**
 * Upload with real progress (fetch has no upload progress events).
 */
function uploadWithProgress(
  file: File,
  docType: DocType,
  onProgress: (percent: number) => void
): Promise<StudentDocument> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("doc_type", docType);

    const request = new XMLHttpRequest();
    request.open("POST", "/api/cie/me/documents");
    request.responseType = "json";

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve(request.response as StudentDocument);
      } else {
        const detail = (request.response as { detail?: unknown } | null)?.detail;
        reject(new Error(typeof detail === "string" ? detail : "We couldn't upload that file."));
      }
    };

    request.onerror = () => reject(new Error("The upload failed. Check your connection and try again."));
    request.send(form);
  });
}

export function DocumentUploader({
  onUploaded,
  defaultType = "resume",
  compact = false,
}: {
  onUploaded: (document: StudentDocument) => void;
  defaultType?: DocType;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<DocType>(defaultType);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");

  async function handle(file: File | undefined) {
    if (!file) {
      return;
    }

    const problem = validate(file);

    if (problem) {
      setError(problem);
      return;
    }

    setError("");
    setFileName(file.name);
    setProgress(0);

    try {
      const document = await uploadWithProgress(file, docType, setProgress);
      onUploaded(document);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't upload that file.");
    } finally {
      setProgress(null);
      setFileName("");

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void handle(event.dataTransfer.files?.[0]);
  }

  const uploading = progress !== null;

  return (
    <div>
      <fieldset>
        <legend className="text-sm font-semibold text-ink">What are you uploading?</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(
            [
              { value: "resume", label: "Resume", icon: ScrollText, hint: "Activities, skills, experience" },
              { value: "transcript", label: "Transcript", icon: GraduationCap, hint: "Courses and grades" },
            ] as const
          ).map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition-colors ${
                docType === option.value ? "border-primary bg-primary-softer" : "border-line bg-surface hover:border-primary/30"
              }`}
            >
              <input
                type="radio"
                name="doc-type"
                value={option.value}
                checked={docType === option.value}
                onChange={() => setDocType(option.value)}
                className="sr-only"
              />
              <option.icon aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
              <span>
                <span className="block text-sm font-bold text-ink">{option.label}</span>
                {!compact && <span className="block text-xs text-ink-muted">{option.hint}</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`mt-4 flex flex-col items-center justify-center rounded-[var(--radius-card)] border-2 border-dashed px-6 text-center transition-colors ${
          compact ? "py-6" : "py-10"
        } ${dragging ? "border-primary bg-primary-softer" : "border-line-strong bg-surface-2/50"}`}
      >
        {uploading ? (
          <div className="w-full max-w-xs" aria-live="polite">
            <p className="truncate text-sm font-semibold text-ink">Uploading {fileName}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-ink-muted">{progress}%</p>
          </div>
        ) : (
          <>
            <span className="flex size-12 items-center justify-center rounded-2xl bg-surface text-primary shadow-[var(--shadow-card)]">
              <FileUp aria-hidden className="size-6" />
            </span>
            <p className="mt-3 font-semibold text-ink">Drag and drop your file here</p>
            <p className="mt-1 text-sm text-ink-muted">PDF or Word (.docx), up to 8 MB</p>
            <Button variant="secondary" size="sm" className="mt-4" onClick={() => inputRef.current?.click()}>
              Choose a file
            </Button>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => void handle(event.target.files?.[0])}
        />
      </div>

      {error && <ErrorNotice className="mt-3" message={error} />}

      <p className="mt-3 text-xs leading-relaxed text-ink-muted">
        Only you and your counselor can see your files. Anything we pull out of them is shown to you to confirm before it&apos;s treated as fact, and you can delete a file at any time.
      </p>
    </div>
  );
}
