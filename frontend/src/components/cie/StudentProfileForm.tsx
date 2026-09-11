"use client";

import { useState } from "react";

import type { StudentProfile } from "@/types/cie";
import {
  getStudentProfile,
  updateStudentProfile,
} from "@/lib/cie-api";

import { ResumeUploadCard } from "./ResumeUploadCard";

type StudentProfileFormProps = {
  studentId: string;
  setStudentId: (value: string) => void;
  profile: StudentProfile;
  setProfile: (profile: StudentProfile) => void;
  sendProfile: boolean;
  setSendProfile: (value: boolean) => void;
};

function splitBulkText(value: string) {
  return value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function StudentProfileForm({
  studentId,
  profile,
  setProfile,
  sendProfile,
  setSendProfile,
}: StudentProfileFormProps) {
  const [isEditing, setIsEditing] = useState(true);
  const [profileStatus, setProfileStatus] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(false);

  async function handleLoadProfile() {
    setLoadingProfile(true);
    setProfileStatus("");

    try {
      const data = await getStudentProfile(studentId);

      if (data.status === "success" && data.profile) {
        setProfile(data.profile);
        setIsEditing(false);
        setProfileStatus("Saved profile loaded.");
      } else {
        setIsEditing(true);
        setProfileStatus("No saved profile found. Fill the form and save it.");
      }
    } catch (error) {
      setProfileStatus(
        error instanceof Error ? error.message : "Failed to load profile."
      );
    } finally {
      setLoadingProfile(false);
    }
  }

  async function handleSaveProfile() {
    setLoadingProfile(true);
    setProfileStatus("");

    try {
      await updateStudentProfile(studentId, profile);
      setIsEditing(false);
      setSendProfile(false);
      setProfileStatus("Profile saved successfully.");
    } catch (error) {
      setProfileStatus(
        error instanceof Error ? error.message : "Failed to save profile."
      );
    } finally {
      setLoadingProfile(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-teal-100 bg-gradient-to-br from-slate-900 via-slate-800 to-teal-700 p-6 text-white shadow-xl shadow-slate-200">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-100">
              Profile Workspace
            </p>

            <h2 className="mt-3 text-3xl font-bold tracking-tight">
              Student Profile
            </h2>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-100">
              Upload a resume or manually update your profile. Your internal
              student ID is hidden and used only for secure data storage.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleLoadProfile}
              disabled={loadingProfile || !studentId}
              className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingProfile ? "Loading..." : "Load Saved"}
            </button>

            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-white/20"
            >
              Edit
            </button>

            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={loadingProfile || !studentId}
              className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save Profile
            </button>
          </div>
        </div>

        {profileStatus && (
          <div className="mt-5 rounded-2xl border border-white/20 bg-white/10 p-4 text-sm text-white">
            {profileStatus}
          </div>
        )}
      </div>

      <ResumeUploadCard
        studentId={studentId}
        setProfile={setProfile}
      />

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">
            Manual Profile Details
          </p>

          <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            Review and edit profile fields
          </h3>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            These fields are used by CIE to personalize roadmaps, project
            suggestions, skills analysis, certifications, and interview prep.
          </p>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <TextInput
            label="Name"
            value={profile.name}
            disabled={!isEditing}
            onChange={(value) =>
              setProfile({
                ...profile,
                name: value,
              })
            }
          />

          <TextInput
            label="Current Education"
            value={profile.current_education}
            disabled={!isEditing}
            onChange={(value) =>
              setProfile({
                ...profile,
                current_education: value,
              })
            }
          />

          <TextInput
            label="Career Aspiration"
            value={profile.career_aspiration}
            disabled={!isEditing}
            onChange={(value) =>
              setProfile({
                ...profile,
                career_aspiration: value,
              })
            }
          />

          <div>
            <label className="text-sm font-semibold text-slate-700">
              Years of Experience
            </label>

            <input
              type="number"
              min="0"
              step="0.5"
              disabled={!isEditing}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-50 disabled:cursor-not-allowed disabled:opacity-60"
              value={profile.years_of_experience ?? 0}
              onChange={(event) =>
                setProfile({
                  ...profile,
                  years_of_experience: Number(event.target.value),
                })
              }
            />
          </div>
        </div>

        <div className="mt-6 space-y-5">
          <TagInput
            label="Skills"
            helperText="Add one skill at a time. Example: Python, SQL, PySpark, AWS"
            values={profile.skills}
            disabled={!isEditing}
            onChange={(values) =>
              setProfile({
                ...profile,
                skills: values,
              })
            }
          />

          <TagInput
            label="Interests"
            helperText="Add one interest at a time. Example: data engineering, cloud computing"
            values={profile.interests}
            disabled={!isEditing}
            onChange={(values) =>
              setProfile({
                ...profile,
                interests: values,
              })
            }
          />

          <TagInput
            label="Hobbies"
            helperText="Add one hobby at a time. Example: building data projects"
            values={profile.hobbies}
            disabled={!isEditing}
            onChange={(values) =>
              setProfile({
                ...profile,
                hobbies: values,
              })
            }
          />

          <div>
            <label className="text-sm font-semibold text-slate-700">
              Additional Context
            </label>

            <textarea
              disabled={!isEditing}
              className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-50 disabled:cursor-not-allowed disabled:opacity-60"
              value={profile.additional_context ?? ""}
              onChange={(event) =>
                setProfile({
                  ...profile,
                  additional_context: event.target.value,
                })
              }
            />
          </div>

          <label className="flex items-center gap-3 rounded-2xl border border-teal-100 bg-teal-50 p-4 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={sendProfile}
              onChange={(event) => setSendProfile(event.target.checked)}
              className="h-4 w-4 accent-teal-700"
            />
            Also send this profile with the next question
          </label>
        </div>
      </div>
    </section>
  );
}

function TextInput({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-sm font-semibold text-slate-700">
        {label}
      </label>

      <input
        type="text"
        disabled={disabled}
        className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-50 disabled:cursor-not-allowed disabled:opacity-60"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function TagInput({
  label,
  helperText,
  values,
  disabled,
  onChange,
}: {
  label: string;
  helperText: string;
  values: string[];
  disabled: boolean;
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function addValue(rawValue: string) {
    const parts = splitBulkText(rawValue);

    if (parts.length === 0) {
      return;
    }

    const existingValues = new Set(
      values.map((item) => item.toLowerCase().trim())
    );

    const newValues = parts.filter(
      (item) => !existingValues.has(item.toLowerCase().trim())
    );

    if (newValues.length === 0) {
      setDraft("");
      return;
    }

    onChange([...values, ...newValues]);
    setDraft("");
  }

  function removeValue(index: number) {
    onChange(values.filter((_, currentIndex) => currentIndex !== index));
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
      <label className="text-sm font-semibold text-slate-800">
        {label}
      </label>

      <p className="mt-1 text-xs text-slate-500">
        {helperText}
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          disabled={disabled}
          value={draft}
          placeholder={`Type ${label.toLowerCase()} and click Add`}
          className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none placeholder:text-slate-400 focus:border-teal-400 focus:ring-4 focus:ring-teal-50 disabled:cursor-not-allowed disabled:opacity-60"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addValue(draft);
            }
          }}
        />

        <button
          type="button"
          disabled={disabled}
          onClick={() => addValue(draft)}
          className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Add
        </button>
      </div>

      {values.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {values.map((value, index) => (
            <span
              key={`${value}-${index}`}
              className="inline-flex items-center gap-2 rounded-full border border-teal-100 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm"
            >
              {value}

              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeValue(index)}
                  className="text-slate-400 hover:text-red-500"
                  aria-label={`Remove ${value}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
