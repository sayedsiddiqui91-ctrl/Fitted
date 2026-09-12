"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Briefcase, Cpu, FilePen, FileText, ShieldCheck, Sparkles } from "lucide-react";
import { Logo, ThemeToggle } from "@/components/Brand";
import { useHydrated, useStore } from "@/lib/store";
import { getAIStatus, type AIStatus } from "@/lib/ai/client";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/app", label: "My CVs", short: "CVs", icon: FileText, match: (p: string) => p === "/app" || p.startsWith("/app/new") },
  { href: "/app/optimize", label: "Job Optimizer", short: "Optimize", icon: Sparkles, match: (p: string) => p.startsWith("/app/optimize") },
  { href: "/app/pdf", label: "Edit PDF", short: "Edit PDF", icon: FilePen, match: (p: string) => p.startsWith("/app/pdf") },
  { href: "/app/tracker", label: "Job Tracker", short: "Tracker", icon: Briefcase, match: (p: string) => p.startsWith("/app/tracker") },
  { href: "/app/settings", label: "Privacy & Data", short: "Privacy", icon: ShieldCheck, match: (p: string) => p.startsWith("/app/settings") },
];

export function useAIStatus() {
  const [s, setS] = useState<AIStatus | null>(null);
  useEffect(() => {
    getAIStatus().then(setS);
  }, []);
  return s;
}

export function EngineBadge({ compact }: { compact?: boolean }) {
  const status = useAIStatus();
  const pref = useStore((s) => s.settings.aiEngine);
  const claude = status?.claude && pref !== "local";
  return (
    <Link
      href="/app/settings"
      className={cn("flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-fg", compact && "px-2")}
      title="AI engine"
    >
      {claude ? <Sparkles className="size-3.5 text-accent" aria-hidden /> : <Cpu className="size-3.5 text-success" aria-hidden />}
      {!compact && <span>{status == null ? "Checking AI…" : claude ? "Enhanced AI" : "On-device AI · private"}</span>}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/app";
  const hydrated = useHydrated();
  // full-screen workspaces: CV editor/optimizer and the PDF editor
  const focused = /^\/app\/(cv|pdf)\/[^/]+/.test(pathname);

  if (focused) return <>{hydrated ? children : <FullSkeleton />}</>;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface/60 px-3 py-4 backdrop-blur lg:flex">
        <div className="px-2 pb-6">
          <Logo href="/" />
        </div>
        <nav aria-label="Main" className="flex flex-col gap-0.5">
          {NAV.map((n) => {
            const active = n.match(pathname);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors", active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2/60 hover:text-fg")}
              >
                <n.icon className={cn("size-4", active ? "text-accent" : "text-subtle")} aria-hidden />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex items-center justify-between gap-2 px-1">
          <EngineBadge />
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-bg/85 px-4 backdrop-blur-md lg:hidden">
          <Logo href="/" />
          <div className="flex items-center gap-1">
            <EngineBadge compact />
            <ThemeToggle />
          </div>
        </header>
        <main id="main" className="flex-1 pb-24 lg:pb-10">
          {hydrated ? children : <PageSkeleton />}
        </main>
        {/* Mobile bottom nav */}
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
          {NAV.map((n) => {
            const active = n.match(pathname);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-accent" : "text-subtle")}>
                <n.icon className="size-5" aria-hidden />
                {n.short}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8" aria-busy="true" aria-label="Loading">
      <div className="skeleton mb-2 h-8 w-48 rounded-lg" />
      <div className="skeleton mb-8 h-4 w-72 rounded" />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-72 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

function FullSkeleton() {
  return (
    <div className="flex h-dvh flex-col" aria-busy="true" aria-label="Loading editor">
      <div className="h-14 border-b border-border" />
      <div className="grid flex-1 grid-cols-1 gap-6 p-6 lg:grid-cols-[440px_1fr]">
        <div className="skeleton rounded-2xl" />
        <div className="skeleton hidden rounded-2xl lg:block" />
      </div>
    </div>
  );
}
