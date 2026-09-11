# Fitted — project notes for Claude

Free AI CV builder + job optimizer. Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4 · Zustand (IndexedDB, local-first) · zod.
See `README.md` for the architecture table.

## Commands
- `npm run dev` — dev server on http://localhost:3000
- `npm test` — tsx test harness (`tests/run.ts`), must stay green
- `npm run typecheck` · `npm run build`

## Non-negotiable product rules (from the owner)
- **Optimize, don't fabricate.** Never invent skills, numbers, tools or achievements. All AI output is validated
  (`src/lib/engine/guard.ts`, `assistantActions.ts`, `sectionValidator.ts`).
- Job-posting metadata (company, location, salary, recruiter) never goes into CV text (`jobMeta.ts`).
- The candidate's own address/contact details never go into summary/bullets (`personalInfo.ts`).
- Never hardcode or expose API keys; `ANTHROPIC_API_KEY` is server-side only (optional — the on-device engine works without it).
- Never show raw errors/stack traces to users.
- Don't rebuild from scratch; fix root causes and add a regression test (`tests/regressions.test.ts`).

## Key areas
- Import: `src/lib/import/*` (PDF reader is column-aware, marks headings by style, matches the original design),
  `src/lib/engine/parseResume.ts` (sections keep original order/titles; a coverage check guarantees nothing is dropped),
  review UI `src/components/app/ImportReview.tsx` (compare with original, re-type sections).
- Summary writer: `src/lib/engine/summaryWriter.ts` (2–3 sentences, 40–60 words, JD overlap + a real experience point).
- Quick PDF edit: `src/lib/pdf/contentStream.ts` + `edit.ts` (real text removal using font glyph widths).
- Templates: `src/lib/cv/templates.ts` → `src/components/cv/CVDocument.tsx` + `src/lib/cv/styles.ts`.
- UI helper `cn()` uses tailwind-merge (a caller's `hidden`/`w-*` must override component defaults).
- Landing CTA: `src/components/ui/liquid-metal-button.tsx` (@paper-design/shaders 0.0.80; tinted with `--accent`).

## Testing notes
- The in-app browser pane often isn't painting: requestAnimationFrame/ResizeObserver/focus don't fire and the live
  CV preview may not mount. Drive the UI with JS and verify logic with `npm test` / tsx scripts.

## Deployment
- GitHub → Vercel (auto-deploys on every push to `main`).
- Known limit on Vercel: server PDF export (`/api/pdf`) needs a local Chrome, so it falls back to the browser's
  print-to-PDF. Fix later with `@sparticuz/chromium` + `puppeteer-core` if needed.
- Scanned-PDF OCR (tesseract.js) downloads its engine from a public CDN the first time.
