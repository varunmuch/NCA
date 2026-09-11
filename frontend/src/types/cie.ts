export type StudentProfile = {
  name: string;
  current_education: string;
  interests: string[];
  hobbies: string[];
  career_aspiration: string;
  skills: string[];
  years_of_experience?: number;
  additional_context?: string;
};

export type CareerQuestionRequest = {
  student_id: string;
  question: string;
  profile?: StudentProfile;
};

export type CareerPathResult = {
  target_role?: string;
  current_stage?: string;
  recommended_next_roles?: string[];
  key_skills_to_build?: string[];
  recommended_projects?: string[];
  recommended_certifications?: string[];
  estimated_progression?: string[];
};

export type ProjectRoadmapResult = {
  project_title?: string;
  project_goal?: string;
  target_role_alignment?: string;
  student_context_used?: string[];
  prerequisite_skills?: string[];
  tools_and_services?: string[];
  architecture_overview?: string;
  implementation_phases?: string[];
  weekly_roadmap?: string[];
  portfolio_deliverables?: string[];
  resume_bullets?: string[];
  github_readme_sections?: string[];
  evaluation_criteria?: string[];
  next_steps_after_project?: string[];
};

export type InterviewPrepResult = {
  target_role?: string;
  interview_type?: string;
  preparation_summary?: string;
  student_context_used?: string[];
  core_topics_to_prepare?: string[];
  technical_questions_to_practice?: string[];
  scenario_questions_to_practice?: string[];
  behavioral_questions_to_practice?: string[];
  project_stories_to_prepare?: string[];
  study_plan?: string[];
  mock_interview_plan?: string[];
  resume_positioning_tips?: string[];
  next_steps?: string[];
};

export type SkillGapResult = {
  target_role?: string;
  current_skill_summary?: string;
  matching_skills?: string[];
  missing_core_skills?: string[];
  missing_tools_or_platforms?: string[];
  priority_learning_order?: string[];
  recommended_projects_to_close_gaps?: string[];
  weekly_skill_plan?: string[];
  certification_alignment?: string[];
  resume_positioning_tips?: string[];
  next_steps?: string[];
};

export type CertificationResult = {
  target_role?: string;
  current_level_summary?: string;
  recommended_first_certification?: string;
  recommended_certifications?: string[];
  certification_order?: string[];
  certification_reasoning?: string[];
  estimated_timeline?: string[];
  preparation_plan?: string[];
  hands_on_practice_needed?: string[];
  project_alignment?: string[];
  resume_positioning_tips?: string[];
  next_steps?: string[];
};

export type CieResult =
  | CareerPathResult
  | ProjectRoadmapResult
  | InterviewPrepResult
  | SkillGapResult
  | CertificationResult;

export type CieApiResponse = {
  status: string;
  student_id: string;
  intent: string;
  question?: string;
  message?: string;
  required_fields?: string[];
  result?: CieResult;
};
