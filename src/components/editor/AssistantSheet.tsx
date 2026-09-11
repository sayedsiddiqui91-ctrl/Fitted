"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { AlertCircle, ArrowRight, ArrowUp, Check, Cpu, MessageSquareText, RotateCcw, ShieldCheck, Sparkles, X } from "lucide-react";
import type { CVDoc } from "@/lib/cv/schema";
import type { AssistantAction, AssistantJobContext, AssistantSelection, ChatMessage } from "@/lib/ai/types";
import { assistantReply } from "@/lib/ai/client";
import { applyAction, findItem, itemLabel, validateAction } from "@/lib/engine/assistantActions";
import { Sheet } from "@/components/ui/Sheet";
import { Button, IconButton } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { cn } from "@/lib/utils";
import type { Update } from "./SectionEditors";

type BulletSection = "experience" | "projects" | "volunteer";
const SECTIONS: BulletSection[] = ["experience", "projects", "volunteer"];
const keyOf = (s: AssistantSelection) => `${s.scope}|${s.section ?? ""}|${s.itemId ?? ""}|${s.bulletId ?? ""}`;
const clip = (s: string, n = 64) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function AssistantSheet({
  open,
  onOpenChange,
  doc,
  update,
  selection,
  setSelection,
  job,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  doc: CVDoc;
  update: Update;
  selection: AssistantSelection;
  setSelection: (s: AssistantSelection) => void;
  job: AssistantJobContext | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Block body on purpose: scrollIntoView() returns a Promise in current browsers, and an
    // implicitly returned Promise is treated by React as a cleanup function → crash.
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  /* Everything the user can point the assistant at */
  const options = useMemo(() => {
    const out: { sel: AssistantSelection; text: string }[] = [
      { sel: { scope: "global", label: "Whole CV" }, text: "Whole CV" },
      { sel: { scope: "section", section: "summary", label: "Summary" }, text: "Summary" },
      { sel: { scope: "section", section: "skills", label: "Skills" }, text: "Skills" },
    ];
    for (const sec of SECTIONS) {
      for (const item of doc.content[sec] as { id: string; bullets: { id: string; text: string }[] }[]) {
        const label = itemLabel(findItem(doc.content, sec, item.id)) || sec;
        out.push({ sel: { scope: "entry", section: sec, itemId: item.id, label }, text: label });
        item.bullets.forEach((b, i) => {
          if (b.text.trim()) out.push({ sel: { scope: "bullet", section: sec, itemId: item.id, bulletId: b.id, label: `${label} — bullet ${i + 1}` }, text: `   ↳ ${clip(b.text)}` });
        });
      }
    }
    return out;
  }, [doc.content]);

  const current = options.find((o) => keyOf(o.sel) === keyOf(selection)) ?? options[0];
  const selectedBulletText = selection.bulletId
    ? (doc.content[selection.section as BulletSection] as { id: string; bullets: { id: string; text: string }[] } [] | undefined)?.find((i) => i.id === selection.itemId)?.bullets.find((b) => b.id === selection.bulletId)?.text
    : undefined;

  const quick =
    current.sel.scope === "bullet"
      ? ["Make this stronger", "Make it shorter", "Does this sound exaggerated?", "Suggest better verbs"]
      : current.sel.scope === "entry"
        ? ["Improve this entry", "Which parts of this entry are weak?", "Make these bullets shorter"]
        : current.sel.section === "summary"
          ? ["Make my summary stronger", "Give me three versions of my summary", "Make it shorter"]
          : job
            ? ["Do I have enough experience for this job?", "Why is my CV match score low?", "Which parts of my CV are weak?", "Improve my experience section"]
            : ["Which parts of my CV are weak?", "Make my summary stronger", "Give me three versions of my summary", "Improve my experience section"];

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    const history: ChatMessage[] = [...messages.filter((m) => !m.error), { role: "user", content: t }];
    setMessages([...messages, { role: "user", content: t }]);
    setInput("");
    setBusy(true);
    try {
      const r = await assistantReply(history, { content: doc.content, design: doc.design, selection: current.sel, job });
      setMessages((ms) => [
        ...ms,
        {
          role: "assistant",
          content: r.result.reply,
          actions: r.result.actions,
          followUps: r.result.followUps,
          note: r.fellBack ? "Enhanced AI couldn't be reached, so the on-device assistant answered." : undefined,
        },
      ]);
    } catch {
      setMessages((ms) => [...ms, { role: "assistant", content: "Something went wrong while connecting to the AI assistant. Please try again.", error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const retryLast = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    setMessages((ms) => {
      const idx = ms.lastIndexOf(lastUser);
      return ms.slice(0, idx);
    });
    void send(lastUser.content);
  };

  const decide = (msgIndex: number, actionIndex: number, a: AssistantAction, verdict: "applied" | "rejected") => {
    if (verdict === "applied") {
      const v = validateAction(a, doc.content);
      if (!v.ok) {
        toast.error("This change can't be applied", { description: v.problem });
        verdict = "rejected";
      } else {
        update((d) => void applyAction(d, v.action));
        toast.success("Applied to your CV", { description: "Undo any time with Ctrl+Z." });
      }
    }
    setMessages((ms) => ms.map((m, i) => (i === msgIndex ? { ...m, actionState: { ...m.actionState, [actionIndex]: verdict } } : m)));
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="CV Assistant"
      description="Understands your CV · never invents experience"
      icon={<MessageSquareText />}
      width="sm:max-w-lg"
      footer={
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            placeholder={current.sel.scope === "global" ? "Ask about your CV…" : `Ask about ${current.sel.label}…`}
            aria-label="Message the assistant"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-[15px] focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15 sm:text-sm"
          />
          <IconButton label="Send" type="submit" variant="secondary" disabled={!input.trim() || busy} className="size-11 rounded-xl border-accent bg-accent text-accent-fg hover:bg-accent-hover disabled:border-border disabled:bg-surface-2 disabled:text-subtle">
            <ArrowUp className="size-4" />
          </IconButton>
        </form>
      }
    >
      <div className="flex flex-col gap-4 p-4">
        <div>
          <label htmlFor="assistant-scope" className="mb-1.5 block text-[13px] font-medium text-muted">
            Context
          </label>
          <Select id="assistant-scope" value={keyOf(current.sel)} onChange={(e) => setSelection(options.find((o) => keyOf(o.sel) === e.target.value)?.sel ?? options[0].sel)}>
            {options.map((o) => (
              <option key={keyOf(o.sel)} value={keyOf(o.sel)}>
                {o.text}
              </option>
            ))}
          </Select>
          {selectedBulletText && <p className="mt-2 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-[13px] leading-relaxed text-muted">{selectedBulletText}</p>}
          {job && (
            <p className="mt-2 text-xs text-subtle">
              Job context: <span className="font-medium text-muted">{[job.title, job.company].filter(Boolean).join(" · ") || "attached job"}</span>
            </p>
          )}
        </div>

        {messages.length === 0 && (
          <div className="rounded-xl border border-border bg-surface-2/40 p-4 text-sm text-muted">
            <p className="flex items-center gap-2 font-medium text-fg">
              <ShieldCheck className="size-4 text-success" aria-hidden /> Optimize, don't fabricate
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed">I read your actual CV{job ? " and the job you're targeting" : ""}. Every change I suggest shows the before and after, and nothing changes until you press Apply. If something is missing, I'll ask — I never invent jobs, skills or numbers.</p>
          </div>
        )}

        <div className="flex flex-col gap-3" aria-live="polite">
          {messages.map((m, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn("flex flex-col", m.role === "user" ? "items-end" : "items-start")}>
              <div
                className={cn(
                  "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                  m.role === "user" ? "rounded-br-md bg-accent text-accent-fg" : m.error ? "rounded-bl-md border border-danger/30 bg-danger-soft" : "rounded-bl-md border border-border bg-surface",
                )}
              >
                {m.error && <AlertCircle className="mb-1 size-4 text-danger" aria-hidden />}
                <p className="whitespace-pre-line">{m.content}</p>
                {m.error && (
                  <Button size="sm" className="mt-2" icon={<RotateCcw className="size-3.5" />} onClick={retryLast}>
                    Retry
                  </Button>
                )}
                {m.note && (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-subtle">
                    <Cpu className="size-3" aria-hidden /> {m.note}
                  </p>
                )}
              </div>

              {m.actions && m.actions.length > 0 && (
                <div className="mt-2 flex w-[92%] flex-col gap-2">
                  {m.actions.map((a, k) => {
                    const state = m.actionState?.[k];
                    return (
                      <div key={k} className={cn("rounded-xl border bg-surface p-3", state === "applied" ? "border-success/40" : "border-border", state === "rejected" && "opacity-60")}>
                        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-subtle">{a.label || a.type}</p>
                        {a.oldText && <p className="text-[13px] text-subtle line-through decoration-danger/40">{a.oldText}</p>}
                        <p className={cn("text-[13px]", a.oldText && "mt-1")}>
                          {a.type === "add_skill" ? "Add skill: " : a.type === "add_bullet" ? "New bullet: " : ""}
                          <span className="rounded bg-success-soft px-0.5 text-fg">{a.newText}</span>
                        </p>
                        <div className="mt-2.5 flex items-center gap-1.5">
                          {state === "applied" ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                              <Check className="size-3.5" aria-hidden /> Applied · Ctrl+Z to undo
                            </span>
                          ) : state === "rejected" ? (
                            <span className="text-xs text-subtle">Dismissed</span>
                          ) : (
                            <>
                              <span className="mr-1 text-xs text-muted">Apply this change?</span>
                              <Button size="sm" variant="primary" icon={<Check className="size-3.5" />} onClick={() => decide(i, k, a, "applied")}>
                                Apply
                              </Button>
                              <Button size="sm" icon={<X className="size-3.5" />} onClick={() => decide(i, k, a, "rejected")}>
                                Reject
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {m.followUps && m.followUps.length > 0 && i === messages.length - 1 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.followUps.map((f) => (
                    <button key={f} type="button" disabled={busy} onClick={() => send(f)} className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-surface px-3 text-xs font-medium text-muted transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50">
                      {f} <ArrowRight className="size-3" aria-hidden />
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          ))}
          {busy && (
            <div className="flex gap-1 px-2 py-1" aria-label="Assistant is thinking">
              {[0, 1, 2].map((i) => (
                <motion.span key={i} className="size-1.5 rounded-full bg-subtle" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />
              ))}
            </div>
          )}
          <div ref={endRef} />
        </div>

        {(messages.length === 0 || messages[messages.length - 1]?.role === "user" || !messages[messages.length - 1]?.followUps?.length) && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs text-subtle">
              <Sparkles className="size-3" aria-hidden /> Try asking
            </p>
            <div className="flex flex-wrap gap-1.5">
              {quick.map((q) => (
                <button key={q} type="button" disabled={busy} onClick={() => send(q)} className="h-8 rounded-full border border-border bg-surface px-3 text-xs font-medium text-muted transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
