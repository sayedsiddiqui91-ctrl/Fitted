"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Cpu, Download, Lock, ShieldCheck, Sparkles, Trash2, Upload, UserX, EyeOff, HeartHandshake } from "lucide-react";
import { useStore } from "@/lib/store";
import { triggerDownload } from "@/lib/export/pdf";
import { deleteAllPdfData } from "@/lib/pdf/storage";
import { cn } from "@/lib/utils";
import { useAIStatus } from "@/components/app/AppShell";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";

export default function SettingsPage() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const cvCount = useStore((s) => Object.keys(s.cvs).length);
  const appCount = useStore((s) => Object.keys(s.applications).length);
  const importBackup = useStore((s) => s.importBackup);
  const clearAll = useStore((s) => s.clearAll);
  const status = useAIStatus();
  const [confirm, setConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportAll = () => {
    const { cvs, applications } = useStore.getState();
    const blob = new Blob([JSON.stringify({ app: "fitted", version: 1, exportedAt: new Date().toISOString(), cvs, applications }, null, 2)], { type: "application/json" });
    triggerDownload(blob, `fitted-backup-${new Date().toISOString().slice(0, 10)}.json`);
    toast.success("Backup downloaded");
  };

  const onImport = async (f?: File) => {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const r = importBackup(data);
      toast.success(`Imported ${r.cvs} CV${r.cvs === 1 ? "" : "s"} and ${r.applications} application${r.applications === 1 ? "" : "s"}`);
    } catch {
      toast.error("That doesn't look like a Fitted backup file.");
    }
  };

  const engines = [
    {
      key: "auto" as const,
      icon: Sparkles,
      title: "Enhanced AI",
      text: "Uses Claude for smarter job analysis, rewrites and interview prep. The CV text involved is sent securely to Anthropic's API to generate suggestions and is not stored by Fitted.",
      disabled: status != null && !status.claude,
      note: status != null && !status.claude ? "Not configured on this server — using on-device AI." : status?.model ? `Model: ${status.model}` : undefined,
    },
    {
      key: "local" as const,
      icon: Cpu,
      title: "On-device only",
      text: "Everything runs in your browser. Your CV never leaves your device. Suggestions are rule-based but still honest and useful.",
      disabled: false,
    },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Privacy & Data</h1>
      <p className="mt-1 text-sm text-muted">Your CV contains personal information. You're in control of it.</p>

      <section className="mt-8">
        <h2 className="mb-3 text-[15px] font-semibold">Our promises</h2>
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {[
            { icon: ShieldCheck, t: "You own your CV", d: "Your content is yours. Export or delete it any time." },
            { icon: EyeOff, t: "We don't sell your data", d: "Never. Not to recruiters, advertisers or anyone." },
            { icon: HeartHandshake, t: "Used only to build your CV", d: "Your content isn't used for unrelated purposes." },
            { icon: UserX, t: "No account required", d: "We don't ask for more personal information than needed." },
          ].map((p) => (
            <li key={p.t} className="flex gap-3 rounded-2xl border border-border bg-surface p-4">
              <p.icon className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
              <div>
                <p className="text-sm font-medium">{p.t}</p>
                <p className="mt-0.5 text-[13px] text-muted">{p.d}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="mb-1 text-[15px] font-semibold">AI engine</h2>
        <p className="mb-3 text-sm text-muted">Both options follow the same rule: optimize, don't fabricate.</p>
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="AI engine">
          {engines.map((e) => {
            const active = e.key === "local" ? settings.aiEngine === "local" : settings.aiEngine === "auto";
            return (
              <button
                key={e.key}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={e.disabled}
                onClick={() => updateSettings({ aiEngine: e.key })}
                className={cn("flex flex-col rounded-2xl border bg-surface p-4 text-left transition-[border-color,box-shadow] disabled:cursor-not-allowed disabled:opacity-60", active && !e.disabled ? "border-accent ring-3 ring-accent/15" : "border-border hover:border-border-strong")}
              >
                <span className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <e.icon className="size-4 text-accent" aria-hidden /> {e.title}
                  </span>
                  {active && !e.disabled && <Check className="size-4 text-accent" aria-hidden />}
                </span>
                <span className="mt-2 text-[13px] leading-relaxed text-muted">{e.text}</span>
                {e.note && <span className="mt-2 text-xs text-subtle">{e.note}</span>}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-1 text-[15px] font-semibold">Your data</h2>
        <p className="mb-3 flex items-center gap-1.5 text-sm text-muted">
          <Lock className="size-3.5" aria-hidden /> Stored only in this browser: {cvCount} CV{cvCount === 1 ? "" : "s"}, {appCount} application{appCount === 1 ? "" : "s"}.
        </p>
        <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-medium">Export a backup</p>
              <p className="text-[13px] text-muted">Download all your CVs as a file. Use it to move to another browser or device.</p>
            </div>
            <Button icon={<Download className="size-4" />} onClick={exportAll} disabled={!cvCount && !appCount}>
              Export
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-medium">Restore from backup</p>
              <p className="text-[13px] text-muted">Adds CVs from a Fitted backup file. Existing CVs are kept.</p>
            </div>
            <Button icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>
              Import
            </Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Import backup file" onChange={(e) => onImport(e.target.files?.[0])} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-medium text-danger">Delete all data</p>
              <p className="text-[13px] text-muted">Permanently removes every CV, version and application from this browser.</p>
            </div>
            <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirm(true)} disabled={!cvCount && !appCount}>
              Delete everything
            </Button>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete all your data?"
        description="This removes all CVs, versions and applications from this browser. This can't be undone — export a backup first if you might need them."
        confirmLabel="Delete everything"
        danger
        onConfirm={() => {
          clearAll();
          void deleteAllPdfData();
          toast.success("All data deleted");
        }}
      />
    </div>
  );
}
