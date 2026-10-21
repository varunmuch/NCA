export type StudentProfile = {
  name: string;
  email?: string | null;
  preferred_name: string;
  grade_level: string;
  school: string;
  country: string;
  favorite_subjects: string[];
  interests: string[];
  hobbies: string[];
  skills: string[];
  strengths: string[];
  activities: string[];
  career_aspiration: string;
  career_status: "" | "have_goal" | "exploring";
  academic_goals: string;
  learning_style: string;
  current_education: string;
  additional_context?: string | null;
  onboarding_completed: boolean;
};

export type MeResponse = {
  display_name: string;
  profile: StudentProfile;
  account: { has_password: boolean; email_verified: boolean };
  is_staff: boolean;
};

export type FactStatus = "confirmed" | "suggested" | "dismissed";

export type StudentFact = {
  id: number;
  category: string;
  category_label: string;
  value: string;
  status: FactStatus;
  source_type: "student" | "conversation" | "document";
  source_id: string | null;
  source_excerpt: string;
  created_at: string | null;
  updated_at: string | null;
};

export type CareerSuggestion = {
  slug: string;
  title: string;
  family: string;
  family_label: string;
  why: string;
};

export type CounselorAction =
  | "build_plan"
  | "explore_careers"
  | "upload_document"
  | "update_profile"
  | "skill_check"
  | "project_ideas"
  | "certificates"
  | "interview_practice"
  | "career_roadmap";

export type ModuleType =
  | "skill_check"
  | "project_ideas"
  | "certificates"
  | "interview_practice"
  | "career_roadmap";

export type MessageMetadata = {
  follow_up_question?: string;
  quick_replies?: string[];
  career_suggestions?: CareerSuggestion[];
  suggested_actions?: CounselorAction[];
  proposed_facts?: StudentFact[];
  module?: { type: ModuleType; result: Record<string, unknown> };
  action?: CounselorAction;
  error?: boolean;
  // Set only in the browser while a reply is still arriving.
  streaming?: boolean;
};

export type ChatMessage = {
  id: number | null;
  role: "user" | "assistant";
  content: string;
  metadata: MessageMetadata;
  created_at: string | null;
};

export type ConversationSummary = {
  id: string;
  title: string;
  is_legacy: boolean;
  created_at: string | null;
  updated_at: string | null;
  preview: string;
};

export type ConversationDetail = ConversationSummary & {
  messages: ChatMessage[];
};

export type CounselorTurnResponse = {
  conversation_id: string;
  conversation_title?: string;
  user_message: ChatMessage;
  assistant_message: ChatMessage;
  error?: string;
};

// Server-sent events from POST /me/counselor/messages/stream.
export type CounselorStreamEvent =
  | { event: "start"; conversation_id: string; user_message: ChatMessage }
  | { event: "delta"; text: string }
  | ({ event: "done" } & CounselorTurnResponse)
  | ({ event: "error" } & CounselorTurnResponse & { error: string });

export type CareerSummary = {
  slug: string;
  title: string;
  family: string;
  family_label: string;
  description: string;
  subjects: string[];
  interests: string[];
  interest_labels: string[];
  job_zone: number | null;
  saved?: boolean;
  match_reasons?: string[];
  match_score?: number;
  match_parts?: Partial<Record<"interests" | "setting" | "subjects" | "training", number>>;
  match_hint?: { field: string; text: string } | null;
  reason?: string;
};

export type CatalogSource = {
  name: string;
  publisher: string;
  license: string;
  license_url: string;
  url: string;
  modifications: string;
};

export type CareerDetail = CareerSummary & {
  onet_code: string;
  tasks: string[];
  knowledge: string[];
  skills: string[];
  preparation: string;
  education_summary: string;
  common_education: { level: string; percent: number }[];
  sample_titles: string[];
  related: string[];
  related_careers: CareerSummary[];
  source_url: string;
  source: CatalogSource;
};

export type CareersMeta = {
  families: { key: string; label: string }[];
  subjects: string[];
  interests: { key: string; label: string }[];
  source: CatalogSource;
  count: number;
};

export type CareerInsights = {
  day_to_day: string;
  connection_to_you: string;
  beginner_experiences: string[];
  alternative_routes: string[];
  questions_to_consider: string[];
};

export type CareerResource = {
  id: string;
  section: "learn" | "programs" | "scholarships" | "college";
  section_label: string;
  title: string;
  url: string;
  description: string;
  tags: string[];
};

export type RoadmapRung = { horizon: string; goal: string; steps: string[] };

export type CareerRoadmapContent = {
  headline: string;
  where_you_are: string;
  first_step: string;
  ladder: RoadmapRung[];
  what_to_learn: { topic: string; why: string; how: string }[];
  high_school_courses: { course: string; kind: string; why: string }[];
  college_majors: { major: string; why: string }[];
  certifications: { name: string; why: string }[];
  online_learning: { topic: string; provider: string; search: string; why: string; url: string }[];
  college_options: { name: string; kind: string; why: string }[];
  picked_resources: { id: string; why: string }[];
};

export type CareerRoadmap = {
  slug: string;
  title: string;
  resources: CareerResource[];
  roadmap: CareerRoadmapContent | null;
  generated_at: string | null;
  timeline_id: number | null;
};

export type DocumentStatus = "processing" | "processed" | "failed";

export type StudentDocument = {
  id: number;
  doc_type: "resume" | "transcript";
  original_filename: string;
  content_type: string | null;
  size_bytes: number;
  status: DocumentStatus;
  extraction_method: string;
  error_message: string;
  uploaded_at: string | null;
  needs_processing: boolean;
  needs_details: boolean;
};

export type DocumentDetail = StudentDocument & {
  extraction: Record<string, unknown> | null;
  text_preview: string;
  facts: StudentFact[];
};

export type PlanMilestone = {
  id: string;
  title: string;
  description: string;
  timeframe: string;
  task_id?: number;
};

export type PlanContent = {
  title: string;
  career_goal: string;
  career_direction: string;
  interests_and_strengths: string[];
  careers_exploring: { slug: string; title: string; why: string }[];
  academic_subjects: { subject: string; why: string }[];
  skills_to_develop: { skill: string; how: string }[];
  projects_and_activities: { title: string; description: string }[];
  learning_opportunities: { title: string; description: string }[];
  high_school_roadmap: { period: string; focus: string; steps: string[] }[];
  education_pathways: { path: string; description: string }[];
  short_term_milestones: PlanMilestone[];
  long_term_goals: string[];
  alternative_pathways: { title: string; description: string }[];
  next_three_actions: string[];
  next_action_task_ids?: number[];
  based_on: string;
};

export type PlanSummary = {
  id: string;
  lineage_id: string;
  version: number;
  title: string;
  career_goal: string;
  status: "draft" | "saved";
  revision_note: string;
  created_at: string | null;
  updated_at: string | null;
};

export type PlanDetail = PlanSummary & {
  content: PlanContent;
  versions: PlanSummary[];
  task_status: Record<string, ProgressStatus>;
  timeline_id: number | null;
};

export type ProgressStatus = "not_started" | "in_progress" | "blocked" | "done";

export type ProgressTask = {
  id: number;
  timeline_id: number;
  title: string;
  notes: string;
  status: ProgressStatus;
  priority: string;
  due_date?: string | null;
  sort_order: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ProgressTimeline = {
  id: number;
  title: string;
  description: string;
  start_date?: string | null;
  end_date?: string | null;
  status: ProgressStatus;
  sort_order: number;
  plan_id: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  tasks: ProgressTask[];
};

export type NextStep = {
  kind: string;
  title: string;
  description: string;
  cta: string;
  href: string;
};

export type HomeDocument = {
  id: number;
  filename: string;
  status: DocumentStatus;
  uploaded_at: string | null;
};

export type HomeSummary = {
  name: string;
  grade_level: string;
  onboarding_completed: boolean;
  next_step: NextStep;
  latest_conversation: ConversationSummary | null;
  careers: CareerSummary[];
  documents: Record<"resume" | "transcript", HomeDocument | null>;
  plan: {
    id: string;
    title: string;
    status: "draft" | "saved";
    career_direction: string;
    next_three_actions: string[];
    updated_at: string | null;
  } | null;
  pending_facts: number;
  roadmaps: RoadmapSummary[];
};

export type RoadmapSummary = {
  slug: string;
  title: string;
  family: string;
  headline: string;
  first_step: string;
  tracked: boolean;
  updated_at: string | null;
};

export type EarlierAnswer = {
  id: number;
  section: string;
  prompt: string;
  response: Record<string, unknown>;
  created_at: string | null;
};

export type InterestQuizResult = {
  scores: Record<string, number>;
  code: string;
  top: { type: string; label: string; description: string; score: number }[];
  shape?: { key: string; title: string; body: string }[];
  preferences?: { settings: string[]; subjects: string[]; training: string };
  taken_at: string | null;
  careers: CareerSummary[];
};

export type QuizChoice = { key: string; text: string };

export type InterestQuiz = {
  activities: { items: { id: string; text: string }[]; scale: string[] };
  tradeoffs: { id: string; a: QuizChoice; b: QuizChoice }[];
  settings: { options: { key: string; label: string }[]; max: number };
  subjects: { options: string[]; max: number };
  training: { key: string; label: string; description: string }[];
  result: InterestQuizResult | null;
};

export type InterestQuizAnswers = {
  activities: Record<string, number>;
  tradeoffs: Record<string, "a" | "b">;
  settings: string[];
  subjects: string[];
  training: string;
};

export type StaffStudentRow = {
  id: string;
  name: string;
  email: string | null;
  grade_level: string;
  career_status: string;
  career_aspiration: string;
  top_interests: string[];
  last_active: string | null;
  active_this_week: boolean;
  messages: number;
  conversations: number;
  plan: "saved" | "draft" | "none";
  tasks_total: number;
  tasks_done: number;
  roadmaps: number;
  saved_careers: number;
  documents: number;
  flags: ("inactive" | "no_direction" | "plan_not_saved" | "document_failed")[];
};

export type StaffStudentDetail = {
  id: string;
  name: string;
  profile: Record<string, string | string[] | null>;
  quiz: InterestQuizResult | null;
  facts: { category: string; value: string }[];
  plan: (PlanSummary & { content: PlanContent }) | null;
  progress: ProgressTimeline[];
  roadmaps: RoadmapSummary[];
  saved_careers: CareerSummary[];
  documents: { id: number; filename: string; doc_type: string; status: string; uploaded_at: string | null }[];
};
