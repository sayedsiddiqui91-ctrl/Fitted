"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Bug } from "lucide-react";
import { cn } from "@/lib/utils";

const ReportBugDialog = dynamic(() => import("./ReportBugDialog"), { ssr: false });

/* A small, out-of-the-way "Report a bug" button in the bottom-right corner of every page.
   The form is only downloaded on the first click (landing-page budget). */
export function ReportBug() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Inside the app (except the full-screen editors) phones show a bottom nav; sit above it
  const aboveBottomNav = pathname.startsWith("/app") && !/^\/app\/(cv|pdf)\/[^/]+/.test(pathname);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
        aria-label="Report a bug"
        title="Report a bug"
        className={cn(
          "fixed right-3 z-40 flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface/90 px-2.5 text-xs font-medium text-muted shadow-md backdrop-blur transition-colors hover:border-border-strong hover:text-fg sm:right-4 sm:px-3 print:hidden",
          aboveBottomNav ? "bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-4" : "bottom-[calc(0.75rem+env(safe-area-inset-bottom))] sm:bottom-4",
        )}
      >
        <Bug className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">Report a bug</span>
      </button>
      {loaded && <ReportBugDialog open={open} onOpenChange={setOpen} />}
    </>
  );
}
