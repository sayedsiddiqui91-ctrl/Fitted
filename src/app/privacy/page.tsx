import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/Brand";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
            <ArrowLeft className="size-4" aria-hidden /> Home
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy principles</h1>
        <p className="mt-3 text-muted">CVs contain personal information. Here's exactly how Fitted handles yours.</p>
        <div className="mt-10 flex flex-col gap-8 text-[15px] leading-relaxed">
          {[
            ["You own your CV", "Everything you write belongs to you. You can export all your data as a file, or delete it permanently, at any time from Privacy & Data."],
            ["Stored on your device", "Fitted has no accounts. Your CVs, versions and application tracker are saved in your browser's local storage (IndexedDB) on your device. Clearing your browser data removes them — export a backup if you want to keep a copy."],
            ["Files are read in your browser", "When you import a PDF, DOCX or TXT file, it's read in your browser. We don't store the file."],
            ["Enhanced AI (optional)", "If Enhanced AI is enabled on this server and selected in your settings, the CV text or job description needed for a task is sent securely to our AI provider (Anthropic) to generate suggestions. Fitted doesn't store it and it's not used for anything else. Choose “On-device only” to keep everything in your browser."],
            ["PDF export", "To produce a high-quality PDF, your rendered CV is sent to our server, converted in memory and returned immediately. It is never stored or logged. If that fails, your browser's print dialog is used instead."],
            ["Editing an existing PDF", "PDFs you upload to Edit PDF are read and edited entirely in your browser. The original file is stored on your device, unchanged, so you can always go back to it; edited copies are generated on demand."],
            ["Text recognition (OCR)", "For scanned PDFs, text recognition runs on your device. The first time, the recognition engine and English language data are downloaded from a public CDN — your PDF itself is never uploaded."],
            ["We never sell your data", "Not to recruiters, advertisers, data brokers or anyone else. Your CV content isn't used for unrelated purposes."],
            ["Minimal information", "We only ask for what a CV needs. You don't need to include a photo, date of birth, full address or other sensitive details."],
          ].map(([t, d]) => (
            <section key={t}>
              <h2 className="text-lg font-semibold">{t}</h2>
              <p className="mt-1.5 text-muted">{d}</p>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
