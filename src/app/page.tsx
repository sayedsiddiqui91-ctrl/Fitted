import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileSearch,
  FileText,
  GitBranch,
  HelpCircle,
  LayoutTemplate,
  Lock,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  Wand2,
  XCircle,
} from "lucide-react";
import { LandingNav } from "@/components/landing/LandingNav";
import { HeroVisual, TemplateStrip } from "@/components/landing/HeroVisual";
import { Reveal } from "@/components/landing/Reveal";
import { Logo } from "@/components/Brand";

const STEPS = [
  { icon: Upload, title: "Build or import your CV", text: "Start from scratch, a template, or upload your current PDF or DOCX." },
  { icon: FileSearch, title: "Paste a job description", text: "Any job ad, LinkedIn post, internship or graduate program." },
  { icon: Wand2, title: "Optimize your CV", text: "See your match, answer a few questions, review every change." },
  { icon: Download, title: "Download and apply", text: "Export a clean, ATS-friendly PDF. No watermark, no paywall." },
];

const FEATURES = [
  { icon: FileText, title: "Free CV builder", text: "A real editor with live preview, drag-and-drop sections and autosave." },
  { icon: Target, title: "AI job matching", text: "An estimated match score with a clear breakdown of strengths and gaps." },
  { icon: LayoutTemplate, title: "ATS-friendly templates", text: "Clean layouts with real, selectable text that parsers can read." },
  { icon: Sparkles, title: "Job-specific optimization", text: "Tailored summaries, stronger bullets and reordered skills — per job." },
  { icon: Upload, title: "Import or edit a PDF", text: "Import PDF, DOCX or TXT into the builder — or fix a PDF right on the page." },
  { icon: GitBranch, title: "Multiple CV versions", text: "One CV per job, and your original always stays unchanged." },
  { icon: Download, title: "PDF & DOCX export", text: "Professional formatting preserved. Free, forever." },
  { icon: ClipboardCheck, title: "CV quality analysis", text: "Review weak verbs, repetition, length, grammar and ATS issues." },
];

const FAQ = [
  { q: "Is Fitted really free?", a: "Yes. Building, optimizing and downloading your CV is free — no watermarks, no page limits, no “pay to download”." },
  { q: "Will the AI make things up?", a: "No. Fitted follows one rule: optimize, don't fabricate. It only uses facts from your CV. When something might be relevant but isn't clear, it asks you instead of guessing — and it never invents numbers." },
  { q: "Where is my CV stored?", a: "In your browser, on your device. There's no account and we don't sell your data. You can export a backup or delete everything at any time." },
  { q: "Is the match score from a real ATS?", a: "No — and we'll never pretend it is. It's an estimated readiness score based on the job description and your CV: keywords, skills, experience, education and formatting." },
  { q: "Can applicant tracking systems read my CV?", a: "Our ATS-friendly templates use a single column, standard headings and real text (no images or complex tables), which is what parsers handle best." },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-clip">
      <LandingNav />
      <main id="main">
        {/* Hero */}
        <section className="relative">
          <div className="bg-grid pointer-events-none absolute inset-0 -z-10 opacity-60" aria-hidden />
          <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" aria-hidden />
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:pb-24">
            <div>
              <Reveal>
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted shadow-sm">
                  <span className="size-1.5 rounded-full bg-success" aria-hidden /> 100% free · No watermarks · No sign-up
                </span>
              </Reveal>
              <Reveal delay={0.05}>
                <h1 className="mt-6 text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-6xl lg:text-[68px]">
                  Build a better CV.
                  <br />
                  <span className="font-display font-normal italic tracking-[-0.01em] text-accent">Tailored to every job.</span>
                </h1>
              </Reveal>
              <Reveal delay={0.1}>
                <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">Create your CV from scratch, import your old one, or optimize it for any job description — completely free.</p>
              </Reveal>
              <Reveal delay={0.15}>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link href="/app/new" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-[15px] font-medium text-accent-fg shadow-sm transition-colors hover:bg-accent-hover active:scale-[0.98]">
                    Create My CV <ArrowRight className="size-4" aria-hidden />
                  </Link>
                  <Link href="/app/try" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-6 text-[15px] font-medium shadow-sm transition-colors hover:bg-surface-2 active:scale-[0.98]">
                    <Sparkles className="size-4 text-accent" aria-hidden /> Try Job Optimizer
                  </Link>
                </div>
              </Reveal>
              <Reveal delay={0.2}>
                <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
                  {["ATS-friendly templates", "PDF & DOCX export", "Private by default"].map((t) => (
                    <li key={t} className="flex items-center gap-1.5">
                      <CheckCircle2 className="size-4 text-success" aria-hidden /> {t}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
            <HeroVisual />
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-20 border-y border-border bg-surface/60 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal>
              <p className="text-sm font-medium text-accent">How it works</p>
              <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">From blank page to tailored CV in minutes</h2>
            </Reveal>
            <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <Reveal key={s.title} delay={i * 0.06}>
                  <li className="relative h-full rounded-2xl border border-border bg-surface p-6 shadow-sm">
                    <span className="absolute right-5 top-5 font-mono text-xs text-subtle">0{i + 1}</span>
                    <span className="flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-fg">
                      <s.icon className="size-5" aria-hidden />
                    </span>
                    <h3 className="mt-5 text-[15px] font-semibold">{s.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.text}</p>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* Truthfulness */}
        <section className="py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal>
              <blockquote className="mx-auto max-w-3xl text-center">
                <p className="font-display text-3xl italic leading-tight tracking-tight sm:text-5xl">“Your CV should represent you — not an AI-generated version of someone else.”</p>
                <footer className="mt-5 text-sm text-muted">That's why Fitted optimizes, but never fabricates.</footer>
              </blockquote>
            </Reveal>
            <div className="mt-14 grid gap-4 md:grid-cols-3">
              {[
                { icon: ShieldCheck, c: "text-success bg-success-soft", t: "Safe to add", d: "Already supported by your CV. We improve the wording and bring it forward.", ex: "✓ Excel · ✓ Reconciliation" },
                { icon: HelpCircle, c: "text-warning bg-warning-soft", t: "Clarification needed", d: "Something related exists, but isn't clear. We ask — you decide.", ex: "“Have you built financial models?”" },
                { icon: XCircle, c: "text-danger bg-danger-soft", t: "Do not add", d: "Requirements you clearly don't have. We never claim them for you.", ex: "× Power BI · × Python" },
              ].map((x, i) => (
                <Reveal key={x.t} delay={i * 0.08}>
                  <div className="h-full rounded-2xl border border-border bg-surface p-6 shadow-sm">
                    <span className={`flex size-10 items-center justify-center rounded-xl ${x.c}`}>
                      <x.icon className="size-5" aria-hidden />
                    </span>
                    <h3 className="mt-4 font-semibold">{x.t}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{x.d}</p>
                    <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-muted">{x.ex}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal delay={0.1}>
              <div className="mx-auto mt-6 grid max-w-4xl gap-3 rounded-2xl border border-border bg-surface p-5 shadow-sm md:grid-cols-2">
                <div className="rounded-xl bg-surface-2/70 p-4">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-subtle">Original</p>
                  <p className="text-sm text-muted">Responsible for invoice processing and vendor payments.</p>
                </div>
                <div className="rounded-xl border border-success/20 bg-success-soft/50 p-4">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-subtle">Optimized — you accept or reject</p>
                  <p className="text-sm">Managed invoice processing and vendor payments (~100–200 invoices per day).</p>
                  <p className="mt-2 text-xs text-muted">The number came from your answer to a quick question — never from a guess.</p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 border-y border-border bg-surface/60 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal>
              <p className="text-sm font-medium text-accent">Features</p>
              <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">Everything you need. Nothing held back.</h2>
              <p className="mt-3 max-w-xl text-muted">No trial, no locked templates, no surprise paywall when you hit download.</p>
            </Reveal>
            <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f, i) => (
                <Reveal key={f.title} delay={(i % 4) * 0.05} className="bg-surface">
                  <div className="h-full p-6">
                    <f.icon className="size-5 text-accent" aria-hidden />
                    <h3 className="mt-4 text-[15px] font-semibold">{f.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Templates */}
        <section id="templates" className="scroll-mt-20 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-accent">Templates</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Same content. Any design.</h2>
                  <p className="mt-3 max-w-xl text-muted">Switch templates any time — your content never changes. Customize fonts, spacing, margins and accent color.</p>
                </div>
                <Link href="/app/new?mode=template" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
                  Browse templates <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            </Reveal>
            <div className="mt-12">
              <TemplateStrip />
            </div>
          </div>
        </section>

        {/* Privacy */}
        <section id="privacy" className="scroll-mt-20 border-y border-border bg-surface/60 py-20 sm:py-24">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-2">
            <Reveal>
              <span className="flex size-11 items-center justify-center rounded-xl bg-success-soft text-success">
                <Lock className="size-5" aria-hidden />
              </span>
              <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">Your CV is personal. We treat it that way.</h2>
              <p className="mt-3 text-muted">No account needed. Your CVs are stored in your own browser, and you can export or delete everything at any time.</p>
              <Link href="/privacy" className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
                Read our privacy principles <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Reveal>
            <ul className="grid gap-3 sm:grid-cols-2">
              {["You own your CV", "We never sell your data", "Used only to build your CV", "Delete everything in one click"].map((t, i) => (
                <Reveal key={t} delay={i * 0.05}>
                  <li className="flex h-full items-center gap-3 rounded-2xl border border-border bg-surface p-5 text-sm font-medium shadow-sm">
                    <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden /> {t}
                  </li>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <Reveal>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Questions</h2>
            </Reveal>
            <div className="mt-8 divide-y divide-border rounded-2xl border border-border bg-surface">
              {FAQ.map((f) => (
                <details key={f.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium">
                    {f.q}
                    <span className="text-xl leading-none text-subtle transition-transform duration-200 group-open:rotate-45" aria-hidden>
                      +
                    </span>
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-4 pb-20 sm:px-6">
          <Reveal>
            <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-fg px-6 py-14 text-center text-bg sm:py-20">
              <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[600px] -translate-x-1/2 rounded-full bg-accent/40 blur-3xl" aria-hidden />
              <h2 className="relative text-3xl font-semibold tracking-tight sm:text-5xl">Your next application starts here.</h2>
              <p className="relative mx-auto mt-4 max-w-lg opacity-70">Build it once. Tailor it to every job. Always free.</p>
              <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link href="/app/new" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-[15px] font-medium text-accent-fg hover:bg-accent-hover">
                  Create My CV <ArrowRight className="size-4" aria-hidden />
                </Link>
                <Link href="/app/try" className="inline-flex h-12 items-center justify-center rounded-xl border border-white/20 px-6 text-[15px] font-medium hover:bg-white/10">
                  Try Job Optimizer
                </Link>
              </div>
            </div>
          </Reveal>
        </section>
      </main>
      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-muted sm:flex-row sm:px-6">
          <Logo />
          <p>Free CV builder for everyone. Optimize, don't fabricate.</p>
          <nav aria-label="Footer" className="flex gap-4">
            <Link href="/privacy" className="hover:text-fg">
              Privacy
            </Link>
            <Link href="/app" className="hover:text-fg">
              Get started
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
