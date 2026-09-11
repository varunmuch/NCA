"use client";

import { useEffect, useMemo, useState } from "react";

import { BrandLogo } from "@/components/layout/BrandLogo";

import {
  createProgressTask,
  createProgressTimeline,
  deleteProgressTask,
  deleteProgressTimeline,
  getProgressBoard,
  type ProgressPriority,
  type ProgressStatus,
  type ProgressTask,
  type ProgressTimeline,
  updateProgressTask,
  updateProgressTimeline,
} from "@/lib/cie-api";

type ProgressTrackerProps = {
  studentId: string;
};

type ModalMode =
  | "create_timeline"
  | "edit_timeline"
  | "delete_timeline"
  | "create_task"
  | "edit_task"
  | "delete_task"
  | null;

type TimelineStats = {
  totalTasks: number;
  doneTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  notStartedTasks: number;
  progress: number;
  displayStatus: ProgressStatus;
};

type OverallStats = {
  totalTasks: number;
  doneTasks: number;
  inProgressTasks: number;
  blockedItems: number;
  notStartedTasks: number;
  progress: number;
};

const statusOptions: {
  value: ProgressStatus;
  label: string;
}[] = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
];

const priorityOptions: {
  value: ProgressPriority;
  label: string;
}[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

function getStatusLabel(status: string) {
  return statusOptions.find((item) => item.value === status)?.label || status;
}

function getStatusClasses(status: string) {
  if (status === "done") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "in_progress") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (status === "blocked") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}

function getPriorityClasses(priority: string) {
  if (priority === "high") {
    return "border-red-100 bg-red-50 text-red-700";
  }

  if (priority === "low") {
    return "border-slate-200 bg-slate-50 text-slate-600";
  }

  return "border-amber-100 bg-amber-50 text-amber-700";
}

function getProgressValueFromStatus(status: string) {
  if (status === "done") {
    return 100;
  }

  if (status === "in_progress") {
    return 50;
  }

  return 0;
}

function getTimelineStats(timeline: ProgressTimeline): TimelineStats {
  const totalTasks = timeline.tasks.length;

  const doneTasks = timeline.tasks.filter(
    (task) => task.status === "done"
  ).length;

  const inProgressTasks = timeline.tasks.filter(
    (task) => task.status === "in_progress"
  ).length;

  const blockedTasks = timeline.tasks.filter(
    (task) => task.status === "blocked"
  ).length;

  const notStartedTasks = timeline.tasks.filter(
    (task) => task.status === "not_started"
  ).length;

  if (totalTasks === 0) {
    return {
      totalTasks,
      doneTasks,
      inProgressTasks,
      blockedTasks,
      notStartedTasks,
      progress: getProgressValueFromStatus(timeline.status),
      displayStatus: timeline.status,
    };
  }

  const totalProgress = timeline.tasks.reduce((total, task) => {
    return total + getProgressValueFromStatus(task.status);
  }, 0);

  let displayStatus: ProgressStatus = "not_started";

  if (blockedTasks > 0) {
    displayStatus = "blocked";
  } else if (doneTasks === totalTasks) {
    displayStatus = "done";
  } else if (inProgressTasks > 0 || doneTasks > 0) {
    displayStatus = "in_progress";
  }

  return {
    totalTasks,
    doneTasks,
    inProgressTasks,
    blockedTasks,
    notStartedTasks,
    progress: Math.round(totalProgress / totalTasks),
    displayStatus,
  };
}

function getOverallStats(timelines: ProgressTimeline[]): OverallStats {
  const timelineStats = timelines.map((timeline) => getTimelineStats(timeline));

  const allTasks = timelines.flatMap((timeline) => timeline.tasks);

  const totalTasks = allTasks.length;

  const doneTasks = allTasks.filter(
    (task) => task.status === "done"
  ).length;

  const inProgressTasks = allTasks.filter(
    (task) => task.status === "in_progress"
  ).length;

  const blockedTaskCount = allTasks.filter(
    (task) => task.status === "blocked"
  ).length;

  const notStartedTasks = allTasks.filter(
    (task) => task.status === "not_started"
  ).length;

  const blockedEmptyTimelineCount = timelines.filter((timeline) => {
    return timeline.tasks.length === 0 && timeline.status === "blocked";
  }).length;

  if (totalTasks > 0) {
    const totalTaskProgress = allTasks.reduce((total, task) => {
      return total + getProgressValueFromStatus(task.status);
    }, 0);

    return {
      totalTasks,
      doneTasks,
      inProgressTasks,
      blockedItems: blockedTaskCount + blockedEmptyTimelineCount,
      notStartedTasks,
      progress: Math.round(totalTaskProgress / totalTasks),
    };
  }

  if (timelineStats.length === 0) {
    return {
      totalTasks: 0,
      doneTasks: 0,
      inProgressTasks: 0,
      blockedItems: 0,
      notStartedTasks: 0,
      progress: 0,
    };
  }

  const totalTimelineProgress = timelineStats.reduce((total, item) => {
    return total + item.progress;
  }, 0);

  return {
    totalTasks: 0,
    doneTasks: 0,
    inProgressTasks: 0,
    blockedItems: blockedEmptyTimelineCount,
    notStartedTasks: 0,
    progress: Math.round(totalTimelineProgress / timelineStats.length),
  };
}

function formatDate(value?: string | null) {
  if (!value) {
    return "No date";
  }

  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ProgressTracker({ studentId }: ProgressTrackerProps) {
  const [timelines, setTimelines] = useState<ProgressTimeline[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedTimeline, setSelectedTimeline] =
    useState<ProgressTimeline | null>(null);
  const [selectedTask, setSelectedTask] = useState<ProgressTask | null>(null);

  const [timelineForm, setTimelineForm] = useState({
    title: "",
    description: "",
    start_date: "",
    end_date: "",
    status: "not_started" as ProgressStatus,
  });

  const [taskForm, setTaskForm] = useState({
    title: "",
    notes: "",
    status: "not_started" as ProgressStatus,
    priority: "medium" as ProgressPriority,
    due_date: "",
  });

  const overallStats = useMemo(() => {
    return getOverallStats(timelines);
  }, [timelines]);

  async function loadProgress() {
    if (!studentId) {
      return;
    }

    setLoading(true);
    setStatusMessage("");

    try {
      const data = await getProgressBoard(studentId);
      setTimelines(data.timelines);
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Failed to load progress."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProgress();
  }, [studentId]);

  function closeModal() {
    setModalMode(null);
    setSelectedTimeline(null);
    setSelectedTask(null);

    setTimelineForm({
      title: "",
      description: "",
      start_date: "",
      end_date: "",
      status: "not_started",
    });

    setTaskForm({
      title: "",
      notes: "",
      status: "not_started",
      priority: "medium",
      due_date: "",
    });
  }

  function openCreateTimelineModal() {
    setTimelineForm({
      title: "",
      description: "",
      start_date: "",
      end_date: "",
      status: "not_started",
    });

    setModalMode("create_timeline");
  }

  function openEditTimelineModal(timeline: ProgressTimeline) {
    setSelectedTimeline(timeline);

    setTimelineForm({
      title: timeline.title,
      description: timeline.description,
      start_date: timeline.start_date || "",
      end_date: timeline.end_date || "",
      status: timeline.status,
    });

    setModalMode("edit_timeline");
  }

  function openDeleteTimelineModal(timeline: ProgressTimeline) {
    setSelectedTimeline(timeline);
    setModalMode("delete_timeline");
  }

  function openCreateTaskModal(timeline: ProgressTimeline) {
    setSelectedTimeline(timeline);

    setTaskForm({
      title: "",
      notes: "",
      status: "not_started",
      priority: "medium",
      due_date: "",
    });

    setModalMode("create_task");
  }

  function openEditTaskModal(timeline: ProgressTimeline, task: ProgressTask) {
    setSelectedTimeline(timeline);
    setSelectedTask(task);

    setTaskForm({
      title: task.title,
      notes: task.notes,
      status: task.status,
      priority: task.priority,
      due_date: task.due_date || "",
    });

    setModalMode("edit_task");
  }

  function openDeleteTaskModal(timeline: ProgressTimeline, task: ProgressTask) {
    setSelectedTimeline(timeline);
    setSelectedTask(task);
    setModalMode("delete_task");
  }

  async function handleCreateTimeline() {
    if (!timelineForm.title.trim()) {
      setStatusMessage("Please enter a timeline title.");
      return;
    }

    setLoading(true);
    setStatusMessage("");

    try {
      await createProgressTimeline(studentId, {
        title: timelineForm.title,
        description: timelineForm.description,
        start_date: timelineForm.start_date || null,
        end_date: timelineForm.end_date || null,
        status: timelineForm.status,
        sort_order: timelines.length,
      });

      closeModal();
      await loadProgress();
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Failed to create timeline."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleEditTimeline() {
    if (!selectedTimeline) {
      return;
    }

    if (!timelineForm.title.trim()) {
      setStatusMessage("Please enter a timeline title.");
      return;
    }

    setLoading(true);
    setStatusMessage("");

    try {
      await updateProgressTimeline(studentId, selectedTimeline.id, {
        title: timelineForm.title,
        description: timelineForm.description,
        start_date: timelineForm.start_date || null,
        end_date: timelineForm.end_date || null,
        status: timelineForm.status,
      });

      closeModal();
      await loadProgress();
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Failed to update timeline."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteTimeline() {
    if (!selectedTimeline) {
      return;
    }

    setLoading(true);
    setStatusMessage("");

    try {
      await deleteProgressTimeline(studentId, selectedTimeline.id);
      closeModal();
      await loadProgress();
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Failed to delete timeline."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateTask() {
    if (!selectedTimeline) {
      return;
    }

    if (!taskForm.title.trim()) {
      setStatusMessage("Please enter a subtask title.");
      return;
    }

    setLoading(true);
    setStatusMessage("");

    try {
      await createProgressTask(studentId, selectedTimeline.id, {
        title: taskForm.title,
        notes: taskForm.notes,
        status: taskForm.status,
        priority: taskForm.priority,
        due_date: taskForm.due_date || null,
        sort_order: selectedTimeline.tasks.length,
      });

      closeModal();
      await loadProgress();
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Failed to create subtask."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleEditTask() {
    if (!selectedTask) {
      return;
    }

    if (!taskForm.title.trim()) {
      setStatusMessage("Please enter a subtask title.");
      return;
    }

    setLoading(true);
    setStatusMessage("");

    try {
      await updateProgressTask(studentId, selectedTask.id, {
        title: taskForm.title,
        notes: taskForm.notes,
        status: taskForm.status,
        priority: taskForm.priority,
        due_date: taskForm.due_date || null,
      });

      closeModal();
      await loadProgress();
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Failed to update subtask."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteTask() {
    if (!selectedTask) {
      return;
    }

    setLoading(true);
    setStatusMessage("");

    try {
      await deleteProgressTask(studentId, selectedTask.id);
      closeModal();
      await loadProgress();
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Failed to delete subtask."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-teal-100 bg-gradient-to-br from-teal-50 via-white to-slate-50 p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <BrandLogo
              variant="shield"
              size="md"
              light={false}
              showText={false}
            />

            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">
              Progress Tracker
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              Career progress timeline
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Track timelines and subtasks together. Progress is calculated
              from subtask status first, so the numbers update consistently
              when tasks are added, edited, completed, blocked, or deleted.
            </p>
          </div>

          <button
            type="button"
            onClick={openCreateTimelineModal}
            className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          >
            Add Timeline
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard
          label="Overall"
          value={`${overallStats.progress}%`}
          subtext={
            overallStats.totalTasks > 0
              ? "based on subtasks"
              : "based on timelines"
          }
        />

        <SummaryCard
          label="Total Subtasks"
          value={String(overallStats.totalTasks)}
          subtext={`${overallStats.doneTasks} done`}
        />

        <SummaryCard
          label="In Progress"
          value={String(overallStats.inProgressTasks)}
          subtext="active subtasks"
        />

        <SummaryCard
          label="Blocked"
          value={String(overallStats.blockedItems)}
          subtext="needs attention"
        />
      </div>

      {statusMessage && (
        <div className="rounded-2xl border border-teal-100 bg-teal-50 p-4 text-sm text-teal-800">
          {statusMessage}
        </div>
      )}

      {loading && timelines.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Loading progress tracker...
        </div>
      ) : timelines.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
          <h3 className="text-xl font-bold text-slate-950">
            No timelines yet
          </h3>

          <p className="mt-2 text-sm text-slate-500">
            Create a timeline for a project, certification, interview plan,
            internship search, or career roadmap.
          </p>

          <button
            type="button"
            onClick={openCreateTimelineModal}
            className="mt-5 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          >
            Create First Timeline
          </button>
        </div>
      ) : (
        <div className="relative space-y-6">
          <div className="absolute left-5 top-3 hidden h-full w-0.5 bg-teal-100 md:block" />

          {timelines.map((timeline, index) => (
            <TimelineCard
              key={timeline.id}
              timeline={timeline}
              timelineNumber={index + 1}
              onEditTimeline={openEditTimelineModal}
              onDeleteTimeline={openDeleteTimelineModal}
              onCreateTask={openCreateTaskModal}
              onEditTask={openEditTaskModal}
              onDeleteTask={openDeleteTaskModal}
            />
          ))}
        </div>
      )}

      <TimelineModal
        mode={modalMode}
        loading={loading}
        timelineForm={timelineForm}
        setTimelineForm={setTimelineForm}
        taskForm={taskForm}
        setTaskForm={setTaskForm}
        selectedTimeline={selectedTimeline}
        selectedTask={selectedTask}
        onClose={closeModal}
        onCreateTimeline={handleCreateTimeline}
        onEditTimeline={handleEditTimeline}
        onDeleteTimeline={handleDeleteTimeline}
        onCreateTask={handleCreateTask}
        onEditTask={handleEditTask}
        onDeleteTask={handleDeleteTask}
      />
    </section>
  );
}

function SummaryCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string;
  subtext: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{subtext}</p>
    </div>
  );
}

function TimelineCard({
  timeline,
  timelineNumber,
  onEditTimeline,
  onDeleteTimeline,
  onCreateTask,
  onEditTask,
  onDeleteTask,
}: {
  timeline: ProgressTimeline;
  timelineNumber: number;
  onEditTimeline: (timeline: ProgressTimeline) => void;
  onDeleteTimeline: (timeline: ProgressTimeline) => void;
  onCreateTask: (timeline: ProgressTimeline) => void;
  onEditTask: (timeline: ProgressTimeline, task: ProgressTask) => void;
  onDeleteTask: (timeline: ProgressTimeline, task: ProgressTask) => void;
}) {
  const stats = getTimelineStats(timeline);

  return (
    <div className="relative md:pl-14">
      <div className="absolute left-0 top-6 hidden h-10 w-10 items-center justify-center rounded-full border-4 border-white bg-slate-900 text-sm font-bold text-white shadow-md md:flex">
        {timelineNumber}
      </div>

      <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={[
                  "rounded-full border px-3 py-1 text-xs font-semibold",
                  getStatusClasses(stats.displayStatus),
                ].join(" ")}
              >
                {getStatusLabel(stats.displayStatus)}
              </span>

              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                {formatDate(timeline.start_date)} -{" "}
                {formatDate(timeline.end_date)}
              </span>
            </div>

            <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">
              {timeline.title}
            </h2>

            {timeline.description ? (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                {timeline.description}
              </p>
            ) : (
              <p className="mt-2 text-sm text-slate-400">
                No description added.
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <SmallMetric label="Done" value={stats.doneTasks} />
              <SmallMetric label="In Progress" value={stats.inProgressTasks} />
              <SmallMetric label="Blocked" value={stats.blockedTasks} />
              <SmallMetric label="Not Started" value={stats.notStartedTasks} />
              <SmallMetric label="Total" value={stats.totalTasks} />
            </div>
          </div>

          <div className="w-full rounded-3xl border border-slate-200 bg-slate-50 p-4 xl:w-72">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">
                Timeline Progress
              </p>

              <p className="text-sm font-bold text-teal-700">
                {stats.progress}%
              </p>
            </div>

            <div className="mt-3 h-2 rounded-full bg-white">
              <div
                className="h-2 rounded-full bg-teal-600 transition-all duration-300"
                style={{ width: `${stats.progress}%` }}
              />
            </div>

            {stats.totalTasks === 0 && (
              <p className="mt-2 text-xs text-slate-500">
                No subtasks yet. This timeline uses its own status for progress.
              </p>
            )}

            {stats.totalTasks > 0 && timeline.status !== stats.displayStatus && (
              <p className="mt-2 text-xs text-slate-500">
                Status is auto-calculated from subtasks.
              </p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onEditTimeline(timeline)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Edit
              </button>

              <button
                type="button"
                onClick={() => onDeleteTimeline(timeline)}
                className="rounded-2xl border border-red-100 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </div>

            <button
              type="button"
              onClick={() => onCreateTask(timeline)}
              className="mt-2 w-full rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Add Subtask
            </button>
          </div>
        </div>

        <div className="mt-6 border-t border-slate-100 pt-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
              Subtasks
            </h3>
          </div>

          {timeline.tasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
              No subtasks yet. Add milestones, checklist items, or weekly tasks
              inside this timeline.
            </div>
          ) : (
            <div className="space-y-3">
              {timeline.tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  timeline={timeline}
                  onEditTask={onEditTask}
                  onDeleteTask={onDeleteTask}
                />
              ))}
            </div>
          )}
        </div>
      </article>
    </div>
  );
}

function SmallMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
      {label}: {value}
    </span>
  );
}

function TaskCard({
  task,
  timeline,
  onEditTask,
  onDeleteTask,
}: {
  task: ProgressTask;
  timeline: ProgressTimeline;
  onEditTask: (timeline: ProgressTimeline, task: ProgressTask) => void;
  onDeleteTask: (timeline: ProgressTimeline, task: ProgressTask) => void;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex-1">
          <div className="flex flex-wrap gap-2">
            <span
              className={[
                "rounded-full border px-3 py-1 text-xs font-semibold",
                getStatusClasses(task.status),
              ].join(" ")}
            >
              {getStatusLabel(task.status)}
            </span>

            <span
              className={[
                "rounded-full border px-3 py-1 text-xs font-semibold capitalize",
                getPriorityClasses(task.priority),
              ].join(" ")}
            >
              {task.priority} priority
            </span>

            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
              Due: {formatDate(task.due_date)}
            </span>
          </div>

          <h4 className="mt-3 text-base font-bold text-slate-950">
            {task.title}
          </h4>

          {task.notes ? (
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {task.notes}
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-400">No notes added.</p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onEditTask(timeline, task)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Edit
          </button>

          <button
            type="button"
            onClick={() => onDeleteTask(timeline, task)}
            className="rounded-2xl border border-red-100 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function TimelineModal({
  mode,
  loading,
  timelineForm,
  setTimelineForm,
  taskForm,
  setTaskForm,
  selectedTimeline,
  selectedTask,
  onClose,
  onCreateTimeline,
  onEditTimeline,
  onDeleteTimeline,
  onCreateTask,
  onEditTask,
  onDeleteTask,
}: {
  mode: ModalMode;
  loading: boolean;
  timelineForm: {
    title: string;
    description: string;
    start_date: string;
    end_date: string;
    status: ProgressStatus;
  };
  setTimelineForm: (value: {
    title: string;
    description: string;
    start_date: string;
    end_date: string;
    status: ProgressStatus;
  }) => void;
  taskForm: {
    title: string;
    notes: string;
    status: ProgressStatus;
    priority: ProgressPriority;
    due_date: string;
  };
  setTaskForm: (value: {
    title: string;
    notes: string;
    status: ProgressStatus;
    priority: ProgressPriority;
    due_date: string;
  }) => void;
  selectedTimeline: ProgressTimeline | null;
  selectedTask: ProgressTask | null;
  onClose: () => void;
  onCreateTimeline: () => void;
  onEditTimeline: () => void;
  onDeleteTimeline: () => void;
  onCreateTask: () => void;
  onEditTask: () => void;
  onDeleteTask: () => void;
}) {
  if (!mode) {
    return null;
  }

  const isTimelineForm =
    mode === "create_timeline" || mode === "edit_timeline";

  const isTaskForm = mode === "create_task" || mode === "edit_task";

  const isDeleteTimeline = mode === "delete_timeline";
  const isDeleteTask = mode === "delete_task";

  let title = "";

  if (mode === "create_timeline") {
    title = "Create timeline";
  } else if (mode === "edit_timeline") {
    title = "Edit timeline";
  } else if (mode === "delete_timeline") {
    title = "Delete timeline";
  } else if (mode === "create_task") {
    title = "Add subtask";
  } else if (mode === "edit_task") {
    title = "Edit subtask";
  } else if (mode === "delete_task") {
    title = "Delete subtask";
  }

  function handlePrimaryAction() {
    if (mode === "create_timeline") {
      onCreateTimeline();
      return;
    }

    if (mode === "edit_timeline") {
      onEditTimeline();
      return;
    }

    if (mode === "delete_timeline") {
      onDeleteTimeline();
      return;
    }

    if (mode === "create_task") {
      onCreateTask();
      return;
    }

    if (mode === "edit_task") {
      onEditTask();
      return;
    }

    if (mode === "delete_task") {
      onDeleteTask();
    }
  }

  const primaryLabel =
    mode === "create_timeline"
      ? "Create Timeline"
      : mode === "edit_timeline"
        ? "Save Timeline"
        : mode === "delete_timeline"
          ? "Delete Timeline"
          : mode === "create_task"
            ? "Add Subtask"
            : mode === "edit_task"
              ? "Save Subtask"
              : "Delete Subtask";

  const isDanger = isDeleteTimeline || isDeleteTask;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-950">{title}</h2>

              <p className="mt-1 text-sm leading-6 text-slate-500">
                {isTimelineForm &&
                  "Add or update a timeline. Timeline status is used only when there are no subtasks yet."}
                {isTaskForm &&
                  `Add or update a subtask inside ${
                    selectedTimeline?.title || "this timeline"
                  }.`}
                {isDeleteTimeline &&
                  "This will delete the timeline and all subtasks inside it."}
                {isDeleteTask && "This will delete only this selected subtask."}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100"
            >
              Close
            </button>
          </div>
        </div>

        <div className="px-6 py-5">
          {isTimelineForm && (
            <div className="space-y-4">
              <div>
                <FieldLabel label="Timeline title" />

                <input
                  value={timelineForm.title}
                  onChange={(event) =>
                    setTimelineForm({
                      ...timelineForm,
                      title: event.target.value,
                    })
                  }
                  placeholder="Example: Senior Data Engineer Roadmap"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-50"
                />
              </div>

              <div>
                <FieldLabel label="Description" />

                <textarea
                  value={timelineForm.description}
                  onChange={(event) =>
                    setTimelineForm({
                      ...timelineForm,
                      description: event.target.value,
                    })
                  }
                  placeholder="Describe the goal of this timeline."
                  className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-50"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel label="Start date" />

                  <input
                    type="date"
                    value={timelineForm.start_date}
                    onChange={(event) =>
                      setTimelineForm({
                        ...timelineForm,
                        start_date: event.target.value,
                      })
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-50"
                  />
                </div>

                <div>
                  <FieldLabel label="End date" />

                  <input
                    type="date"
                    value={timelineForm.end_date}
                    onChange={(event) =>
                      setTimelineForm({
                        ...timelineForm,
                        end_date: event.target.value,
                      })
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-50"
                  />
                </div>
              </div>

              <div>
                <FieldLabel label="Timeline status" />

                <select
                  value={timelineForm.status}
                  onChange={(event) =>
                    setTimelineForm({
                      ...timelineForm,
                      status: event.target.value as ProgressStatus,
                    })
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-50"
                >
                  {statusOptions.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {isTaskForm && (
            <div className="space-y-4">
              <div>
                <FieldLabel label="Subtask title" />

                <input
                  value={taskForm.title}
                  onChange={(event) =>
                    setTaskForm({
                      ...taskForm,
                      title: event.target.value,
                    })
                  }
                  placeholder="Example: Finish AWS Glue hands-on practice"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-50"
                />
              </div>

              <div>
                <FieldLabel label="Notes" />

                <textarea
                  value={taskForm.notes}
                  onChange={(event) =>
                    setTaskForm({
                      ...taskForm,
                      notes: event.target.value,
                    })
                  }
                  placeholder="Add details, blockers, or learning notes."
                  className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-50"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel label="Status" />

                  <select
                    value={taskForm.status}
                    onChange={(event) =>
                      setTaskForm({
                        ...taskForm,
                        status: event.target.value as ProgressStatus,
                      })
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-50"
                  >
                    {statusOptions.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <FieldLabel label="Priority" />

                  <select
                    value={taskForm.priority}
                    onChange={(event) =>
                      setTaskForm({
                        ...taskForm,
                        priority: event.target.value as ProgressPriority,
                      })
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-50"
                  >
                    {priorityOptions.map((priority) => (
                      <option key={priority.value} value={priority.value}>
                        {priority.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <FieldLabel label="Due date" />

                <input
                  type="date"
                  value={taskForm.due_date}
                  onChange={(event) =>
                    setTaskForm({
                      ...taskForm,
                      due_date: event.target.value,
                    })
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-50"
                />
              </div>
            </div>
          )}

          {isDeleteTimeline && selectedTimeline && (
            <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-700">
                Delete "{selectedTimeline.title}"?
              </p>

              <p className="mt-2 text-sm leading-6 text-red-600">
                This action will also remove all subtasks under this timeline.
                This cannot be undone.
              </p>
            </div>
          )}

          {isDeleteTask && selectedTask && (
            <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-700">
                Delete "{selectedTask.title}"?
              </p>

              <p className="mt-2 text-sm leading-6 text-red-600">
                This removes the selected subtask from the timeline.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 px-6 py-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handlePrimaryAction}
            disabled={loading}
            className={[
              "rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50",
              isDanger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-slate-900 hover:bg-slate-800",
            ].join(" ")}
          >
            {loading ? "Saving..." : primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldLabel({ label }: { label: string }) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
    </label>
  );
}
