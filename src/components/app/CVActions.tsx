"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Download, FileText, MoreHorizontal, Pencil, Sparkles, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { downloadPdf, pdfOutcomeMessage } from "@/lib/export/pdf";
import type { CVDoc } from "@/lib/cv/schema";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/Menu";
import { ConfirmDialog, PromptDialog } from "@/components/ui/Dialog";
import { IconButton } from "@/components/ui/Button";

/** Shared CV actions menu: open, optimize, duplicate, rename, download, delete (with undo). */
export function CVActionsMenu({ doc, trigger }: { doc: CVDoc; trigger?: React.ReactNode }) {
  const router = useRouter();
  const duplicateCV = useStore((s) => s.duplicateCV);
  const renameCV = useStore((s) => s.renameCV);
  const deleteCV = useStore((s) => s.deleteCV);
  const restoreCV = useStore((s) => s.restoreCV);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const duplicate = () => {
    const id = duplicateCV(doc.id, { name: `${doc.name} (copy)` });
    if (id) toast.success("CV duplicated", { description: "The original is unchanged." });
  };

  const remove = () => {
    const removed = deleteCV(doc.id);
    if (removed)
      toast("CV deleted", {
        description: removed.name,
        action: { label: "Undo", onClick: () => restoreCV(removed) },
        duration: 6000,
      });
  };

  return (
    <>
      <Menu
        trigger={
          trigger ?? (
            <IconButton label={`Actions for ${doc.name}`} size="sm" tooltip={false}>
              <MoreHorizontal className="size-4" />
            </IconButton>
          )
        }
      >
        <MenuItem icon={<FileText />} onSelect={() => router.push(`/app/cv/${doc.id}`)}>
          Open
        </MenuItem>
        <MenuItem icon={<Sparkles />} onSelect={() => router.push(`/app/cv/${doc.id}/optimize`)}>
          Optimize for a job
        </MenuItem>
        <MenuItem icon={<Copy />} onSelect={duplicate}>
          Duplicate
        </MenuItem>
        <MenuItem icon={<Pencil />} onSelect={() => setRenaming(true)}>
          Rename
        </MenuItem>
        <MenuItem
          icon={<Download />}
          onSelect={async () => {
            const t = toast.loading("Preparing your PDF…");
            const msg = pdfOutcomeMessage(await downloadPdf(doc));
            if (msg.tone === "success") toast.success(msg.title, { id: t, description: msg.description });
            else toast(msg.title, { id: t, description: msg.description, duration: 9000 });
          }}
        >
          Download PDF
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<Trash2 />} danger onSelect={() => setDeleting(true)}>
          Delete
        </MenuItem>
      </Menu>
      <PromptDialog open={renaming} onOpenChange={setRenaming} title="Rename CV" label="CV name" initial={doc.name} confirmLabel="Save" onSubmit={(v) => renameCV(doc.id, v)} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this CV?"
        description={`“${doc.name}” will be removed from this browser. Tailored versions made from it are kept.`}
        confirmLabel="Delete CV"
        danger
        onConfirm={remove}
      />
    </>
  );
}
