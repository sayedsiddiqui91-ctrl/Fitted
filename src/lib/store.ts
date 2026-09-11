"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { del, get, set } from "idb-keyval";
import { clone, uid } from "@/lib/utils";
import { newCV } from "@/lib/cv/defaults";
import type { Application, CVDoc } from "@/lib/cv/schema";
import type { EngineKind, OptimizeSession } from "@/lib/ai/types";
import type { PdfEdit } from "@/lib/pdf/types";

/* Local-first persistence: everything lives in the user's browser (IndexedDB).
   Writes are debounced so fast typing doesn't thrash storage. */

const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();
const idbStorage: StateStorage = {
  getItem: async (name) => {
    try {
      return (await get<string>(name)) ?? null;
    } catch {
      return typeof localStorage !== "undefined" ? localStorage.getItem(name) : null;
    }
  },
  setItem: (name, value) => {
    const prev = pendingWrites.get(name);
    if (prev) clearTimeout(prev);
    pendingWrites.set(
      name,
      setTimeout(async () => {
        pendingWrites.delete(name);
        try {
          await set(name, value);
        } catch {
          try {
            localStorage.setItem(name, value);
          } catch {
            /* storage full or unavailable — nothing more we can do */
          }
        }
      }, 250),
    );
  },
  removeItem: async (name) => {
    try {
      await del(name);
    } catch {
      localStorage.removeItem(name);
    }
  },
};

/* ───────── Undo / redo (in-memory, per CV) ───────── */
type Snapshot = Pick<CVDoc, "content" | "layout" | "design">;
interface History {
  past: Snapshot[];
  future: Snapshot[];
  lastPush: number;
}
const histories = new Map<string, History>();
const HISTORY_LIMIT = 80;
const COALESCE_MS = 900;
const snap = (d: CVDoc): Snapshot => clone({ content: d.content, layout: d.layout, design: d.design });

/** An uploaded PDF being quick-edited. The original bytes live in IndexedDB (storage.ts) and are never modified. */
export interface PdfDoc {
  id: string;
  name: string;
  fileName: string;
  createdAt: number;
  updatedAt: number;
  pages: number;
  kind: "text" | "scanned";
  edits: PdfEdit[];
  ocrDone: boolean;
  cvId: string | null;
}

export interface Settings {
  aiEngine: "auto" | "local";
  onboarded: boolean;
  seenOptimizeHint: boolean;
}

interface State {
  cvs: Record<string, CVDoc>;
  applications: Record<string, Application>;
  sessions: Record<string, OptimizeSession>;
  pdfs: Record<string, PdfDoc>;
  settings: Settings;
  historyTick: number;

  createPdfDoc: (meta: Omit<PdfDoc, "createdAt" | "updatedAt" | "edits" | "ocrDone" | "cvId">) => void;
  updatePdfDoc: (id: string, patch: Partial<PdfDoc>) => void;
  deletePdfDoc: (id: string) => PdfDoc | null;
  restorePdfDoc: (doc: PdfDoc) => void;

  createCV: (partial?: Partial<CVDoc>) => string;
  updateCV: (id: string, recipe: (draft: CVDoc) => void, opts?: { history?: boolean }) => void;
  duplicateCV: (id: string, overrides?: Partial<CVDoc>) => string | null;
  renameCV: (id: string, name: string) => void;
  deleteCV: (id: string) => CVDoc | null;
  restoreCV: (doc: CVDoc) => void;
  undo: (id: string) => void;
  redo: (id: string) => void;
  canUndo: (id: string) => boolean;
  canRedo: (id: string) => boolean;

  saveSession: (session: OptimizeSession) => void;
  patchSession: (cvId: string, patch: Partial<OptimizeSession>) => void;
  clearSession: (cvId: string) => void;

  upsertApplication: (app: Partial<Application> & { company: string; title: string }) => string;
  deleteApplication: (id: string) => Application | null;
  restoreApplication: (app: Application) => void;

  updateSettings: (patch: Partial<Settings>) => void;
  importBackup: (data: unknown) => { cvs: number; applications: number };
  clearAll: () => void;
}

export const useStore = create<State>()(
  persist(
    (setState, getState) => ({
      cvs: {},
      applications: {},
      sessions: {},
      pdfs: {},
      settings: { aiEngine: "auto", onboarded: false, seenOptimizeHint: false },
      historyTick: 0,

      createPdfDoc: (meta) => {
        const now = Date.now();
        setState((s) => ({ pdfs: { ...s.pdfs, [meta.id]: { ...meta, createdAt: now, updatedAt: now, edits: [], ocrDone: false, cvId: null } } }));
      },
      updatePdfDoc: (id, patch) =>
        setState((s) => (s.pdfs[id] ? { pdfs: { ...s.pdfs, [id]: { ...s.pdfs[id], ...patch, updatedAt: Date.now() } } } : {})),
      deletePdfDoc: (id) => {
        const doc = getState().pdfs[id] ?? null;
        setState((s) => {
          const pdfs = { ...s.pdfs };
          delete pdfs[id];
          return { pdfs };
        });
        return doc;
      },
      restorePdfDoc: (doc) => setState((s) => ({ pdfs: { ...s.pdfs, [doc.id]: doc } })),

      createCV: (partial) => {
        const doc = newCV(partial);
        setState((s) => ({ cvs: { ...s.cvs, [doc.id]: doc } }));
        return doc.id;
      },

      updateCV: (id, recipe, opts = { history: true }) => {
        const current = getState().cvs[id];
        if (!current) return;
        if (opts.history !== false) {
          const h = histories.get(id) ?? { past: [], future: [], lastPush: 0 };
          const now = Date.now();
          if (now - h.lastPush > COALESCE_MS) {
            h.past.push(snap(current));
            if (h.past.length > HISTORY_LIMIT) h.past.shift();
          }
          h.lastPush = now;
          h.future = [];
          histories.set(id, h);
        }
        const draft = clone(current);
        recipe(draft);
        draft.updatedAt = Date.now();
        setState((s) => ({ cvs: { ...s.cvs, [id]: draft }, historyTick: s.historyTick + 1 }));
      },

      duplicateCV: (id, overrides) => {
        const src = getState().cvs[id];
        if (!src) return null;
        const now = Date.now();
        const copy: CVDoc = {
          ...clone(src),
          id: uid("cv"),
          name: `${src.name} (copy)`,
          createdAt: now,
          updatedAt: now,
          ...overrides,
        };
        setState((s) => ({ cvs: { ...s.cvs, [copy.id]: copy } }));
        return copy.id;
      },

      renameCV: (id, name) => getState().updateCV(id, (d) => void (d.name = name.trim() || "Untitled CV"), { history: false }),

      deleteCV: (id) => {
        const doc = getState().cvs[id] ?? null;
        if (!doc) return null;
        setState((s) => {
          const cvs = { ...s.cvs };
          delete cvs[id];
          // Orphaned versions become standalone; the original is never silently changed.
          for (const k of Object.keys(cvs)) if (cvs[k].parentId === id) cvs[k] = { ...cvs[k], parentId: doc.parentId };
          const sessions = { ...s.sessions };
          delete sessions[id];
          return { cvs, sessions };
        });
        histories.delete(id);
        return doc;
      },

      restoreCV: (doc) => setState((s) => ({ cvs: { ...s.cvs, [doc.id]: doc } })),

      undo: (id) => {
        const h = histories.get(id);
        const cur = getState().cvs[id];
        if (!h || !h.past.length || !cur) return;
        const prev = h.past.pop()!;
        h.future.push(snap(cur));
        h.lastPush = 0;
        setState((s) => ({
          cvs: { ...s.cvs, [id]: { ...cur, ...clone(prev), updatedAt: Date.now() } },
          historyTick: s.historyTick + 1,
        }));
      },
      redo: (id) => {
        const h = histories.get(id);
        const cur = getState().cvs[id];
        if (!h || !h.future.length || !cur) return;
        const next = h.future.pop()!;
        h.past.push(snap(cur));
        h.lastPush = 0;
        setState((s) => ({
          cvs: { ...s.cvs, [id]: { ...cur, ...clone(next), updatedAt: Date.now() } },
          historyTick: s.historyTick + 1,
        }));
      },
      canUndo: (id) => (histories.get(id)?.past.length ?? 0) > 0,
      canRedo: (id) => (histories.get(id)?.future.length ?? 0) > 0,

      saveSession: (session) => setState((s) => ({ sessions: { ...s.sessions, [session.cvId]: session } })),
      patchSession: (cvId, patch) =>
        setState((s) => {
          const cur = s.sessions[cvId];
          if (!cur) return {};
          return { sessions: { ...s.sessions, [cvId]: { ...cur, ...patch, updatedAt: Date.now() } } };
        }),
      clearSession: (cvId) =>
        setState((s) => {
          const sessions = { ...s.sessions };
          delete sessions[cvId];
          return { sessions };
        }),

      upsertApplication: (app) => {
        const now = Date.now();
        const id = app.id ?? uid("app");
        const prev = getState().applications[id];
        const next: Application = {
          id,
          company: app.company,
          title: app.title,
          link: app.link ?? prev?.link ?? "",
          dateApplied: app.dateApplied ?? prev?.dateApplied ?? "",
          cvId: app.cvId ?? prev?.cvId ?? null,
          status: app.status ?? prev?.status ?? "saved",
          notes: app.notes ?? prev?.notes ?? "",
          createdAt: prev?.createdAt ?? now,
          updatedAt: now,
        };
        setState((s) => ({ applications: { ...s.applications, [id]: next } }));
        return id;
      },
      deleteApplication: (id) => {
        const app = getState().applications[id] ?? null;
        setState((s) => {
          const applications = { ...s.applications };
          delete applications[id];
          return { applications };
        });
        return app;
      },
      restoreApplication: (app) => setState((s) => ({ applications: { ...s.applications, [app.id]: app } })),

      updateSettings: (patch) => setState((s) => ({ settings: { ...s.settings, ...patch } })),

      importBackup: (data) => {
        const d = data as { cvs?: Record<string, CVDoc>; applications?: Record<string, Application> };
        if (!d || typeof d !== "object" || (!d.cvs && !d.applications)) throw new Error("invalid backup");
        const cvs = d.cvs ?? {};
        const applications = d.applications ?? {};
        setState((s) => ({ cvs: { ...s.cvs, ...cvs }, applications: { ...s.applications, ...applications } }));
        return { cvs: Object.keys(cvs).length, applications: Object.keys(applications).length };
      },

      clearAll: () => {
        histories.clear();
        setState({ cvs: {}, applications: {}, sessions: {}, pdfs: {}, settings: { aiEngine: "auto", onboarded: false, seenOptimizeHint: false } });
      },
    }),
    {
      name: "fitted-store-v1",
      version: 1,
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ cvs: s.cvs, applications: s.applications, sessions: s.sessions, pdfs: s.pdfs, settings: s.settings }),
    },
  ),
);

/* ───────── Hydration helper ───────── */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (useStore.persist.hasHydrated()) setHydrated(true);
    const unsub = useStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, []);
  return hydrated;
}

export function useCV(id: string | undefined): CVDoc | undefined {
  return useStore((s) => (id ? s.cvs[id] : undefined));
}

/** All CVs in the same version family (root + tailored versions). */
export function familyOf(cvs: Record<string, CVDoc>, id: string): CVDoc[] {
  let root = cvs[id];
  const seen = new Set<string>();
  while (root?.parentId && cvs[root.parentId] && !seen.has(root.id)) {
    seen.add(root.id);
    root = cvs[root.parentId];
  }
  if (!root) return [];
  const out: CVDoc[] = [root];
  const walk = (pid: string) => {
    for (const d of Object.values(cvs).sort((a, b) => a.createdAt - b.createdAt)) {
      if (d.parentId === pid && !out.includes(d)) {
        out.push(d);
        walk(d.id);
      }
    }
  };
  walk(root.id);
  return out;
}

export type { EngineKind };
