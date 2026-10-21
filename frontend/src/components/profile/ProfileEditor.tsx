"use client";

import { useState } from "react";
import { Save } from "lucide-react";

import { useStudent } from "@/components/layout/StudentContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ChipInput, Field, Select, TextArea, TextInput } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import type { StudentProfile } from "@/types/cie";

const GRADES = ["9th grade", "10th grade", "11th grade", "12th grade"];

type Editable = Pick<
  StudentProfile,
  | "name"
  | "preferred_name"
  | "grade_level"
  | "school"
  | "country"
  | "favorite_subjects"
  | "interests"
  | "hobbies"
  | "strengths"
  | "skills"
  | "activities"
  | "career_status"
  | "career_aspiration"
  | "academic_goals"
  | "learning_style"
>;

function pick(profile: StudentProfile): Editable {
  return {
    name: profile.name ?? "",
    preferred_name: profile.preferred_name ?? "",
    grade_level: profile.grade_level ?? "",
    school: profile.school ?? "",
    country: profile.country ?? "",
    favorite_subjects: profile.favorite_subjects ?? [],
    interests: profile.interests ?? [],
    hobbies: profile.hobbies ?? [],
    strengths: profile.strengths ?? [],
    skills: profile.skills ?? [],
    activities: profile.activities ?? [],
    career_status: profile.career_status ?? "",
    career_aspiration: profile.career_aspiration ?? "",
    academic_goals: profile.academic_goals ?? "",
    learning_style: profile.learning_style ?? "",
  };
}

export function ProfileEditor() {
  const { me, setMe } = useStudent();
  const toast = useToast();
  const [form, setForm] = useState<Editable>(() => pick(me.profile));
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(pick(me.profile));

  function set<K extends keyof Editable>(key: K, value: Editable[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);

    try {
      const updated = await api.updateProfile(form);
      setMe(updated);
      setForm(pick(updated.profile));
      toast("Profile saved. Your counselor will use it right away.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't save your profile.", "error");
    } finally {
      setSaving(false);
    }
  }

  const gradeIsCustom = form.grade_level !== "" && !GRADES.includes(form.grade_level);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="space-y-6"
    >
      <Card className="p-6">
        <h2 className="text-lg font-bold">The basics</h2>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <Field label="Preferred name" htmlFor="preferred_name" hint="What your counselor calls you.">
            <TextInput id="preferred_name" value={form.preferred_name} onChange={(event) => set("preferred_name", event.target.value)} maxLength={80} />
          </Field>
          <Field label="Full name" htmlFor="name">
            <TextInput id="name" value={form.name} onChange={(event) => set("name", event.target.value)} maxLength={120} />
          </Field>
          <Field label="Grade" htmlFor="grade_level">
            <Select
              id="grade_level"
              value={gradeIsCustom ? "other" : form.grade_level}
              onChange={(event) => set("grade_level", event.target.value === "other" ? "Other" : event.target.value)}
            >
              <option value="">Not set</option>
              {GRADES.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
              <option value="other">Something else</option>
            </Select>
            {gradeIsCustom && (
              <TextInput
                aria-label="Your grade or year"
                value={form.grade_level === "Other" ? "" : form.grade_level}
                onChange={(event) => set("grade_level", event.target.value || "Other")}
                className="mt-2"
                placeholder="Your grade or year"
              />
            )}
          </Field>
          <Field label="School (optional)" htmlFor="school">
            <TextInput id="school" value={form.school} onChange={(event) => set("school", event.target.value)} maxLength={160} />
          </Field>
          <Field label="Country (optional)" htmlFor="country" hint="Helps with education pathways where you live.">
            <TextInput id="country" value={form.country} onChange={(event) => set("country", event.target.value)} maxLength={80} />
          </Field>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-bold">What you enjoy and what you&apos;re good at</h2>
        <p className="mt-1 text-sm text-ink-muted">Type and press Enter to add. Short phrases work best.</p>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <Field label="Favorite subjects" htmlFor="favorite_subjects">
            <ChipInput id="favorite_subjects" value={form.favorite_subjects} onChange={(value) => set("favorite_subjects", value)} placeholder="Biology, Art…" />
          </Field>
          <Field label="Interests" htmlFor="interests">
            <ChipInput id="interests" value={form.interests} onChange={(value) => set("interests", value)} placeholder="Animals, coding…" />
          </Field>
          <Field label="Hobbies" htmlFor="hobbies">
            <ChipInput id="hobbies" value={form.hobbies} onChange={(value) => set("hobbies", value)} placeholder="Drawing, soccer…" />
          </Field>
          <Field label="Strengths" htmlFor="strengths">
            <ChipInput id="strengths" value={form.strengths} onChange={(value) => set("strengths", value)} placeholder="Patient, creative…" />
          </Field>
          <Field label="Skills" htmlFor="skills">
            <ChipInput id="skills" value={form.skills} onChange={(value) => set("skills", value)} placeholder="Python, public speaking…" />
          </Field>
          <Field label="Activities and clubs" htmlFor="activities">
            <ChipInput id="activities" value={form.activities} onChange={(value) => set("activities", value)} placeholder="Robotics club, volunteering…" />
          </Field>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-bold">Goals</h2>
        <fieldset className="mt-5">
          <legend className="text-sm font-semibold">Do you have a career in mind?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ["have_goal", "Yes, I have one in mind"],
                ["exploring", "I'm still figuring it out"],
                ["", "Prefer not to say"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={label}
                className={`cursor-pointer rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                  form.career_status === value ? "border-primary bg-primary text-on-primary" : "border-line-strong bg-surface text-ink hover:bg-surface-2"
                }`}
              >
                <input
                  type="radio"
                  name="career_status"
                  value={value}
                  checked={form.career_status === value}
                  onChange={() => set("career_status", value)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <Field label="Career you're curious about" htmlFor="career_aspiration" hint="Optional, and you can change it any time.">
            <TextInput id="career_aspiration" value={form.career_aspiration} onChange={(event) => set("career_aspiration", event.target.value)} maxLength={160} />
          </Field>
          <Field label="How do you like to learn?" htmlFor="learning_style" hint="For example: hands-on, reading, videos, with friends.">
            <TextInput id="learning_style" value={form.learning_style} onChange={(event) => set("learning_style", event.target.value)} maxLength={200} />
          </Field>
          <div className="md:col-span-2">
            <Field label="School or learning goals" htmlFor="academic_goals">
              <TextArea id="academic_goals" rows={3} value={form.academic_goals} onChange={(event) => set("academic_goals", event.target.value)} maxLength={1000} />
            </Field>
          </div>
        </div>
      </Card>

      <div
        className={`sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-20 flex items-center justify-between gap-3 rounded-full border border-line bg-surface/95 py-2 pl-5 pr-2 shadow-[var(--shadow-raised)] backdrop-blur transition-opacity lg:bottom-6 ${
          dirty ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!dirty}
      >
        <p className="text-sm font-medium text-ink-muted">You have unsaved changes</p>
        <Button type="submit" loading={saving} icon={<Save aria-hidden className="size-4" />} tabIndex={dirty ? 0 : -1}>
          Save profile
        </Button>
      </div>
    </form>
  );
}
