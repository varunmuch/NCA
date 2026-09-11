type ResultListProps = {
  title: string;
  items?: string[];
};

export function ResultList({ title, items }: ResultListProps) {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
      <h3 className="font-semibold text-slate-100">{title}</h3>

      <ul className="mt-3 space-y-2">
        {items.map((item, index) => (
          <li
            key={index}
            className="rounded-lg bg-slate-900 p-3 text-sm text-slate-300"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
