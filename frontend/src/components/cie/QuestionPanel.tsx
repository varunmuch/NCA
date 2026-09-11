type QuestionPanelProps = {
  question: string;
  setQuestion: (value: string) => void;
  loading: boolean;
  onSubmit: () => void;
};

export function QuestionPanel({
  question,
  setQuestion,
  loading,
  onSubmit,
}: QuestionPanelProps) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">
          Ask CIE
        </p>

        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
          Guided Question
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          Ask a career, project, skills, certification, or interview question.
        </p>
      </div>

      <div className="mt-6">
        <label className="text-sm font-semibold text-slate-700">
          Question
        </label>

        <textarea
          className="mt-2 min-h-36 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-50"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Example: Give me a roadmap to become a Data Engineer."
        />
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={loading}
        className="mt-5 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Thinking..." : "Ask CIE"}
      </button>
    </div>
  );
}
