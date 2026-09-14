"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { BUG_FEATURES } from "@/lib/bugReport";

/* The "Report a bug" form. Loaded on demand by ReportBug.tsx, so it costs the landing page nothing. */
export default function ReportBugDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [name, setName] = useState("");
  const [feature, setFeature] = useState<(typeof BUG_FEATURES)[number]>(BUG_FEATURES[0]);
  const [comment, setComment] = useState("");
  const [website, setWebsite] = useState(""); // honeypot, never shown
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = comment.trim().length >= 10 && !sending;

  const submit = async () => {
    if (!ready) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/bug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, feature, comment, website, page: typeof location !== "undefined" ? location.pathname : "" }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "We couldn't send your report right now. Please try again in a moment.");
        return;
      }
      toast.success(data.message ?? "Thanks — your report has been sent.");
      setComment("");
      onOpenChange(false);
    } catch {
      setError("We couldn't send your report. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Report a bug"
      description="Tell us what went wrong and we'll look into it. Your CV is not sent — only what you type here."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={sending} disabled={!ready}>
            Send report
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Your name" optional>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="So we can follow up if needed" autoComplete="name" />}
        </Field>
        <Field label="Which part had the problem?">
          {(p) => (
            <Select {...p} value={feature} onChange={(e) => setFeature(e.target.value as (typeof BUG_FEATURES)[number])}>
              {BUG_FEATURES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="What happened?" hint="What you did, what you expected, and what you saw instead." error={error ?? undefined}>
          {(p) => <Textarea {...p} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} rows={4} placeholder="e.g. After importing my PDF, the Skills section was empty." autoFocus />}
        </Field>
        {/* Honeypot for bots: hidden from people and screen readers */}
        <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      </form>
    </Dialog>
  );
}
