"use client";

import { useState } from "react";

import type { StudentProfile } from "@/types/cie";
import {
  getCurrentResume,
  getResumeDownloadUrl,
  type ResumeMetadata,
  uploadResume,
} from "@/lib/cie-api";

type ResumeUploadCardProps = {
  studentId: string;
  setProfile: (profile: StudentProfile) => void;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResumeUploadCard({
  studentId,
  setProfile,
}: ResumeUploadCardProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [resume, setResume] = useState<ResumeMetadata | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleUpload() {
    if (!selectedFile) {
      setStatus("Please choose a resume file first.");
      return;
    }

    setLoading(true);
    setStatus("");

    try {
      const data = await uploadResume(studentId, selectedFile);

      setProfile(data.profile);
      setResume(data.resume);
      setSelectedFile(null);
      setStatus(
        "Resume uploaded and profile updated. Review the fields before saving additional edits."
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Failed to upload resume."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadCurrentResume() {
    setLoading(true);
    setStatus("");

    try {
      const data = await getCurrentResume(studentId);

      if (data.status === "success" && data.resume) {
        setResume(data.resume);
        setStatus("Current saved resume loaded.");
      } else {
        setResume(null);
        setStatus("No saved resume found for this student.");
      }
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Failed to load current resume."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-3xl border border-teal-100 bg-gradient-to-br from-teal-50 via-white to-slate-50 p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">
            Resume Import
          </p>

          <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            Upload resume to auto-fill profile
          </h3>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Supported formats: PDF, DOCX, and TXT. Uploading a new resume
            replaces the previous active resume and updates your profile fields.
          </p>
        </div>

        <button
          type="button"
          onClick={handleLoadCurrentResume}
          disabled={loading || !studentId}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Load Current Resume
        </button>
      </div>

      <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <input
          type="file"
          accept=".pdf,.docx,.txt"
          disabled={loading}
          onChange={(event) =>
            setSelectedFile(event.target.files?.[0] || null)
          }
          className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-2xl file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-800"
        />

        {selectedFile && (
          <p className="mt-3 text-sm text-slate-500">
            Selected: {selectedFile.name} ({formatBytes(selectedFile.size)})
          </p>
        )}

        <button
          type="button"
          onClick={handleUpload}
          disabled={loading || !selectedFile || !studentId}
          className="mt-4 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Processing resume..." : "Upload and Auto-Fill Profile"}
        </button>
      </div>

      {resume && (
        <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-950">
            Current Resume
          </p>

          <p className="mt-2 text-sm text-slate-600">
            {resume.original_filename} · {formatBytes(resume.size_bytes)}
          </p>

          <p className="mt-1 text-xs text-slate-400">
            SHA-256: {resume.sha256.slice(0, 16)}...
          </p>

          <a
            href={getResumeDownloadUrl(studentId)}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-block rounded-2xl border border-teal-100 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-100"
          >
            Download Current Resume
          </a>
        </div>
      )}

      {status && (
        <div className="mt-5 rounded-2xl border border-teal-100 bg-teal-50 p-4 text-sm text-teal-800 shadow-sm">
          {status}
        </div>
      )}
    </section>
  );
}
