"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "./ui/Button";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path d="M10 8.5h12M10 8.5v15M10 15.5h8.5" stroke="var(--accent-fg)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="22.5" cy="22" r="2.4" fill="var(--accent-fg)" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 rounded-lg text-[17px] font-semibold tracking-tight", className)} aria-label="Fitted home">
      <LogoMark />
      <span>Fitted</span>
    </Link>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("fitted-theme", next ? "dark" : "light");
    } catch {
      /* ignore */
    }
  };
  return (
    <IconButton label={dark ? "Switch to light mode" : "Switch to dark mode"} onClick={toggle} className={className}>
      {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </IconButton>
  );
}
