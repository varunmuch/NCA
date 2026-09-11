type QuickActionCardProps = {
  emoji?: string;
  title: string;
  description: string;
  onClick: () => void;
};

export function QuickActionCard({
  title,
  description,
  onClick,
}: QuickActionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group cursor-pointer rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:-translate-y-1 hover:border-teal-200 hover:shadow-xl hover:shadow-slate-200"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-50">
        <div className="h-3 w-3 rounded-full bg-teal-600" />
      </div>

      <h3 className="mt-5 text-lg font-bold text-slate-950">
        {title}
      </h3>

      <p className="mt-3 text-sm leading-6 text-slate-500">
        {description}
      </p>

      <p className="mt-4 text-sm font-semibold text-teal-700">
        Open →
      </p>
    </button>
  );
}
