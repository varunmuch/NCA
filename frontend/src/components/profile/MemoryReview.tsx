"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Brain, Check, FileText, MessageCircle, Pencil, Plus, Trash2, UserRound } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { CardSkeleton, EmptyState, ErrorNotice } from "@/components/ui/Feedback";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import type { StudentFact } from "@/types/cie";

function SourceLabel({ fact }: { fact: StudentFact }) {
  if (fact.source_type === "conversation" && fact.source_id) {
    return (
      <Link href={`/counselor/${fact.source_id}`} className="inline-flex items-center gap-1 hover:text-primary hover:underline">
        <MessageCircle aria-hidden className="size-3" /> From a chat
      </Link>
    );
  }

  if (fact.source_type === "document") {
    return (
      <Link href={`/documents?doc=${fact.source_id}`} className="inline-flex items-center gap-1 hover:text-primary hover:underline">
        <FileText aria-hidden className="size-3" /> From your document
      </Link>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <UserRound aria-hidden className="size-3" /> Added by you
    </span>
  );
}

export function MemoryReview() {
  const toast = useToast();
  const [facts, setFacts] = useState<StudentFact[] | null>(null);
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<StudentFact | null>(null);
  const [editValue, setEditValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [newCategory, setNewCategory] = useState("interests");
  const [newValue, setNewValue] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    return api
      .facts()
      .then((data) => {
        setFacts(data.facts);
        setCategories(data.categories);
        setError("");
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Couldn't load what your counselor remembers."));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function replace(updated: StudentFact) {
    setFacts((current) =>
      (current ?? [])
        .map((fact) => (fact.id === updated.id ? updated : fact))
        .filter((fact) => fact.status !== "dismissed")
    );
  }

  async function setStatus(fact: StudentFact, status: "confirmed" | "dismissed") {
    try {
      replace(await api.updateFact(fact.id, { status }));
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Couldn't update that.", "error");
    }
  }

  async function confirmAll(ids: number[]) {
    setBusy(true);

    try {
      const result = await api.confirmFacts(ids);
      result.facts.forEach(replace);
      toast(`Confirmed ${ids.length} item${ids.length === 1 ? "" : "s"}`);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Couldn't confirm those.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(fact: StudentFact) {
    try {
      await api.deleteFact(fact.id);
      setFacts((current) => (current ?? []).filter((item) => item.id !== fact.id));
      toast("Removed");
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Couldn't remove that.", "error");
    }
  }

  async function saveEdit() {
    if (!editing || !editValue.trim()) {
      return;
    }

    setBusy(true);

    try {
      replace(await api.updateFact(editing.id, { value: editValue.trim(), status: "confirmed" }));
      setEditing(null);
      toast("Corrected");
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Couldn't save that.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!newValue.trim()) {
      return;
    }

    setBusy(true);

    try {
      const fact = await api.addFact(newCategory, newValue.trim());
      setFacts((current) => [fact, ...(current ?? [])]);
      setNewValue("");
      setAdding(false);
      toast("Saved");
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Couldn't save that.", "error");
    } finally {
      setBusy(false);
    }
  }

  const pending = (facts ?? []).filter((fact) => fact.status === "suggested");
  const confirmed = (facts ?? []).filter((fact) => fact.status === "confirmed");

  const grouped = confirmed.reduce<Record<string, StudentFact[]>>((groups, fact) => {
    (groups[fact.category_label] ??= []).push(fact);
    return groups;
  }, {});

  const factRow = (fact: StudentFact, mode: "pending" | "confirmed") => (
    <li key={fact.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2.5 hover:bg-surface-2/70">
      <div className="min-w-0">
        <p className="text-ink">
          {mode === "pending" && <span className="text-ink-muted">{fact.category_label}: </span>}
          <span className="font-medium">{fact.value}</span>
        </p>
        <p className="mt-0.5 text-xs text-ink-muted">
          <SourceLabel fact={fact} />
          {fact.source_excerpt && fact.source_type === "conversation" && <span> · you said “{fact.source_excerpt}”</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {mode === "pending" && (
          <button
            type="button"
            onClick={() => setStatus(fact, "confirmed")}
            className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent-hover"
          >
            <Check aria-hidden className="size-3.5" /> Confirm
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setEditing(fact);
            setEditValue(fact.value);
          }}
          aria-label={`Correct ${fact.value}`}
          className="rounded-full p-2 text-ink-soft hover:bg-surface hover:text-ink"
        >
          <Pencil aria-hidden className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => (mode === "pending" ? setStatus(fact, "dismissed") : remove(fact))}
          aria-label={mode === "pending" ? `Not right: ${fact.value}` : `Remove ${fact.value}`}
          className="rounded-full p-2 text-ink-soft hover:bg-danger-soft hover:text-danger"
        >
          <Trash2 aria-hidden className="size-4" />
        </button>
      </div>
    </li>
  );

  return (
    <section id="memory" aria-labelledby="memory-title" className="scroll-mt-24 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="memory-title" className="font-display text-2xl font-semibold">
            What your counselor remembers
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Your counselor only treats something as true once you confirm it. Correct or remove anything at any time.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setAdding(true)} icon={<Plus aria-hidden className="size-4" />}>
          Add something
        </Button>
      </div>

      {error && <ErrorNotice message={error} onRetry={load} />}
      {facts === null && !error && <CardSkeleton lines={4} />}

      {pending.length > 0 && (
        <Card className="border-accent/30 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold">Waiting for your review ({pending.length})</h3>
              <p className="text-sm text-ink-muted">Noticed in your chats and documents. Is it right?</p>
            </div>
            <Button size="sm" variant="accent" loading={busy} onClick={() => confirmAll(pending.map((fact) => fact.id))}>
              Confirm all
            </Button>
          </div>
          <ul className="mt-3 divide-y divide-line/70">{pending.map((fact) => factRow(fact, "pending"))}</ul>
        </Card>
      )}

      {facts && confirmed.length === 0 && pending.length === 0 && (
        <EmptyState
          icon={<Brain aria-hidden className="size-5" />}
          title="Nothing saved yet"
          description="As you chat, your counselor will ask before remembering things like your grade, favorite subjects, or activities."
        />
      )}

      {confirmed.length > 0 && (
        <Card className="p-5">
          <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
            {Object.entries(grouped).map(([label, items]) => (
              <div key={label}>
                <h3 className="px-3 text-xs font-semibold text-ink-muted">{label}</h3>
                <ul className="mt-1">{items.map((fact) => factRow(fact, "confirmed"))}</ul>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} title="Correct this">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveEdit();
          }}
        >
          <Field label={editing?.category_label ?? "Value"} htmlFor="fact-value">
            <TextInput id="fact-value" value={editValue} onChange={(event) => setEditValue(event.target.value)} maxLength={300} autoFocus />
          </Field>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Save
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={adding} onClose={() => setAdding(false)} title="Tell your counselor something">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <Field label="Type" htmlFor="fact-category">
            <Select id="fact-category" value={newCategory} onChange={(event) => setNewCategory(event.target.value)}>
              {Object.entries(categories).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="What should it remember?" htmlFor="fact-new">
            <TextInput id="fact-new" value={newValue} onChange={(event) => setNewValue(event.target.value)} maxLength={300} autoFocus />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!newValue.trim()}>
              Save
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
