"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ImagePlus, Trash2, UserRound } from "lucide-react";
import type { CVDoc } from "@/lib/cv/schema";
import { TEMPLATES, templateMeta } from "@/lib/cv/meta";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import type { Update } from "./SectionEditors";

const MAX_BYTES = 10 * 1024 * 1024;
const SIZE = 400;

/** Crops to a centred square (biased upwards for portraits, where faces usually are) and resizes to 400×400 JPEG,
    so the photo stays small — it's stored in the browser together with the CV. */
async function toSquareJpeg(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx || !side) throw new Error("image");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, SIZE, SIZE);
    const sx = (img.naturalWidth - side) / 2;
    const sy = img.naturalHeight > img.naturalWidth ? (img.naturalHeight - side) * 0.25 : (img.naturalHeight - side) / 2;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function PhotoField({ doc, update }: { doc: CVDoc; update: Update }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const photo = doc.content.personal.photo;
  const shows = templateMeta(doc.design.template).photo;
  const photoTemplates = TEMPLATES.filter((t) => t.photo).map((t) => t.name);

  const onFile = async (f?: File) => {
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
      toast.error("Please choose a JPG, PNG or WebP image.");
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error("That image is larger than 10 MB. Please choose a smaller one.");
      return;
    }
    setBusy(true);
    try {
      const data = await toSquareJpeg(f);
      update((d) => void (d.content.personal.photo = data));
      toast.success("Photo added", { description: shows ? "It's shown on your CV." : "Your current template doesn't show photos — choose one with the Photo badge in Design." });
    } catch {
      toast.error("We couldn't read that image. Try another photo.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-2/50 p-3">
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-3 ring-1 ring-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo ? <img src={photo} alt="Your CV photo" className="size-full object-cover" /> : <UserRound className="size-7 text-subtle" aria-hidden />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium">
          Photo <span className="font-normal text-subtle">(optional)</span>
        </p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" loading={busy} icon={photo ? <Camera className="size-4" /> : <ImagePlus className="size-4" />} onClick={() => input.current?.click()}>
            {photo ? "Replace" : "Add photo"}
          </Button>
          {photo && (
            <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => update((d) => void (d.content.personal.photo = ""))}>
              Remove
            </Button>
          )}
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Upload CV photo" onChange={(e) => void onFile(e.target.files?.[0])} />
        <p className={cn("mt-2 text-xs leading-relaxed", photo && !shows ? "text-warning" : "text-subtle")}>
          {photo && !shows ? "Your current template doesn't show photos. " : ""}
          Shown on: {photoTemplates.join(", ")}. Photos are common in Bangladesh, the Middle East and Europe; many US, UK and Canadian employers prefer CVs without one. Your photo stays on your device.
        </p>
      </div>
    </div>
  );
}
