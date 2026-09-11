import type { CVContent, Layout } from "@/lib/cv/schema";
import type { Change } from "@/lib/ai/types";
import { clone } from "@/lib/utils";

type BulletSection = "experience" | "projects" | "volunteer" | "education";

function reorder<T extends { id: string }>(list: T[], order: string[]): T[] {
  const map = new Map(list.map((x) => [x.id, x]));
  const out: T[] = [];
  for (const id of order) {
    const x = map.get(id);
    if (x) {
      out.push(x);
      map.delete(id);
    }
  }
  return [...out, ...map.values()];
}

/** Applies accepted changes to a copy of the content/layout. Never mutates inputs. */
export function applyChanges(content: CVContent, layout: Layout, changes: Change[]): { content: CVContent; layout: Layout } {
  const c = clone(content);
  const l = clone(layout);
  const accepted = changes.filter((x) => x.status === "accepted" && x.category !== "blocked");
  const rank: Record<Change["kind"], number> = { summary: 0, bullet: 1, "add-bullet": 2, "bullet-order": 3, "add-skill": 4, skills: 5, "item-order": 6, "section-order": 7 };

  for (const ch of [...accepted].sort((a, b) => rank[a.kind] - rank[b.kind])) {
    switch (ch.kind) {
      case "summary":
        c.summary = ch.after;
        break;
      case "bullet": {
        const list = c[ch.section as BulletSection] as { id: string; bullets: { id: string; text: string }[] }[] | undefined;
        const item = list?.find((i) => i.id === ch.target.itemId);
        const b = item?.bullets.find((x) => x.id === ch.target.bulletId);
        if (b) b.text = ch.after;
        break;
      }
      case "add-bullet": {
        const item = c.experience.find((i) => i.id === ch.target.itemId);
        if (item && ch.payload?.bullet) item.bullets.push({ ...ch.payload.bullet, text: ch.after });
        break;
      }
      case "bullet-order": {
        const item = c.experience.find((i) => i.id === ch.target.itemId);
        if (item && ch.payload?.order) item.bullets = reorder(item.bullets, ch.payload.order);
        break;
      }
      case "add-skill":
        if (ch.payload?.skill && !c.skills.some((s) => s.name.toLowerCase() === ch.after.toLowerCase())) c.skills.push({ ...ch.payload.skill, name: ch.after });
        break;
      case "skills":
        if (ch.payload?.skills) c.skills = reorder(c.skills, ch.payload.skills.map((s) => s.id));
        break;
      case "item-order":
        if (ch.payload?.order) {
          if (ch.section === "projects") c.projects = reorder(c.projects, ch.payload.order);
          if (ch.section === "certifications") c.certifications = reorder(c.certifications, ch.payload.order);
          if (ch.section === "experience") c.experience = reorder(c.experience, ch.payload.order);
        }
        break;
      case "section-order":
        if (ch.payload?.order) {
          const keep = ch.payload.order.filter((k) => l.order.includes(k));
          l.order = [...keep, ...l.order.filter((k) => !keep.includes(k))];
        }
        break;
    }
  }
  return { content: c, layout: l };
}
