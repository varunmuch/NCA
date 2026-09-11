import type {
  CareerQuestionRequest,
  CieApiResponse,
  StudentProfile,
} from "@/types/cie";

const API_BASE = process.env.NEXT_PUBLIC_CIE_API_BASE;

if (!API_BASE) {
  throw new Error(
    "NEXT_PUBLIC_CIE_API_BASE is not configured. Please set it in .env.local."
  );
}

export async function createStudent(): Promise<{
  status: string;
  student_id: string;
  message: string;
}> {
  const response = await fetch(`${API_BASE}/api/v1/students`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || "Failed to create student.");
  }

  return data;
}

export async function askCareerQuestion(
  payload: CareerQuestionRequest
): Promise<CieApiResponse> {
  const response = await fetch(`${API_BASE}/api/v1/career/question`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.detail?.message ||
        data?.message ||
        "Failed to get response from CIE"
    );
  }

  return data;
}

export async function getStudentProfile(studentId: string) {
  const response = await fetch(
    `${API_BASE}/api/v1/students/${studentId}/profile`
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || "Failed to load student profile");
  }

  return data;
}

export async function updateStudentProfile(
  studentId: string,
  profile: StudentProfile
) {
  const response = await fetch(
    `${API_BASE}/api/v1/students/${studentId}/profile`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(profile),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || "Failed to save student profile");
  }

  return data;
}

export type SectionHistoryItemFromApi = {
  id: number;
  student_id: string;
  section: string;
  prompt: string;
  backend_prompt: string;
  response: CieApiResponse;
  created_at: string | null;
};

export async function saveSectionHistory(payload: {
  student_id: string;
  section: string;
  prompt: string;
  backend_prompt: string;
  response: CieApiResponse;
}) {
  const response = await fetch(`${API_BASE}/api/v1/section-history`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || "Failed to save section history");
  }

  return data;
}

export async function getSectionHistory(
  studentId: string,
  section: string
): Promise<{
  status: string;
  student_id: string;
  section: string;
  history: SectionHistoryItemFromApi[];
}> {
  const response = await fetch(
    `${API_BASE}/api/v1/students/${studentId}/sections/${section}/history`
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || "Failed to load section history");
  }

  return data;
}

export type ResumeMetadata = {
  id: number;
  student_id: string;
  original_filename: string;
  content_type?: string | null;
  size_bytes: number;
  sha256: string;
  is_active: boolean;
  uploaded_at?: string | null;
};

export async function uploadResume(
  studentId: string,
  file: File
): Promise<{
  status: string;
  message: string;
  student_id: string;
  resume: ResumeMetadata;
  profile: StudentProfile;
}> {
  const formData = new FormData();
  formData.append("resume", file);

  const response = await fetch(
    `${API_BASE}/api/v1/students/${studentId}/resume/upload`,
    {
      method: "POST",
      body: formData,
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.detail ||
        data?.message ||
        "Failed to upload and parse resume"
    );
  }

  return data;
}

export async function getCurrentResume(
  studentId: string
): Promise<{
  status: string;
  student_id: string;
  resume: ResumeMetadata | null;
  message?: string;
}> {
  const response = await fetch(
    `${API_BASE}/api/v1/students/${studentId}/resume`
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || "Failed to load resume metadata");
  }

  return data;
}

export function getResumeDownloadUrl(studentId: string) {
  return `${API_BASE}/api/v1/students/${studentId}/resume/download`;
}

export type ProgressStatus =
  | "not_started"
  | "in_progress"
  | "blocked"
  | "done";

export type ProgressPriority = "low" | "medium" | "high";

export type ProgressTask = {
  id: number;
  timeline_id: number;
  student_id: string;
  title: string;
  notes: string;
  status: ProgressStatus;
  priority: ProgressPriority;
  due_date?: string | null;
  sort_order: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ProgressTimeline = {
  id: number;
  student_id: string;
  title: string;
  description: string;
  start_date?: string | null;
  end_date?: string | null;
  status: ProgressStatus;
  sort_order: number;
  created_at?: string | null;
  updated_at?: string | null;
  tasks: ProgressTask[];
};

export async function getProgressBoard(
  studentId: string
): Promise<{
  status: string;
  student_id: string;
  timelines: ProgressTimeline[];
}> {
  const response = await fetch(
    `${API_BASE}/api/v1/students/${studentId}/progress`
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.detail || "Failed to load progress board.");
  }

  return data;
}

export async function createProgressTimeline(
  studentId: string,
  payload: {
    title: string;
    description: string;
    start_date?: string | null;
    end_date?: string | null;
    status: ProgressStatus;
    sort_order: number;
  }
): Promise<ProgressTimeline> {
  const response = await fetch(
    `${API_BASE}/api/v1/students/${studentId}/progress/timelines`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.detail || "Failed to create timeline.");
  }

  return data;
}

export async function updateProgressTimeline(
  studentId: string,
  timelineId: number,
  payload: Partial<ProgressTimeline>
): Promise<ProgressTimeline> {
  const response = await fetch(
    `${API_BASE}/api/v1/students/${studentId}/progress/timelines/${timelineId}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.detail || "Failed to update timeline.");
  }

  return data;
}

export async function deleteProgressTimeline(
  studentId: string,
  timelineId: number
) {
  const response = await fetch(
    `${API_BASE}/api/v1/students/${studentId}/progress/timelines/${timelineId}`,
    {
      method: "DELETE",
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.detail || "Failed to delete timeline.");
  }

  return data;
}

export async function createProgressTask(
  studentId: string,
  timelineId: number,
  payload: {
    title: string;
    notes: string;
    status: ProgressStatus;
    priority: ProgressPriority;
    due_date?: string | null;
    sort_order: number;
  }
): Promise<ProgressTask> {
  const response = await fetch(
    `${API_BASE}/api/v1/students/${studentId}/progress/timelines/${timelineId}/tasks`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.detail || "Failed to create task.");
  }

  return data;
}

export async function updateProgressTask(
  studentId: string,
  taskId: number,
  payload: Partial<ProgressTask>
): Promise<ProgressTask> {
  const response = await fetch(
    `${API_BASE}/api/v1/students/${studentId}/progress/tasks/${taskId}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.detail || "Failed to update task.");
  }

  return data;
}

export async function deleteProgressTask(
  studentId: string,
  taskId: number
) {
  const response = await fetch(
    `${API_BASE}/api/v1/students/${studentId}/progress/tasks/${taskId}`,
    {
      method: "DELETE",
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.detail || "Failed to delete task.");
  }

  return data;
}
