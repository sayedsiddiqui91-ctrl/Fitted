"use client";

import { MotionConfig } from "motion/react";
import { Tooltip } from "radix-ui";
import { Toaster } from "sonner";
import { CV_CSS } from "@/lib/cv/styles";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ type: "spring", stiffness: 380, damping: 34, mass: 0.8 }}>
      <Tooltip.Provider delayDuration={300}>
        {/* CV template styles (shared by preview, thumbnails and export) */}
        <style dangerouslySetInnerHTML={{ __html: CV_CSS }} />
        {children}
        <Toaster
          position="bottom-center"
          toastOptions={{
            className: "!bg-surface !text-fg !border !border-border !shadow-lg !rounded-xl !font-sans",
            descriptionClassName: "!text-muted",
          }}
        />
      </Tooltip.Provider>
    </MotionConfig>
  );
}
