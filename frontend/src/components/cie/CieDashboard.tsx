"use client";

import { useEffect, useMemo, useState } from "react";

import {
  askCareerQuestion,
  createStudent,
  getSectionHistory,
  saveSectionHistory,
} from "@/lib/cie-api";

import type {
  CieApiResponse,
  StudentProfile,
} from "@/types/cie";

import { AppShell } from "@/components/layout/AppShell";
import { DashboardHome } from "@/components/dashboard/DashboardHome";
import { StudentProfileForm } from "./StudentProfileForm";
import { QuestionPanel } from "./QuestionPanel";
import { ResponsePanel } from "./ResponsePanel";
import { ProgressTracker } from "./ProgressTracker";

type SectionId =
  | "dashboard"
  | "profile"
  | "roadmap"
  | "projects"
  | "skills"
  | "certifications"
  | "interview"
  | "progress";

type SectionHistoryItem = {
  id: string;
  section: SectionId;
  prompt: string;
  backendPrompt: string;
  response: CieApiResponse;
  createdAt: string;
};

type SectionHistoryMap = Record<SectionId, SectionHistoryItem[]>;

const loadableSections: SectionId[] = [
  "roadmap",
  "projects",
  "skills",
  "certifications",
  "interview",
];

const initialHistory: SectionHistoryMap = {
  dashboard: [],
  profile: [],
  roadmap: [],
  projects: [],
  skills: [],
  certifications: [],
  interview: [],
  progress: [],
};

const initialQuestions: Record<SectionId, string> = {
  dashboard: "",
  profile: "",
  roadmap: "Give me a 6-month roadmap to become a Senior Data Engineer.",
  projects: "What project should I build next?",
  skills: "What skills am I missing for my target role?",
  certifications: "Which certification should I take first?",
  interview: "How should I prepare for a Senior Data Engineer interview?",
  progress: "",
};

const initialErrors: Record<SectionId, string> = {
  dashboard: "",
  profile: "",
  roadmap: "",
  projects: "",
  skills: "",
  certifications: "",
  interview: "",
  progress: "",
};

const initialIndexes: Record<SectionId, number> = {
  dashboard: 0,
  profile: 0,
  roadmap: 0,
  projects: 0,
  skills: 0,
  certifications: 0,
  interview: 0,
  progress: 0,
};

const initialSearch: Record<SectionId, string> = {
  dashboard: "",
  profile: "",
  roadmap: "",
  projects: "",
  skills: "",
  certifications: "",
  interview: "",
  progress: "",
};

function buildBackendQuestion(section: SectionId, question: string) {
  const cleanedQuestion = question.trim();

  if (section === "roadmap") {
    return `Give me a career roadmap for this target role or goal: ${cleanedQuestion}`;
  }

  if (section === "projects") {
    return `Give me project guidance for this career goal or project request: ${cleanedQuestion}`;
  }

  if (section === "skills") {
    return `Give me a skills gap analysis for this target role or goal: ${cleanedQuestion}`;
  }

  if (section === "certifications") {
    return `Give me certification guidance for this target role or goal: ${cleanedQuestion}`;
  }

  if (section === "interview") {
    return `Give me interview preparation guidance for this target role or interview: ${cleanedQuestion}`;
  }

  return cleanedQuestion;
}

function formatApiDate(value: string | null) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

export function CieDashboard() {
  const [activeSection, setActiveSection] = useState<SectionId>("dashboard");

  const [studentId, setStudentId] = useState("");
  const [studentReady, setStudentReady] = useState(false);

  const [profile, setProfile] = useState<StudentProfile>({
    name: "",
    current_education: "",
    interests: [],
    hobbies: [],
    career_aspiration: "",
    skills: [],
    years_of_experience: 0,
    additional_context: "",
  });

  const [sendProfile, setSendProfile] = useState(false);

  const [sectionQuestions, setSectionQuestions] =
    useState<Record<SectionId, string>>(initialQuestions);

  const [historyBySection, setHistoryBySection] =
    useState<SectionHistoryMap>(initialHistory);

  const [activeIndexBySection, setActiveIndexBySection] =
    useState<Record<SectionId, number>>(initialIndexes);

  const [searchBySection, setSearchBySection] =
    useState<Record<SectionId, string>>(initialSearch);

  const [errorBySection, setErrorBySection] =
    useState<Record<SectionId, string>>(initialErrors);

  const [loadingSection, setLoadingSection] = useState<SectionId | null>(null);

  const [loadedSectionKeys, setLoadedSectionKeys] = useState<Set<string>>(
    new Set()
  );

  const currentQuestion = sectionQuestions[activeSection] || "";
  const currentHistory = historyBySection[activeSection] || [];
  const currentSearch = searchBySection[activeSection] || "";
  const currentError = errorBySection[activeSection] || "";

  const filteredHistory = useMemo(() => {
    if (!currentSearch.trim()) {
      return currentHistory;
    }

    const search = currentSearch.toLowerCase();

    return currentHistory.filter((item) => {
      return (
        item.prompt.toLowerCase().includes(search) ||
        item.backendPrompt.toLowerCase().includes(search) ||
        JSON.stringify(item.response).toLowerCase().includes(search)
      );
    });
  }, [currentHistory, currentSearch]);

  const activeIndex = activeIndexBySection[activeSection] || 0;
  const activeHistoryItem = filteredHistory[activeIndex] || null;
  const activeResult = activeHistoryItem?.response || null;

  const isLoading = loadingSection === activeSection;

  useEffect(() => {
    async function initializeStudent() {
      try {
        const existingStudentId = window.localStorage.getItem(
          "cie_student_id"
        );

        if (existingStudentId) {
          setStudentId(existingStudentId);
          setStudentReady(true);
          return;
        }

        const created = await createStudent();

        window.localStorage.setItem(
          "cie_student_id",
          created.student_id
        );

        setStudentId(created.student_id);
        setStudentReady(true);
      } catch (error) {
        setErrorBySection((previous) => ({
          ...previous,
          dashboard:
            error instanceof Error
              ? error.message
              : "Failed to initialize student.",
        }));
      }
    }

    initializeStudent();
  }, []);

  useEffect(() => {
    async function loadHistoryForSection() {
      if (!studentReady || !studentId) {
        return;
      }

      if (!loadableSections.includes(activeSection)) {
        return;
      }

      const loadKey = `${studentId}:${activeSection}`;

      if (loadedSectionKeys.has(loadKey)) {
        return;
      }

      setLoadingSection(activeSection);

      try {
        const data = await getSectionHistory(studentId, activeSection);

        const restoredItems: SectionHistoryItem[] = data.history.map(
          (item) => ({
            id: String(item.id),
            section: item.section as SectionId,
            prompt: item.prompt,
            backendPrompt: item.backend_prompt,
            response: item.response,
            createdAt: formatApiDate(item.created_at),
          })
        );

        setHistoryBySection((previous) => ({
          ...previous,
          [activeSection]: restoredItems,
        }));

        setActiveIndexBySection((previous) => ({
          ...previous,
          [activeSection]:
            restoredItems.length > 0 ? restoredItems.length - 1 : 0,
        }));

        setLoadedSectionKeys((previous) => {
          const updated = new Set(previous);
          updated.add(loadKey);
          return updated;
        });
      } catch (error) {
        setErrorBySection((previous) => ({
          ...previous,
          [activeSection]:
            error instanceof Error
              ? error.message
              : "Failed to load section history.",
        }));
      } finally {
        setLoadingSection(null);
      }
    }

    loadHistoryForSection();
  }, [activeSection, studentId, studentReady, loadedSectionKeys]);

  function handleSectionChange(section: string) {
    const nextSection = section as SectionId;

    setActiveSection(nextSection);

    setErrorBySection((previous) => ({
      ...previous,
      [nextSection]: "",
    }));
  }

  function handleStudentIdChange(value: string) {
    setStudentId(value);

    setHistoryBySection(initialHistory);
    setActiveIndexBySection(initialIndexes);
    setSearchBySection(initialSearch);
    setErrorBySection(initialErrors);
    setLoadedSectionKeys(new Set());
  }

  function updateQuestion(value: string) {
    setSectionQuestions((previous) => ({
      ...previous,
      [activeSection]: value,
    }));
  }

  function updateSearch(value: string) {
    setSearchBySection((previous) => ({
      ...previous,
      [activeSection]: value,
    }));

    setActiveIndexBySection((previous) => ({
      ...previous,
      [activeSection]: 0,
    }));
  }

  function goPrevious() {
    setActiveIndexBySection((previous) => ({
      ...previous,
      [activeSection]: Math.max(0, activeIndex - 1),
    }));
  }

  function goNext() {
    setActiveIndexBySection((previous) => ({
      ...previous,
      [activeSection]: Math.min(
        Math.max(filteredHistory.length - 1, 0),
        activeIndex + 1
      ),
    }));
  }

  async function handleSubmit(customQuestion?: string) {
    if (!studentReady || !studentId) {
      setErrorBySection((previous) => ({
        ...previous,
        [activeSection]:
          "Student session is not ready yet. Please wait a moment.",
      }));
      return;
    }

    const userVisibleQuestion = customQuestion || currentQuestion;

    if (!userVisibleQuestion.trim()) {
      setErrorBySection((previous) => ({
        ...previous,
        [activeSection]: "Please enter a question first.",
      }));
      return;
    }

    const sectionAtSubmit = activeSection;
    const backendPrompt = buildBackendQuestion(
      sectionAtSubmit,
      userVisibleQuestion
    );

    setLoadingSection(sectionAtSubmit);

    setErrorBySection((previous) => ({
      ...previous,
      [sectionAtSubmit]: "",
    }));

    try {
      const data = await askCareerQuestion({
        student_id: studentId,
        question: backendPrompt,
        ...(sendProfile ? { profile } : {}),
      });

      await saveSectionHistory({
        student_id: studentId,
        section: sectionAtSubmit,
        prompt: userVisibleQuestion,
        backend_prompt: backendPrompt,
        response: data,
      });

      const newItem: SectionHistoryItem = {
        id: `${sectionAtSubmit}-${Date.now()}`,
        section: sectionAtSubmit,
        prompt: userVisibleQuestion,
        backendPrompt,
        response: data,
        createdAt: new Date().toLocaleString(),
      };

      setSectionQuestions((previous) => ({
        ...previous,
        [sectionAtSubmit]: userVisibleQuestion,
      }));

      setHistoryBySection((previous) => {
        const oldItems = previous[sectionAtSubmit] || [];
        const newItems = [...oldItems, newItem];

        setActiveIndexBySection((oldIndexes) => ({
          ...oldIndexes,
          [sectionAtSubmit]: newItems.length - 1,
        }));

        return {
          ...previous,
          [sectionAtSubmit]: newItems,
        };
      });

      setLoadedSectionKeys((previous) => {
        const updated = new Set(previous);
        updated.add(`${studentId}:${sectionAtSubmit}`);
        return updated;
      });
    } catch (error) {
      setErrorBySection((previous) => ({
        ...previous,
        [sectionAtSubmit]:
          error instanceof Error ? error.message : "Something went wrong.",
      }));
    } finally {
      setLoadingSection(null);
    }
  }

  function renderSection() {
    if (activeSection === "dashboard") {
      return (
        <DashboardHome
          profile={profile}
          setActiveSection={handleSectionChange}
        />
      );
    }

    if (activeSection === "profile") {
      return (
        <StudentProfileForm
          studentId={studentId}
          setStudentId={handleStudentIdChange}
          profile={profile}
          setProfile={setProfile}
          sendProfile={sendProfile}
          setSendProfile={setSendProfile}
        />
      );
    }

    if (activeSection === "roadmap") {
      return (
        <GuidedAskPage
          title="Career Roadmap"
          eyebrow="Roadmap Workspace"
          description="Generate a structured roadmap from your current profile to your target role."
          question={currentQuestion}
          setQuestion={updateQuestion}
          loading={isLoading}
          error={currentError}
          result={activeResult}
          activePrompt={activeHistoryItem?.prompt || ""}
          activeCreatedAt={activeHistoryItem?.createdAt || ""}
          historyCount={filteredHistory.length}
          activeHistoryIndex={activeIndex}
          searchValue={currentSearch}
          onSearchChange={updateSearch}
          onPrevious={goPrevious}
          onNext={goNext}
          suggestedQuestions={[
            "Give me a 6-month roadmap to become a Senior Data Engineer.",
            "Give me a 12-month roadmap from my current profile to Data Architect.",
            "Create a weekly learning plan for my target role.",
          ]}
          onSubmit={handleSubmit}
        />
      );
    }

    if (activeSection === "projects") {
      return (
        <GuidedAskPage
          title="Project Builder"
          eyebrow="Project Workspace"
          description="Get portfolio projects and step-by-step project roadmaps."
          question={currentQuestion}
          setQuestion={updateQuestion}
          loading={isLoading}
          error={currentError}
          result={activeResult}
          activePrompt={activeHistoryItem?.prompt || ""}
          activeCreatedAt={activeHistoryItem?.createdAt || ""}
          historyCount={filteredHistory.length}
          activeHistoryIndex={activeIndex}
          searchValue={currentSearch}
          onSearchChange={updateSearch}
          onPrevious={goPrevious}
          onNext={goNext}
          suggestedQuestions={[
            "What project should I build next?",
            "Give me a roadmap for building a cloud data pipeline project.",
            "Suggest a GitHub portfolio project for my current skills.",
          ]}
          onSubmit={handleSubmit}
        />
      );
    }

    if (activeSection === "skills") {
      return (
        <GuidedAskPage
          title="Skills Gap"
          eyebrow="Skills Workspace"
          description="Compare your current skills against your target role."
          question={currentQuestion}
          setQuestion={updateQuestion}
          loading={isLoading}
          error={currentError}
          result={activeResult}
          activePrompt={activeHistoryItem?.prompt || ""}
          activeCreatedAt={activeHistoryItem?.createdAt || ""}
          historyCount={filteredHistory.length}
          activeHistoryIndex={activeIndex}
          searchValue={currentSearch}
          onSearchChange={updateSearch}
          onPrevious={goPrevious}
          onNext={goNext}
          suggestedQuestions={[
            "What skills am I missing for my target role?",
            "Compare my current skills with a Senior Data Engineer role.",
            "Give me a beginner-to-intermediate skill gap plan.",
          ]}
          onSubmit={handleSubmit}
        />
      );
    }

    if (activeSection === "certifications") {
      return (
        <GuidedAskPage
          title="Certifications"
          eyebrow="Certification Workspace"
          description="Find practical certifications based on your goal and current level."
          question={currentQuestion}
          setQuestion={updateQuestion}
          loading={isLoading}
          error={currentError}
          result={activeResult}
          activePrompt={activeHistoryItem?.prompt || ""}
          activeCreatedAt={activeHistoryItem?.createdAt || ""}
          historyCount={filteredHistory.length}
          activeHistoryIndex={activeIndex}
          searchValue={currentSearch}
          onSearchChange={updateSearch}
          onPrevious={goPrevious}
          onNext={goNext}
          suggestedQuestions={[
            "Which certification should I take first?",
            "Should I choose AWS Data Engineer Associate or Databricks Data Engineer Associate?",
            "Create a certification plan for becoming a Senior Data Engineer.",
          ]}
          onSubmit={handleSubmit}
        />
      );
    }

    if (activeSection === "interview") {
      return (
        <GuidedAskPage
          title="Interview Preparation"
          eyebrow="Interview Workspace"
          description="Prepare for technical, scenario-based, and behavioral interviews."
          question={currentQuestion}
          setQuestion={updateQuestion}
          loading={isLoading}
          error={currentError}
          result={activeResult}
          activePrompt={activeHistoryItem?.prompt || ""}
          activeCreatedAt={activeHistoryItem?.createdAt || ""}
          historyCount={filteredHistory.length}
          activeHistoryIndex={activeIndex}
          searchValue={currentSearch}
          onSearchChange={updateSearch}
          onPrevious={goPrevious}
          onNext={goNext}
          suggestedQuestions={[
            "How should I prepare for a Senior Data Engineer interview?",
            "Give me scenario questions for a Data Engineer Architect interview.",
            "Create a mock interview plan for my target role.",
          ]}
          onSubmit={handleSubmit}
        />
      );
    }

    if (activeSection === "progress") {
      return <ProgressTracker studentId={studentId} />;
    }

    return null;
  }

  if (!studentReady) {
    return (
      <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="font-semibold text-teal-700">
            Starting student session...
          </p>

          {errorBySection.dashboard && (
            <p className="mt-3 text-sm text-red-600">
              {errorBySection.dashboard}
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <AppShell
      activeSection={activeSection}
      setActiveSection={handleSectionChange}
      displayName={profile.name || "Student"}
      targetRole={profile.career_aspiration || "Not set yet"}
    >
      {renderSection()}
    </AppShell>
  );
}

function GuidedAskPage({
  title,
  eyebrow,
  description,
  question,
  setQuestion,
  loading,
  error,
  result,
  activePrompt,
  activeCreatedAt,
  historyCount,
  activeHistoryIndex,
  searchValue,
  onSearchChange,
  onPrevious,
  onNext,
  suggestedQuestions,
  onSubmit,
}: {
  title: string;
  eyebrow: string;
  description: string;
  question: string;
  setQuestion: (value: string) => void;
  loading: boolean;
  error: string;
  result: CieApiResponse | null;
  activePrompt: string;
  activeCreatedAt: string;
  historyCount: number;
  activeHistoryIndex: number;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  suggestedQuestions: string[];
  onSubmit: (customQuestion?: string) => void;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-teal-100 bg-gradient-to-br from-slate-900 via-slate-800 to-teal-700 p-6 text-white shadow-xl shadow-slate-200">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-100">
          {eyebrow}
        </p>

        <h1 className="mt-3 text-3xl font-bold tracking-tight">
          {title}
        </h1>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-100">
          {description}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          {suggestedQuestions.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onSubmit(item)}
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20"
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <QuestionPanel
          question={question}
          setQuestion={setQuestion}
          loading={loading}
          onSubmit={() => onSubmit()}
        />

        <div className="space-y-4">
          <SectionHistoryControls
            historyCount={historyCount}
            activeHistoryIndex={activeHistoryIndex}
            searchValue={searchValue}
            activePrompt={activePrompt}
            activeCreatedAt={activeCreatedAt}
            onSearchChange={onSearchChange}
            onPrevious={onPrevious}
            onNext={onNext}
          />

          <ResponsePanel
            key={title}
            result={error ? null : result}
            error={error}
          />
        </div>
      </div>
    </div>
  );
}

function SectionHistoryControls({
  historyCount,
  activeHistoryIndex,
  searchValue,
  activePrompt,
  activeCreatedAt,
  onSearchChange,
  onPrevious,
  onNext,
}: {
  historyCount: number;
  activeHistoryIndex: number;
  searchValue: string;
  activePrompt: string;
  activeCreatedAt: string;
  onSearchChange: (value: string) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-bold text-slate-950">
              Section Responses
            </p>

            <p className="text-xs text-slate-500">
              {historyCount === 0
                ? "No response yet for this section."
                : `Showing ${activeHistoryIndex + 1} of ${historyCount}`}
            </p>
          </div>

          <div className="flex flex-1 flex-col gap-2 md:max-w-xl md:flex-row">
            <input
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search responses..."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-50"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onPrevious}
                disabled={historyCount <= 1 || activeHistoryIndex === 0}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>

              <button
                type="button"
                onClick={onNext}
                disabled={
                  historyCount <= 1 ||
                  activeHistoryIndex >= historyCount - 1
                }
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {activePrompt && (
          <div className="rounded-2xl border border-teal-100 bg-teal-50 p-4">
            <p className="text-xs font-semibold text-teal-700">
              Saved Prompt
            </p>

            <p className="mt-1 text-sm text-slate-700">
              {activePrompt}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {activeCreatedAt}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
