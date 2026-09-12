"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Briefcase, ExternalLink, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { APPLICATION_STATUSES, type Application, type ApplicationStatus } from "@/lib/cv/schema";
import { cn } from "@/lib/utils";
import { Button, IconButton } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/misc";

const STATUS: Record<ApplicationStatus, { label: string; cls: string }> = {
  saved: { label: "Saved", cls: "bg-surface-2 text-muted" },
  applied: { label: "Applied", cls: "bg-accent-soft text-accent-soft-fg" },
  interview: { label: "Interview", cls: "bg-warning-soft text-warning" },
  offer: { label: "Offer", cls: "bg-success-soft text-success" },
  rejected: { label: "Rejected", cls: "bg-danger-soft text-danger" },
};

function StatusSelect({ value, onChange, label }: { value: ApplicationStatus; onChange: (s: ApplicationStatus) => void; label: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as ApplicationStatus)} className={cn("h-8 appearance-none rounded-full border-0 px-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent/30", STATUS[value].cls)}>
      {APPLICATION_STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS[s].label}
        </option>
      ))}
    </select>
  );
}

export default function TrackerPage() {
  const apps = useStore((s) => s.applications);
  const cvs = useStore((s) => s.cvs);
  const upsert = useStore((s) => s.upsertApplication);
  const del = useStore((s) => s.deleteApplication);
  const restore = useStore((s) => s.restoreApplication);
  const [filter, setFilter] = useState<ApplicationStatus | "all">("all");
  const [editing, setEditing] = useState<Partial<Application> | null>(null);

  const list = useMemo(() => Object.values(apps).sort((a, b) => b.updatedAt - a.updatedAt), [apps]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as Record<ApplicationStatus, number>;
    for (const a of list) c[a.status]++;
    return c;
  }, [list]);
  const shown = list.filter((a) => filter === "all" || a.status === filter);

  const remove = (a: Application) => {
    const removed = del(a.id);
    if (removed) toast("Application removed", { action: { label: "Undo", onClick: () => restore(removed) } });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Job Tracker</h1>
          <p className="mt-1 text-sm text-muted">Remember which CV you sent where, and what happened next.</p>
        </div>
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing({ status: "applied", dateApplied: new Date().toISOString().slice(0, 10) })}>
          Add application
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<Briefcase />}
          title="Track your applications"
          description="Save the company, role, link and the exact CV version you used. Totally optional."
          action={
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing({ status: "applied", dateApplied: new Date().toISOString().slice(0, 10) })}>
              Add your first application
            </Button>
          }
        />
      ) : (
        <>
          <div className="scroll-thin -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Filter by status">
            {(["all", ...APPLICATION_STATUSES] as const).map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={filter === s}
                onClick={() => setFilter(s)}
                className={cn("h-8 shrink-0 rounded-full border px-3 text-[13px] font-medium transition-colors", filter === s ? "border-fg bg-fg text-bg" : "border-border bg-surface text-muted hover:text-fg")}
              >
                {s === "all" ? "All" : STATUS[s].label} <span className="ml-0.5 tabular-nums opacity-70">{s === "all" ? list.length : counts[s]}</span>
              </button>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface shadow-sm md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-2/60 text-left text-xs text-subtle">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Company</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 font-medium">Applied</th>
                  <th className="px-4 py-2.5 font-medium">CV version</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((a) => (
                  <tr key={a.id} className="hover:bg-surface-2/40">
                    <td className="px-4 py-3 font-medium">{a.company}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        {a.title}
                        {a.link && (
                          <a href={a.link.startsWith("http") ? a.link : `https://${a.link}`} target="_blank" rel="noopener noreferrer" aria-label={`Open job posting for ${a.title}`} className="text-subtle hover:text-accent">
                            <ExternalLink className="size-3.5" />
                          </a>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted">{a.dateApplied ? new Date(a.dateApplied).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"}</td>
                    <td className="max-w-56 px-4 py-3">
                      {a.cvId && cvs[a.cvId] ? (
                        <Link href={`/app/cv/${a.cvId}`} className="inline-flex max-w-full items-center gap-1.5 truncate text-muted hover:text-accent">
                          <FileText className="size-3.5 shrink-0" aria-hidden />
                          <span className="truncate">{cvs[a.cvId].name}</span>
                        </Link>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusSelect label={`Status for ${a.title} at ${a.company}`} value={a.status} onChange={(s) => upsert({ ...a, status: s })} />
                    </td>
                    <td className="px-2 py-3 text-right">
                      <IconButton label="Edit" size="sm" onClick={() => setEditing(a)}>
                        <Pencil className="size-4" />
                      </IconButton>
                      <IconButton label="Delete" size="sm" onClick={() => remove(a)}>
                        <Trash2 className="size-4" />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!shown.length && <p className="p-8 text-center text-sm text-subtle">No applications with this status.</p>}
          </div>

          {/* Mobile cards */}
          <ul className="flex flex-col gap-2.5 md:hidden">
            {shown.map((a, i) => (
              <motion.li key={a.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{a.title}</p>
                    <p className="truncate text-sm text-muted">{a.company}</p>
                  </div>
                  <StatusSelect label={`Status for ${a.title}`} value={a.status} onChange={(s) => upsert({ ...a, status: s })} />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-subtle">
                  <span>{a.dateApplied ? new Date(a.dateApplied).toLocaleDateString() : "No date"}</span>
                  <div className="flex">
                    <IconButton label="Edit" size="sm" onClick={() => setEditing(a)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton label="Delete" size="sm" onClick={() => remove(a)}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                </div>
              </motion.li>
            ))}
          </ul>
        </>
      )}

      {editing && <ApplicationDialog initial={editing} onClose={() => setEditing(null)} onSave={(a) => upsert(a)} />}
    </div>
  );
}

function ApplicationDialog({ initial, onClose, onSave }: { initial: Partial<Application>; onClose: () => void; onSave: (a: Partial<Application> & { company: string; title: string }) => void }) {
  const cvs = useStore((s) => s.cvs);
  const [form, setForm] = useState<Partial<Application>>(initial);
  const [touched, setTouched] = useState(false);
  const set = (p: Partial<Application>) => setForm((f) => ({ ...f, ...p }));
  const errors = { company: !form.company?.trim() ? "Add the company name." : undefined, title: !form.title?.trim() ? "Add the job title." : undefined };
  const submit = () => {
    setTouched(true);
    if (errors.company || errors.title) return;
    onSave({ ...form, company: form.company!.trim(), title: form.title!.trim() });
    toast.success(initial.id ? "Application updated" : "Application added");
    onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial.id ? "Edit application" : "Add application"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Company" error={touched ? errors.company : undefined}>
          {(p) => <Input {...p} autoFocus value={form.company ?? ""} onChange={(e) => set({ company: e.target.value })} />}
        </Field>
        <Field label="Job title" error={touched ? errors.title : undefined}>
          {(p) => <Input {...p} value={form.title ?? ""} onChange={(e) => set({ title: e.target.value })} />}
        </Field>
        <Field label="Job link" optional className="sm:col-span-2">
          {(p) => <Input {...p} type="url" value={form.link ?? ""} placeholder="https://" onChange={(e) => set({ link: e.target.value })} />}
        </Field>
        <Field label="Date applied" optional>
          {(p) => <Input {...p} type="date" value={form.dateApplied ?? ""} onChange={(e) => set({ dateApplied: e.target.value })} />}
        </Field>
        <Field label="Status">
          {(p) => (
            <Select {...p} value={form.status ?? "saved"} onChange={(e) => set({ status: e.target.value as ApplicationStatus })}>
              {APPLICATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS[s].label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="CV version used" optional className="sm:col-span-2">
          {(p) => (
            <Select {...p} value={form.cvId ?? ""} onChange={(e) => set({ cvId: e.target.value || null })}>
              <option value="">Not specified</option>
              {Object.values(cvs)
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label="Notes" optional className="sm:col-span-2">
          {(p) => <Textarea {...p} rows={2} value={form.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />}
        </Field>
      </form>
    </Dialog>
  );
}
