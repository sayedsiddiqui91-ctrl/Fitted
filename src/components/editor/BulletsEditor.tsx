"use client";

import { useRef } from "react";
import { Lightbulb, Plus, Sparkles, X } from "lucide-react";
import type { Bullet } from "@/lib/cv/schema";
import { newBullet } from "@/lib/cv/defaults";
import { WEAK_PHRASE_RE } from "@/lib/engine/verbs";
import { Textarea } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/Button";
import { DragHandle, SortableList } from "./Sortable";

interface Props {
  bullets: Bullet[];
  onChange: (next: Bullet[]) => void;
  label?: string;
  onAsk?: (bullet: Bullet) => void;
  /** Tells the assistant which bullet the user is working on */
  onFocusBullet?: (bullet: Bullet, index: number) => void;
  placeholder?: string;
}

/** Bullet list editor: Enter adds a bullet, Backspace on empty removes it, drag to reorder, live coaching hints. */
export function BulletsEditor({ bullets, onChange, label = "Bullet points", onAsk, onFocusBullet, placeholder = "Start with an action verb, e.g. “Reconciled 40+ vendor accounts monthly…”" }: Props) {
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const focus = (id: string, atEnd = true) =>
    requestAnimationFrame(() => {
      const el = refs.current.get(id);
      if (!el) return;
      el.focus();
      if (atEnd) el.setSelectionRange(el.value.length, el.value.length);
    });

  const update = (id: string, text: string) => onChange(bullets.map((b) => (b.id === id ? { ...b, text } : b)));
  const insertAfter = (id: string) => {
    const nb = newBullet();
    const i = bullets.findIndex((b) => b.id === id);
    const next = [...bullets];
    next.splice(i + 1, 0, nb);
    onChange(next);
    focus(nb.id);
  };
  const remove = (id: string) => {
    const i = bullets.findIndex((b) => b.id === id);
    onChange(bullets.filter((b) => b.id !== id));
    const prev = bullets[i - 1] ?? bullets[i + 1];
    if (prev) focus(prev.id);
  };

  return (
    <div>
      <p className="mb-2 text-[13px] font-medium text-muted">{label}</p>
      <div className="flex flex-col gap-2">
        <SortableList items={bullets} onReorder={onChange}>
          {(b, handle, i) => {
            const weak = WEAK_PHRASE_RE.test(b.text.trim());
            const long = b.text.trim().split(/\s+/).length > 35;
            return (
              <div className="group">
                <div className="flex items-start gap-1">
                  <DragHandle handle={handle} label={`Reorder bullet ${i + 1}`} className="mt-1.5 size-7" />
                  <Textarea
                    ref={(el) => {
                      if (el) refs.current.set(b.id, el);
                      else refs.current.delete(b.id);
                    }}
                    aria-label={`${label} ${i + 1}`}
                    rows={1}
                    className="min-h-10 py-2"
                    value={b.text}
                    placeholder={i === 0 ? placeholder : "Another achievement or responsibility"}
                    onFocus={() => onFocusBullet?.(b, i)}
                    onChange={(e) => update(b.id, e.target.value.replace(/\n/g, " "))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        insertAfter(b.id);
                      } else if (e.key === "Backspace" && !b.text && bullets.length > 1) {
                        e.preventDefault();
                        remove(b.id);
                      }
                    }}
                  />
                  <div className="mt-1 flex flex-col sm:flex-row">
                    {onAsk && b.text.trim().length > 3 && (
                      <IconButton label="Improve with assistant" size="sm" onClick={() => onAsk(b)} className="text-accent sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                        <Sparkles className="size-4" />
                      </IconButton>
                    )}
                    <IconButton label="Remove bullet" size="sm" onClick={() => remove(b.id)} className="sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                      <X className="size-4" />
                    </IconButton>
                  </div>
                </div>
                {(weak || long) && (
                  <p className="ml-8 mt-1 flex items-center gap-1.5 text-xs text-warning">
                    <Lightbulb className="size-3.5 shrink-0" aria-hidden />
                    {weak ? "Tip: start with an action verb instead (Managed, Built, Reduced…)" : "Tip: this bullet is long — aim for under 30 words"}
                  </p>
                )}
              </div>
            );
          }}
        </SortableList>
      </div>
      <button
        type="button"
        onClick={() => {
          const nb = newBullet();
          onChange([...bullets, nb]);
          focus(nb.id);
        }}
        className="ml-8 mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-accent hover:bg-accent-soft"
      >
        <Plus className="size-4" aria-hidden /> Add bullet
      </button>
    </div>
  );
}
