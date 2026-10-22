"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  GitCompare,
  Lightbulb,
  MessageCircle,
  Search,
  X,
} from "lucide-react";

import { PageHeader } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { CardSkeleton, EmptyState, ErrorNotice } from "@/components/ui/Feedback";
import { Select } from "@/components/ui/Field";
import { api } from "@/lib/api";
import type { CareerSummary, CareersMeta } from "@/types/cie";

import { CareerCard, FamilyIcon } from "./CareerCard";

const MAX_COMPARE = 3;

// Everyday starting points; the search understands words like these.
const SUGGESTED_SEARCHES = ["animals", "computers", "helping kids", "design", "money", "outdoors", "hospital", "building things"];

export function ExploreCareers() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const q = params.get("q") ?? "";
  const family = params.get("family") ?? "";
  const subject = params.get("subject") ?? "";
  const interest = params.get("interest") ?? "";
  const filtering = Boolean(q || family || subject || interest);

  const [meta, setMeta] = useState<CareersMeta | null>(null);
  const [forYou, setForYou] = useState<CareerSummary[] | null>(null);
  const [response, setResponse] = useState<{
    key: string;
    careers: CareerSummary[] | null;
    suggestion: string | null;
    added?: string | null;
    error: string;
  } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(q);
  const [compare, setCompare] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    api.careersMeta().then(setMeta).catch(() => undefined);
    api
      .careersForMe()
      .then((data) => setForYou(data.careers))
      .catch(() => setForYou([]));
  }, []);

  // Results belong to the query that produced them, so a stale response is
  // never shown and "loading" is simply "no response for this query yet".
  const requestKey = JSON.stringify([q, family, subject, interest, attempt]);
  const current = response?.key === requestKey ? response : null;
  const results = current?.careers ?? null;
  const suggestion = current?.suggestion ?? null;
  const added = current?.added ?? null;
  const error = current?.error ?? "";

  // "/" jumps to the search box, like most search-heavy sites.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;

      if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;

    api
      .careers({ q, family, subject, interest })
      .then(
        (data) =>
          !cancelled &&
          setResponse({ key: requestKey, careers: data.careers, suggestion: data.suggestion ?? null, added: data.added ?? null, error: "" })
      )
      .catch(
        (caught) =>
          !cancelled &&
          setResponse({
            key: requestKey,
            careers: null,
            suggestion: null,
            error: caught instanceof Error ? caught.message : "Couldn't load careers.",
          })
      );

    return () => {
      cancelled = true;
    };
  }, [q, family, subject, interest, requestKey]);

  // Debounce typing into the URL so results and history stay in sync.
  useEffect(() => {
    if (query === q) {
      return;
    }

    const timer = window.setTimeout(() => setParam("q", query.trim()), 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());

    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }

    router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`, { scroll: false });
  }

  function clearFilters() {
    setQuery("");
    router.replace(pathname, { scroll: false });
  }

  function toggleCompare(slug: string) {
    setCompare((current) =>
      current.includes(slug)
        ? current.filter((item) => item !== slug)
        : current.length >= MAX_COMPARE
          ? current
          : [...current, slug]
    );
  }

  const familyLabel = useMemo(
    () => meta?.families.find((item) => item.key === family)?.label ?? "",
    [meta, family]
  );

  return (
    <div className="space-y-8 pb-16">
      <PageHeader
        eyebrow="Explore Careers"
        title="What could you do?"
        description="Browse real careers by interest, school subject, or field. Save the ones that spark your curiosity. You don't need to have it all figured out."
        actions={
          <ButtonLink href="/discover" variant="soft" icon={<Lightbulb aria-hidden className="size-4" />}>
            No idea yet? Take the interest quiz
          </ButtonLink>
        }
      />

      {!filtering && forYou && forYou.length > 0 && (
        <section aria-labelledby="for-you">
          <div className="flex items-center gap-2">
            <MessageCircle aria-hidden className="size-5 text-primary" />
            <h2 id="for-you" className="text-lg font-bold">
              Picked for you
            </h2>
          </div>
          <p className="mt-1 text-sm text-ink-muted">Matched to the subjects and interests in your profile. Explore anything, though.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {forYou.slice(0, 6).map((career) => (
              <CareerCard
                key={career.slug}
                career={career}
                reason={career.match_reasons?.[0]}
                compareSelected={compare.includes(career.slug)}
                onCompareToggle={() => toggleCompare(career.slug)}
              />
            ))}
          </div>
        </section>
      )}

      {!filtering && forYou && forYou.length === 0 && (
        <div className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-primary-softer p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-primary-ink">
            <span className="font-semibold">Want personal picks?</span> Add favorite subjects and interests to your profile, or tell your counselor what you enjoy.
          </p>
          <ButtonLink href="/counselor" size="sm" icon={<MessageCircle aria-hidden className="size-4" />}>
            Help me discover
          </ButtonLink>
        </div>
      )}

      <section aria-labelledby="browse">
        <h2 id="browse" className="sr-only">
          Browse all careers
        </h2>

        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5">
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-soft" />
            <label htmlFor="career-search" className="sr-only">
              Search careers
            </label>
            <input
              id="career-search"
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setParam("q", query.trim());
                } else if (event.key === "Escape") {
                  setQuery("");
                  setParam("q", "");
                }
              }}
              placeholder="Search a job, a subject, or something you enjoy"
              autoComplete="off"
              className="h-12 w-full rounded-full border border-line-strong bg-surface pl-11 pr-20 text-ink placeholder:text-ink-soft focus:border-primary focus:outline-none focus:shadow-[var(--shadow-focus)] [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setParam("q", "");
                  searchRef.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2 hover:text-ink"
              >
                <X aria-hidden className="size-4" />
              </button>
            ) : (
              <kbd className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 text-xs text-ink-soft sm:block">
                /
              </kbd>
            )}
          </div>

          {!q && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-semibold text-ink-muted">Try</span>
              {SUGGESTED_SEARCHES.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => {
                    setQuery(term);
                    setParam("q", term);
                  }}
                  className="rounded-full border border-line px-3 py-1 text-sm text-ink-muted hover:border-ink-soft hover:text-ink"
                >
                  {term}
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div>
              <label htmlFor="filter-interest" className="sr-only">
                Interest
              </label>
              <Select id="filter-interest" value={interest} onChange={(event) => setParam("interest", event.target.value)}>
                <option value="">Any interest</option>
                {meta?.interests.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label htmlFor="filter-subject" className="sr-only">
                School subject
              </label>
              <Select id="filter-subject" value={subject} onChange={(event) => setParam("subject", event.target.value)}>
                <option value="">Any school subject</option>
                {meta?.subjects.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label htmlFor="filter-family" className="sr-only">
                Career family
              </label>
              <Select id="filter-family" value={family} onChange={(event) => setParam("family", event.target.value)}>
                <option value="">Any career family</option>
                {meta?.families.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        {!filtering && meta && (
          <div className="scrollbar-none -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {meta.families.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setParam("family", item.key)}
                className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface py-1.5 pl-1.5 pr-3.5 text-sm font-semibold text-ink transition-colors hover:border-primary/30 hover:bg-primary-softer"
              >
                <FamilyIcon family={item.key} size="sm" />
                {item.label}
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-muted" aria-live="polite">
            {results === null
              ? q
                ? "Searching… If it's a career we don't have yet, we'll look it up in the official list."
                : "Searching…"
              : `${results.length} career${results.length === 1 ? "" : "s"}${familyLabel ? ` in ${familyLabel}` : ""}${q ? ", best match first" : ""}`}
            {added && (
              <>
                {" · "}
                <span className="font-semibold text-ink">{added}</span> was just added to the career list from official U.S. Department of Labor data.
              </>
            )}
            {suggestion && (
              <>
                {" · "}Showing results for <span className="font-semibold text-ink">“{suggestion}”</span>
              </>
            )}
          </p>
          {filtering && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              <X aria-hidden className="size-4" /> Clear filters
            </button>
          )}
        </div>

        {error && <ErrorNotice className="mt-4" message={error} onRetry={() => setAttempt((value) => value + 1)} />}

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results === null && !error
            ? Array.from({ length: 6 }).map((_, index) => <CardSkeleton key={index} />)
            : results?.map((career) => (
                <CareerCard
                  key={career.slug}
                  career={career}
                  query={suggestion ?? q}
                  compareSelected={compare.includes(career.slug)}
                  onCompareToggle={() => toggleCompare(career.slug)}
                />
              ))}
        </div>

        {results?.length === 0 && (
          <EmptyState
            className="mt-4"
            icon={<Search aria-hidden className="size-5" />}
            title="No careers match that yet"
            description="Try a different word, or ask your counselor. It can suggest careers that aren't in this list too."
            action={
              <ButtonLink href="/counselor" size="sm" variant="secondary">
                Ask my counselor
              </ButtonLink>
            }
          />
        )}
      </section>

      {meta && (
        <p className="text-xs leading-relaxed text-ink-muted">
          Career information comes from the{" "}
          <a href={meta.source.url} className="underline" target="_blank" rel="noreferrer">
            {meta.source.name}
          </a>{" "}
          by {meta.source.publisher}, used under{" "}
          <a href={meta.source.license_url} className="underline" target="_blank" rel="noreferrer">
            {meta.source.license}
          </a>
          . {meta.source.modifications}
        </p>
      )}

      {compare.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 lg:bottom-6 lg:pl-[264px]">
          <div className="flex w-full max-w-md items-center justify-between gap-3 rounded-full bg-ink py-2 pl-5 pr-2 text-canvas shadow-[var(--shadow-raised)] animate-[var(--animate-fade-up)]">
            <p className="text-sm">
              <span className="font-semibold">{compare.length}</span> of {MAX_COMPARE} selected
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setCompare([])}
                className="rounded-full px-3 py-2 text-sm text-canvas/75 hover:text-canvas"
              >
                Clear
              </button>
              <Link
                href={`/explore/compare?c=${compare.join(",")}`}
                aria-disabled={compare.length < 2}
                className={`inline-flex items-center gap-2 rounded-full bg-canvas px-4 py-2 text-sm font-semibold text-ink ${
                  compare.length < 2 ? "pointer-events-none opacity-50" : "hover:bg-primary-soft"
                }`}
              >
                <GitCompare aria-hidden className="size-4" /> Compare
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
