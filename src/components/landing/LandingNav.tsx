"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Logo, ThemeToggle } from "@/components/Brand";
import { LiquidMetalButton } from "@/components/ui/liquid-metal-button";

export function LandingNav() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    // The CTA is a button (for the animated shader) — prefetch so navigation is instant
    router.prefetch("/app");
  }, [router]);
  return (
    <header className={cn("sticky top-0 z-40 transition-[background-color,border-color,backdrop-filter] duration-200", scrolled ? "border-b border-border bg-bg/80 backdrop-blur-md" : "border-b border-transparent")}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {[
            ["How it works", "#how"],
            ["Features", "#features"],
            ["Templates", "#templates"],
            ["Privacy", "#privacy"],
          ].map(([l, h]) => (
            <a key={h} href={h} className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:text-fg">
              {l}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LiquidMetalButton label="Get started" onClick={() => router.push("/app")} />
        </div>
      </div>
    </header>
  );
}
