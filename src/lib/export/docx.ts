"use client";

import { AlignmentType, BorderStyle, Document, ExternalHyperlink, Packer, Paragraph, TabStopType, TextRun } from "docx";
import type { CVDoc } from "@/lib/cv/schema";
import { formatRange } from "@/lib/cv/dates";
import { PAGE_DIMENSIONS, sectionTitle } from "@/lib/cv/meta";
import { cvFileName, triggerDownload } from "./pdf";

const MM_TO_TWIP = 56.6929;

/** ATS-friendly single-column DOCX built from the same structured content. */
export async function downloadDocx(doc: CVDoc): Promise<void> {
  const { content: c, design } = doc;
  const accent = design.accent.replace("#", "");
  const page = PAGE_DIMENSIONS[design.pageSize];
  const marginTw = Math.round(design.margin * MM_TO_TWIP);
  const contentWidthTw = Math.round(page.widthMm * MM_TO_TWIP) - marginTw * 2;
  const size = Math.round(design.fontSize * 2);
  const font = design.font;
  const children: Paragraph[] = [];

  const run = (text: string, opts: { bold?: boolean; italics?: boolean; color?: string; size?: number } = {}) => new TextRun({ text, font, size: opts.size ?? size, ...opts });

  // Header
  const p = c.personal;
  children.push(new Paragraph({ children: [run(p.fullName || doc.name, { bold: true, size: Math.round(size * 2.1) })], spacing: { after: 60 } }));
  if (p.headline) children.push(new Paragraph({ children: [run(p.headline, { color: accent, size: Math.round(size * 1.1) })], spacing: { after: 60 } }));
  const contact: (TextRun | ExternalHyperlink)[] = [];
  const addContact = (t: string, link?: string) => {
    if (!t) return;
    if (contact.length) contact.push(run("  •  ", { color: "999999" }));
    contact.push(link ? new ExternalHyperlink({ link, children: [run(t, { color: "444444" })] }) : run(t, { color: "444444" }));
  };
  addContact(p.email, p.email ? `mailto:${p.email}` : undefined);
  addContact(p.phone);
  addContact(p.location);
  addContact(p.linkedin, p.linkedin ? (p.linkedin.startsWith("http") ? p.linkedin : `https://${p.linkedin}`) : undefined);
  addContact(p.website, p.website ? (p.website.startsWith("http") ? p.website : `https://${p.website}`) : undefined);
  for (const l of p.links) addContact(l.label || l.url, l.url.startsWith("http") ? l.url : `https://${l.url}`);
  if (contact.length) children.push(new Paragraph({ children: contact, spacing: { after: 120 } }));

  const heading = (t: string) =>
    new Paragraph({
      children: [run(t.toUpperCase(), { bold: true, color: accent, size: Math.round(size * 1.1) })],
      spacing: { before: 220, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "D9DCE1", space: 2 } },
      keepNext: true,
    });
  const lineWithDate = (left: TextRun[], date: string) =>
    new Paragraph({
      children: [...left, ...(date ? [new TextRun({ text: `\t${date}`, font, size, color: "555555" })] : [])],
      tabStops: [{ type: TabStopType.RIGHT, position: contentWidthTw }],
      keepNext: true,
      spacing: { before: 80 },
    });
  const sub = (t: string) => (t ? new Paragraph({ children: [run(t, { color: "555555" })], keepNext: true }) : null);
  const bullets = (list: { text: string }[]) => list.filter((b) => b.text.trim()).map((b) => new Paragraph({ children: [run(b.text.trim())], bullet: { level: 0 }, spacing: { after: 30 } }));
  const push = (...ps: (Paragraph | null)[]) => ps.forEach((x) => x && children.push(x));

  for (const key of doc.layout.order.filter((k) => !doc.layout.hidden.includes(k))) {
    const title = sectionTitle(doc, key);
    switch (key) {
      case "summary":
        if (c.summary.trim()) push(heading(title), new Paragraph({ children: [run(c.summary.trim())] }));
        break;
      case "experience":
      case "volunteer": {
        const list = key === "experience" ? c.experience.map((e) => ({ ...e, org: e.company })) : c.volunteer.map((v) => ({ ...v, org: v.organization }));
        if (!list.length) break;
        push(heading(title));
        for (const e of list) {
          push(lineWithDate([run(e.role || e.org, { bold: true })], formatRange(e.startDate, e.endDate, e.current)), sub([e.role ? e.org : "", e.location].filter(Boolean).join(" · ")), ...bullets(e.bullets));
        }
        break;
      }
      case "education":
        if (!c.education.length) break;
        push(heading(title));
        for (const e of c.education) {
          const t = [e.degree, e.field].filter(Boolean).join(e.degree && e.field ? " in " : "");
          push(lineWithDate([run(t || e.school, { bold: true })], formatRange(e.startDate, e.endDate)), sub([t ? e.school : "", e.location, e.grade].filter(Boolean).join(" · ")), ...bullets(e.bullets));
        }
        break;
      case "skills": {
        const skills = c.skills.filter((s) => s.name.trim());
        if (!skills.length) break;
        push(heading(title));
        const groups = new Map<string, string[]>();
        for (const s of skills) groups.set(s.group.trim(), [...(groups.get(s.group.trim()) ?? []), s.name.trim()]);
        for (const [g, names] of groups) push(new Paragraph({ children: [...(g ? [run(`${g}: `, { bold: true })] : []), run(names.join(", "))], spacing: { after: 40 } }));
        break;
      }
      case "projects":
        if (!c.projects.length) break;
        push(heading(title));
        for (const pr of c.projects) push(lineWithDate([run(pr.name, { bold: true }), ...(pr.role ? [run(` — ${pr.role}`)] : [])], formatRange(pr.startDate, pr.endDate)), sub(pr.link), ...bullets(pr.bullets));
        break;
      case "certifications":
        if (!c.certifications.length) break;
        push(heading(title));
        for (const x of c.certifications) push(lineWithDate([run(x.name, { bold: true }), ...(x.issuer ? [run(`, ${x.issuer}`)] : [])], x.date));
        break;
      case "awards":
        if (!c.awards.length) break;
        push(heading(title));
        for (const x of c.awards) push(lineWithDate([run(x.title, { bold: true }), ...(x.issuer ? [run(`, ${x.issuer}`)] : [])], x.date), x.description ? new Paragraph({ children: [run(x.description)] }) : null);
        break;
      case "languages":
        if (!c.languages.length) break;
        push(heading(title), new Paragraph({ children: [run(c.languages.map((l) => (l.proficiency ? `${l.name} (${l.proficiency})` : l.name)).join("  •  "))] }));
        break;
      default: {
        const sec = c.custom.find((s) => `custom:${s.id}` === key);
        if (!sec?.items.length) break;
        push(heading(title));
        for (const i of sec.items) push(lineWithDate([run(i.title, { bold: true }), ...(i.subtitle ? [run(` — ${i.subtitle}`)] : [])], i.date), i.description ? new Paragraph({ children: [run(i.description)] }) : null);
      }
    }
  }

  const document = new Document({
    creator: "Fitted",
    title: `${p.fullName || doc.name} — CV`,
    styles: { default: { document: { run: { font, size }, paragraph: { spacing: { line: Math.round(240 * design.lineHeight * 0.85) } } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: Math.round(page.widthMm * MM_TO_TWIP), height: Math.round(page.heightMm * MM_TO_TWIP) },
            margin: { top: marginTw, bottom: marginTw, left: marginTw, right: marginTw },
          },
        },
        children: children.length ? children : [new Paragraph({ children: [run(" ")], alignment: AlignmentType.LEFT })],
      },
    ],
  });
  const blob = await Packer.toBlob(document);
  triggerDownload(blob, cvFileName(doc, "docx"));
}
