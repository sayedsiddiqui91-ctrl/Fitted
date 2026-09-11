# Fitted — free CV builder + job optimizer

Build a CV from scratch, import or edit an existing one, and tailor it to any job description — completely free. **Optimize, don't fabricate.**

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000. No account or API key needed.

Optional: copy `.env.example` to `.env.local` and add `ANTHROPIC_API_KEY` to enable Enhanced AI (Claude). Without it, every AI feature runs on the built-in on-device engine.

```bash
npm test         # assistant, optimizer, templates, PDF editing
npm run typecheck
```

## Architecture

| Layer | Where | Notes |
|---|---|---|
| Data model | `src/lib/cv/schema.ts` | Zod schemas. **Content** is stored separately from **presentation** (`layout`, `design`). |
| Persistence | `src/lib/store.ts` | Zustand + IndexedDB (local-first). Undo/redo, versions, optimizer sessions, tracker, PDF edit docs. |
| Templates | `src/lib/cv/templates.ts` → `src/components/cv/CVDocument.tsx` + `src/lib/cv/styles.ts` | Template **registry** (layout, header, entry, skills style, defaults). One renderer composes it; 18 templates, ATS-friendly ones labelled. |
| AI assistant | `src/lib/engine/assistant.ts`, `assistantActions.ts`, `src/components/editor/AssistantSheet.tsx` | Structured context (CV, selection, job, template). Replies carry **actions** (`replace_summary`, `update_bullet`, `add_bullet`, `add_skill`, `update_headline`) the user must Apply; every action is validated. |
| Job analysis | `src/lib/engine/jobAnalysis.ts`, `jobMeta.ts` | Classifies JD lines into requirements vs. company info vs. job metadata (location, salary, employment type, arrangement, instructions). Metadata never reaches CV content. |
| Job match | `src/lib/engine/match.ts`, `requirements.ts` | Requirement → evidence mapping (matched / partial / missing) and a multi-dimensional **estimated** score. |
| Optimizer | `src/lib/engine/optimize.ts`, `sectionValidator.ts`, `guard.ts` | Section-aware suggestions; truth guard + 9-question section quality check; rejected suggestions shown for transparency. |
| Claude provider | `src/lib/ai/server/claude.ts` | Separate prompt per task, structured outputs, server-side validation of everything returned. |
| Import | `src/lib/import/*`, `src/lib/engine/parseResume.ts`, `src/components/app/ImportReview.tsx` | PDF/DOCX/TXT → structured CV → editable review before saving. PDFs are read column-aware; headings styled like the CV's own become sections. The original's **design** (font, size, spacing, margins, colour, page size, one/two columns, centred header) is matched to the closest template, and section **order and titles** are kept. A coverage check guarantees nothing is dropped (unplaced lines go to "Additional Information"). Scanned PDFs use on-device OCR. |
| Edit PDF | `src/lib/pdf/*`, `src/app/app/pdf/*` | Quick edit rewrites the page content stream (old text is really removed, not covered) and redraws new text; original kept in IndexedDB. Scanned PDFs: in-browser OCR (tesseract.js). Smart CV Edit converts to the builder. |
| Export | `src/lib/export/*`, `src/app/api/pdf/route.ts` | PDF via headless Chrome (vector text) with print fallback; DOCX via `docx`. |

## Truthfulness rules (enforced in code)

- New numbers, tools or skills that aren't in the CV (or stated by the user) are blocked — `guard.ts`, `assistantActions.ts`.
- Job-posting details (company, location, salary, contacts) are blocked from CV text — `jobMeta.ts`, `sectionValidator.ts`.
- Skills the job wants but the CV doesn't show are listed as missing and only added after the user confirms.
