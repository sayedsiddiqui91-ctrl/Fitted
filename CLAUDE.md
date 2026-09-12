# Fitted — project notes for Claude

Free AI CV builder + job optimizer. Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4 · Zustand (IndexedDB, local-first) · zod.
See `README.md` for the architecture table.

## Picking this up in a new session
Everything needed is in this repository — no chat history required.

```bash
git clone https://github.com/sayedsiddiqui91-ctrl/Fitted.git
cd Fitted && npm install && npm run dev
```

Then open the folder in Claude Code and say what you want changed. Claude reads this file automatically.
A good first message: *"Read CLAUDE.md, run npm test, then <the change>."*

- **No `.env` is needed.** The whole app works on its on-device engine; AI keys are optional and deliberately
  disabled in production (see the rule below).
- **Shipping = pushing.** `git push origin main` and Vercel deploys it. Nothing else to click.
- **Before you push:** `npm test` (must be green), `npm run typecheck`, `npm run build`.
- The owner's standing instruction is to fix root causes and add a regression test, never to rebuild a feature
  from scratch.

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
- **Fitted is free to run.** A key alone must never enable paid AI on a deployed build: production also needs
  `FITTED_ENABLE_CLAUDE=1` (`src/lib/ai/enabled.ts`), so a key left in a hosting dashboard can't bill the owner
  for visitors. `FITTED_DISABLE_CLAUDE=1` is the kill switch.
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
- **Landing page budget.** It is the first thing a phone downloads, so it carries no animation library
  (CSS classes in `globals.css`: `.reveal`, `.anim-*`), one batched Google-Fonts request, lazy template
  thumbnails, and a WebGL CTA that only loads on a capable device. Keep it that way when adding to it.

## Testing notes
- The in-app browser pane often isn't painting: requestAnimationFrame/ResizeObserver/focus don't fire and the live
  CV preview may not mount. Drive the UI with JS and verify logic with `npm test` / tsx scripts.

## Things that were hard to get right (don't undo them)
- **PDF word spacing** (`src/lib/pdf/runs.ts`): some PDFs report glyph widths far too wide, so gaps between
  words measure as zero. The page fits `advance = char x letters + space` from item positions and uses that
  instead whenever text is reported as overlapping. Without it, "SMAC Advisory Ltd" imports as "SMACAdvisoryLtd".
- **Wrapped bullets** (`parseResume.ts`, `DANGLING_END_RE`): a bullet ending on a conjunction continues onto the
  next line, however short or capitalised that line looks — otherwise it becomes a phantom job title.
- **Preview pagination** (`CVPreview.tsx`, `paginate()`): the page-break marker simulates `break-inside: avoid`,
  so it matches the downloaded PDF. A fixed "one page height" marker does not.
- **Only the visible editor panel is mounted below `lg`** (`app/cv/[id]/page.tsx`): a preview that mounts inside a
  `display:none` panel measures 0 wide, renders nothing and never scrolls.
- **Scores are facts**: every count-up animation has a timeout that puts the real number on screen even if
  animation frames never run.

## Deployment
- GitHub → Vercel (auto-deploys on every push to `main`).
- Known limit on Vercel: server PDF export (`/api/pdf`) needs a local Chrome, so it falls back to the browser's
  print-to-PDF. Fix later with `@sparticuz/chromium` + `puppeteer-core` if needed.
- Scanned-PDF OCR (tesseract.js) downloads its engine from a public CDN the first time.
