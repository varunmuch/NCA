"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, HandHeart, MapPin, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import type { ServiceHours } from "@/types/cie";

import { AskButton } from "./SimplePlan";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function niceDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** How many hours, how close to Bright Futures, a log, and places near NeoCity to earn more. */
export function CommunityHours() {
  const toast = useToast();
  const [data, setData] = useState<ServiceHours | null>(null);
  const [failed, setFailed] = useState(false);
  const [hours, setHours] = useState("");
  const [place, setPlace] = useState("");
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .serviceHours()
      .then((result) => live && setData(result))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  async function logHours(event: React.FormEvent) {
    event.preventDefault();
    const amount = Number(hours);

    if (!amount || amount <= 0) {
      toast("Enter how many hours you did.", "error");
      return;
    }

    setBusy(true);

    try {
      setData(await api.logServiceHours({ hours: amount, place, date }));
      toast(`Logged ${amount} hours${place ? ` at ${place}` : ""}. Nice work!`);
      setHours("");
      setPlace("");
      setDate(today());
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't log those hours.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      setData(await api.removeServiceHours(id));
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't remove that entry.", "error");
    }
  }

  function pickPlace(name: string) {
    setPlace(name);
    document.getElementById("log-hours")?.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("service-hours-input")?.focus({ preventScroll: true });
  }

  if (failed) {
    return <p className="text-sm text-ink-muted">We couldn&apos;t load your community hours. Please refresh the page.</p>;
  }

  if (!data) {
    return <div aria-busy className="h-48 animate-pulse rounded-[var(--radius-card)] bg-surface-2" />;
  }

  const top = Math.max(...data.goals.map((goal) => goal.hours), data.total);
  const percent = Math.min((data.total / top) * 100, 100);
  const next = [...data.goals].reverse().find((goal) => !goal.met);

  return (
    <div className="space-y-6">
      {/* Hours so far and the Bright Futures targets */}
      <section aria-labelledby="hours-total" className="rounded-[var(--radius-card)] bg-sunny-soft p-6 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="hours-total" className="text-sm font-semibold text-ink-muted">
              Your community service hours
            </h2>
            <p className="font-display mt-1 text-5xl font-bold text-ink">
              {data.total}
              <span className="ml-2 text-lg font-semibold text-ink-muted">hours</span>
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              {data.source ? `From ${data.source}` : "Add your hours below"}
              {data.logged > 0 ? ` · ${data.logged} logged here` : ""}
              {data.paid_hours ? ` · plus ${data.paid_hours} paid work hours` : ""}
            </p>
          </div>
          <p className="max-w-xs text-sm font-semibold text-ink">
            {next ? `${next.left} more to reach ${next.name.replace(/ \(.*\)/, "")} (${next.hours}).` : "You've met every Bright Futures hours target! 🎉"}
          </p>
        </div>

        <div className="relative mt-6 h-4 rounded-full bg-white">
          <div className="h-4 rounded-full bg-primary transition-[width] duration-700" style={{ width: `${percent}%` }} />
          {data.goals.map((goal) => (
            <span
              key={goal.key}
              aria-hidden
              className="absolute top-0 h-4 w-0.5 bg-ink/30"
              style={{ left: `${Math.min((goal.hours / top) * 100, 100)}%` }}
            />
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-2">
          {data.goals.map((goal) => (
            <li
              key={goal.key}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                goal.met ? "bg-accent-soft text-accent-ink" : "bg-white text-ink-muted"
              }`}
            >
              {goal.met && <CheckCircle2 aria-hidden className="size-3.5" />}
              {goal.name}: {goal.hours} hours{goal.met ? "" : ` (${goal.left} to go)`}
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        {/* Log new hours */}
        <section id="log-hours" aria-labelledby="log-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
          <h2 id="log-title" className="text-lg font-bold text-ink">
            Log hours
          </h2>
          <p className="mt-1 text-sm text-ink-muted">Each entry adds to your total. You can also tell the counselor: &ldquo;I volunteered 3 hours at the library.&rdquo;</p>
          <form onSubmit={logHours} className="mt-4 grid gap-3 sm:grid-cols-[6rem_1fr]">
            <Field label="Hours" htmlFor="service-hours-input">
              <TextInput id="service-hours-input" type="number" min="0.5" max="200" step="0.5" value={hours} onChange={(event) => setHours(event.target.value)} required />
            </Field>
            <Field label="Where" htmlFor="service-place-input">
              <TextInput
                id="service-place-input"
                list="service-places"
                value={place}
                onChange={(event) => setPlace(event.target.value)}
                placeholder="Pick a place or type one"
              />
              <datalist id="service-places">
                {data.places.map((item) => (
                  <option key={item.id} value={item.name} />
                ))}
              </datalist>
            </Field>
            <Field label="Date" htmlFor="service-date-input">
              <TextInput id="service-date-input" type="date" max={today()} value={date} onChange={(event) => setDate(event.target.value)} />
            </Field>
            <div className="flex items-end">
              <Button type="submit" loading={busy} icon={<Plus aria-hidden className="size-4" />} className="w-full sm:w-auto">
                Add hours
              </Button>
            </div>
          </form>

          {data.log.length > 0 && (
            <ul className="mt-5 divide-y divide-line border-t border-line">
              {data.log.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="font-semibold text-ink">{entry.hours} h</span>
                    <span className="text-ink"> · {entry.place}</span>
                    <span className="block text-xs text-ink-muted">{niceDate(entry.date)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(entry.id)}
                    aria-label={`Remove ${entry.hours} hours at ${entry.place}`}
                    className="rounded-full p-2 text-ink-soft hover:bg-danger-soft hover:text-danger"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* How hours count for Bright Futures */}
        <section aria-labelledby="count-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
          <h2 id="count-title" className="text-lg font-bold text-ink">
            Make your hours count for Bright Futures
          </h2>
          <ol className="mt-3 space-y-2 text-sm text-ink">
            {data.district.steps.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary-ink">{index + 1}</span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-ink-muted">{data.district.tip}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={data.district.proposal_form_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary-hover">
              Proposal form (PDF) <ExternalLink aria-hidden className="size-3" />
            </a>
            <a href={data.district.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold text-ink hover:bg-surface-2">
              District guidelines <ExternalLink aria-hidden className="size-3" />
            </a>
          </div>
        </section>
      </div>

      {/* Places near NeoCity */}
      <section aria-labelledby="places-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="places-title" className="text-lg font-bold text-ink">
            Places to earn hours near NeoCity
          </h2>
          <a href={data.district.list_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary-ink hover:underline">
            The district&apos;s full list (PDF)
          </a>
        </div>
        <ul className="mt-3 grid gap-3 md:grid-cols-2">
          {data.places.map((item) => (
            <li key={item.id} className="flex flex-col rounded-[var(--radius-card)] border border-line bg-surface p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-soft text-teal">
                  <HandHeart aria-hidden className="size-5" />
                </span>
                <div className="min-w-0">
                  <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-ink hover:text-primary-ink hover:underline">
                    {item.name} <ExternalLink aria-hidden className="size-3.5 shrink-0" />
                  </a>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
                    <MapPin aria-hidden className="size-3" /> {item.city}
                    {item.on_district_list && <span> · on the district&apos;s list</span>}
                  </p>
                </div>
              </div>
              {item.fits && <p className="mt-3 w-fit rounded-full bg-sunny-soft px-2.5 py-0.5 text-xs font-semibold text-ink">⭐ {item.fits}</p>}
              <p className="mt-2 text-sm leading-relaxed text-ink">{item.what}</p>
              {item.ages && <p className="mt-1 text-xs text-ink-muted">{item.ages}</p>}
              <div className="mt-auto flex flex-wrap gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => pickPlace(item.name)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary-ink hover:bg-primary-soft/70"
                >
                  <Plus aria-hidden className="size-3.5" /> Log hours here
                </button>
                <AskButton question={`Is ${item.name} a good place for me to volunteer? How do I get started?`}>Ask about this place</AskButton>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-muted">
          Ages and details come from each organization&apos;s site and can change, so check their page before you go. Checked {niceDate(data.retrieved)}.
        </p>
      </section>
    </div>
  );
}
