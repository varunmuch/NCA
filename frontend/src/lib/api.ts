import type {
  ServiceHours,
  AcademicAnswers,
  PlanClarify,
  AgentActivityItem,
  QuizFollowUps,
  StudentRecord,
  CareerDetail,
  CareerInsights,
  CareerRoadmap,
  InterestQuiz,
  InterestQuizAnswers,
  InterestQuizResult,
  CareerSummary,
  CareersMeta,
  ConversationDetail,
  ConversationSummary,
  CounselorAction,
  CounselorStreamEvent,
  CounselorTurnResponse,
  DocumentDetail,
  EarlierAnswer,
  HomeSummary,
  MeResponse,
  PlanDetail,
  PlanStreamEvent,
  QuickPath,
  DocumentReview,
  PlanMilestone,
  PlanStep,
  PlanSummary,
  ProgressStatus,
  ProgressTask,
  ProgressTimeline,
  StudentDocument,
  StudentFact,
  StudentProfile,
} from "@/types/cie";

/**
 * Browser-side client. Every request goes to the same-origin proxy at
 * /api/cie, which attaches the signed-in student's identity on the server.
 */

const BASE = "/api/cie";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function errorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "detail" in data) {
    const detail = (data as { detail: unknown }).detail;

    if (typeof detail === "string") {
      return detail;
    }

    if (Array.isArray(detail) && detail[0]?.msg) {
      return String(detail[0].msg);
    }
  }

  return fallback;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  fallback = "Something went wrong. Please try again."
): Promise<T> {
  const headers = new Headers(init.headers);

  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("You seem to be offline. Check your connection and try again.", 0);
  }

  let data: unknown = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new ApiError(errorMessage(data, fallback), response.status);
  }

  return data as T;
}

const json = (body: unknown) => JSON.stringify(body);

/** Read a server-sent event stream, calling onEvent for each event. */
async function readEvents<T>(body: ReadableStream<Uint8Array>, onEvent: (event: T) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handle = (block: string) => {
    let name = "";
    let data = "";

    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) {
        name = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        data += line.slice(6);
      }
    }

    if (name && data) {
      onEvent({ event: name, ...JSON.parse(data) } as T);
    }
  };

  for (;;) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");

    while (boundary !== -1) {
      handle(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
    }
  }

  if (buffer.trim()) {
    handle(buffer);
  }
}

export const api = {
  me: () => request<MeResponse>("/me"),

  updateProfile: (updates: Partial<StudentProfile>) =>
    request<MeResponse>("/me/profile", { method: "PUT", body: json(updates) }),

  home: () => request<HomeSummary>("/me/home"),

  facts: () =>
    request<{ facts: StudentFact[]; categories: Record<string, string> }>("/me/facts"),

  addFact: (category: string, value: string) =>
    request<StudentFact>("/me/facts", { method: "POST", body: json({ category, value }) }),

  updateFact: (
    id: number,
    updates: { value?: string; status?: StudentFact["status"]; category?: string }
  ) => request<StudentFact>(`/me/facts/${id}`, { method: "PATCH", body: json(updates) }),

  confirmFacts: (ids: number[]) =>
    request<{ facts: StudentFact[] }>("/me/facts/confirm", {
      method: "POST",
      body: json({ ids }),
    }),

  deleteFact: (id: number) => request(`/me/facts/${id}`, { method: "DELETE" }),

  conversations: () =>
    request<{ conversations: ConversationSummary[] }>("/me/conversations"),

  conversation: (id: string) => request<ConversationDetail>(`/me/conversations/${id}`),

  renameConversation: (id: string, title: string) =>
    request<ConversationSummary>(`/me/conversations/${id}`, {
      method: "PATCH",
      body: json({ title }),
    }),

  deleteConversation: (id: string) =>
    request(`/me/conversations/${id}`, { method: "DELETE" }),

  sendMessage: (payload: {
    conversation_id?: string | null;
    text: string;
    action?: CounselorAction | null;
  }) =>
    request<CounselorTurnResponse>(
      "/me/counselor/messages",
      { method: "POST", body: json(payload) },
      "The counselor couldn't answer just now. Please try again."
    ),

  /**
   * Send a message and receive the reply as it is written. `onEvent` sees
   * every event; the promise resolves with the final done or error event.
   */
  streamMessage: async (
    payload: { conversation_id?: string | null; text: string; action?: CounselorAction | null; page?: string },
    onEvent: (event: CounselorStreamEvent) => void
  ): Promise<CounselorTurnResponse> => {
    let response: Response;

    try {
      response = await fetch(`${BASE}/me/counselor/messages/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: json(payload),
      });
    } catch {
      throw new ApiError("You seem to be offline. Check your connection and try again.", 0);
    }

    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => null);
      throw new ApiError(errorMessage(data, "The counselor couldn't answer just now. Please try again."), response.status);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    // An object, not a let: TypeScript does not see assignments in callbacks.
    const result: { final: CounselorTurnResponse | null } = { final: null };

    const handle = (block: string) => {
      let name = "";
      let data = "";

      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) {
          name = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          data += line.slice(6);
        }
      }

      if (!name || !data) {
        return;
      }

      const event = { event: name, ...JSON.parse(data) } as CounselorStreamEvent;
      onEvent(event);

      if (event.event === "done" || event.event === "error") {
        result.final = event;
      }
    };

    for (;;) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");

      while (boundary !== -1) {
        handle(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
      }
    }

    if (buffer.trim()) {
      handle(buffer);
    }

    if (!result.final) {
      throw new ApiError("The connection dropped before the counselor finished. Please try again.", 0);
    }

    return result.final;
  },

  modelHealth: () => request<{ available: boolean }>("/health/model"),

  retryMessage: (conversationId: string) =>
    request<CounselorTurnResponse>(`/me/conversations/${conversationId}/retry`, {
      method: "POST",
    }),

  earlierAnswers: () => request<{ answers: EarlierAnswer[] }>("/me/earlier-answers"),

  documents: () => request<{ documents: StudentDocument[] }>("/me/documents"),

  document: (id: number) => request<DocumentDetail>(`/me/documents/${id}`),

  uploadDocument: (file: File, docType: "resume" | "transcript") => {
    const form = new FormData();
    form.append("file", file);
    form.append("doc_type", docType);

    return request<StudentDocument>(
      "/me/documents",
      { method: "POST", body: form },
      "We couldn't upload that file."
    );
  },

  reprocessDocument: (id: number) =>
    request<StudentDocument>(`/me/documents/${id}/process`, { method: "POST" }),

  deleteDocument: (id: number) => request(`/me/documents/${id}`, { method: "DELETE" }),

  documentFileUrl: (id: number, download = false) =>
    `${BASE}/me/documents/${id}/file${download ? "?download=true" : ""}`,

  careersMeta: () => request<CareersMeta>("/careers/meta"),

  careers: (filters: { q?: string; family?: string; subject?: string; interest?: string }) => {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params.set(key, value);
      }
    }

    return request<{ careers: CareerSummary[]; suggestion: string | null; added?: string | null }>(`/careers?${params.toString()}`);
  },

  careersForMe: () =>
    request<{ careers: CareerSummary[]; has_signals: boolean }>("/careers/for-me"),

  career: (slug: string) => request<CareerDetail>(`/careers/${encodeURIComponent(slug)}`),

  compareCareers: (slugs: string[]) =>
    request<{ careers: (CareerDetail & { family_label: string })[] }>(
      `/careers/compare?slugs=${slugs.map(encodeURIComponent).join(",")}`
    ),

  careerInsights: (slug: string) =>
    request<CareerInsights>(`/careers/${encodeURIComponent(slug)}/insights`, {
      method: "POST",
    }),

  interestQuiz: () => request<InterestQuiz>("/interest-quiz"),

  quizFollowUps: () => request<QuizFollowUps>("/me/interest-quiz/follow-ups"),

  quizMajors: (answers: AcademicAnswers) =>
    request<InterestQuizResult>("/me/interest-quiz/majors", { method: "POST", body: json(answers) }),

  record: () => request<StudentRecord>("/me/record"),

  greeting: () => request<{ message: string; action_label: string; action_prompt: string }>("/me/greeting"),

  agentActivity: () => request<{ items: AgentActivityItem[]; running: boolean }>("/me/agent-activity"),

  serviceHours: () => request<ServiceHours>("/me/service-hours"),

  logServiceHours: (entry: { hours: number; place: string; date: string; note?: string }) =>
    request<ServiceHours>("/me/service-hours", { method: "POST", body: json(entry) }),

  removeServiceHours: (id: string) =>
    request<ServiceHours>(`/me/service-hours/${encodeURIComponent(id)}`, { method: "DELETE" }),

  updateAcademicProfile: (answers: AcademicAnswers) =>
    request<StudentRecord>("/me/academic-profile", { method: "PUT", body: json(answers) }),

  submitInterestQuiz: (answers: InterestQuizAnswers) =>
    request<InterestQuizResult>("/me/interest-quiz", { method: "POST", body: json(answers) }),

  resendVerification: () =>
    request<{ status: string }>("/me/email/verification", { method: "POST" }),

  careerRoadmap: (slug: string) =>
    request<CareerRoadmap>(`/careers/${encodeURIComponent(slug)}/roadmap`),

  generateRoadmap: (slug: string) =>
    request<CareerRoadmap>(
      `/careers/${encodeURIComponent(slug)}/roadmap`,
      { method: "POST" },
      "Your roadmap couldn't be created just now. Please try again."
    ),

  trackRoadmap: (slug: string) =>
    request<CareerRoadmap>(`/careers/${encodeURIComponent(slug)}/roadmap/track`, {
      method: "POST",
    }),

  savedCareers: () => request<{ careers: CareerSummary[] }>("/me/saved-careers"),

  setCareerSaved: (slug: string, saved: boolean) =>
    request<{ slug: string; saved: boolean }>(
      `/me/saved-careers/${encodeURIComponent(slug)}`,
      { method: saved ? "PUT" : "DELETE" }
    ),

  plans: () => request<{ plans: PlanSummary[] }>("/me/plans"),

  plan: (id: string) => request<PlanDetail>(`/me/plans/${id}`),

  /** Build a plan and hear what the counselor is checking while it works. */
  streamPlan: async (payload: { career_goal?: string; instruction?: string }, onProgress: (text: string) => void): Promise<PlanDetail> => {
    let response: Response;

    try {
      response = await fetch(`${BASE}/me/plans/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: json(payload),
      });
    } catch {
      throw new ApiError("You seem to be offline. Check your connection and try again.", 0);
    }

    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => null);
      throw new ApiError(errorMessage(data, "Your plan couldn't be created just now. Please try again."), response.status);
    }

    let final: PlanStreamEvent | null = null;

    await readEvents<PlanStreamEvent>(response.body, (event) => {
      if (event.event === "progress") {
        onProgress(event.text);
      } else {
        final = event;
      }
    });

    const finished = final as PlanStreamEvent | null;

    if (!finished) {
      throw new ApiError("The connection dropped before your plan was ready. Please try again.", 0);
    }

    if (finished.event === "error") {
      throw new ApiError(finished.message, 503);
    }

    return (finished as { plan: PlanDetail }).plan;
  },

  careerQuickPath: (slug: string) => request<QuickPath>(`/careers/${encodeURIComponent(slug)}/quick-path`),

  reviewDocument: (id: number, refresh = false) =>
    request<DocumentReview>(
      `/me/documents/${id}/review${refresh ? "?refresh=true" : ""}`,
      { method: "POST" },
      "Suggestions couldn't be made just now. Please try again."
    ),

  generatePlan: (payload: { career_goal?: string; instruction?: string }) =>
    request<PlanDetail>(
      "/me/plans",
      { method: "POST", body: json(payload) },
      "Your plan couldn't be created just now. Please try again."
    ),

  revisePlan: (id: string, payload: { instruction?: string; career_goal?: string }) =>
    request<PlanDetail | PlanClarify>(`/me/plans/${id}/revise`, { method: "POST", body: json(payload) }),

  savePlan: (id: string) => request<PlanDetail>(`/me/plans/${id}/save`, { method: "POST" }),

  updatePlan: (
    id: string,
    updates: {
      title?: string;
      short_term_milestones?: PlanMilestone[];
      next_steps?: PlanStep[];
      next_three_actions?: string[];
      long_term_goals?: string[];
    }
  ) => request<PlanDetail>(`/me/plans/${id}`, { method: "PATCH", body: json(updates) }),

  deletePlan: (id: string) => request(`/me/plans/${id}`, { method: "DELETE" }),

  planPdfUrl: (id: string) => `${BASE}/me/plans/${id}/pdf`,

  progress: () => request<{ timelines: ProgressTimeline[] }>("/me/progress"),

  createTimeline: (payload: { title: string; description?: string }) =>
    request<ProgressTimeline>("/me/progress/timelines", {
      method: "POST",
      body: json({ status: "in_progress", sort_order: 0, description: "", ...payload }),
    }),

  deleteTimeline: (id: number) =>
    request(`/me/progress/timelines/${id}`, { method: "DELETE" }),

  createTask: (
    timelineId: number,
    payload: { title: string; notes?: string; due_date?: string | null }
  ) =>
    request<ProgressTask>(`/me/progress/timelines/${timelineId}/tasks`, {
      method: "POST",
      body: json({ notes: "", status: "not_started", priority: "medium", sort_order: 0, ...payload }),
    }),

  updateTask: (
    id: number,
    updates: { title?: string; notes?: string; status?: ProgressStatus; due_date?: string | null }
  ) => request<ProgressTask>(`/me/progress/tasks/${id}`, { method: "PUT", body: json(updates) }),

  deleteTask: (id: number) => request(`/me/progress/tasks/${id}`, { method: "DELETE" }),
};
