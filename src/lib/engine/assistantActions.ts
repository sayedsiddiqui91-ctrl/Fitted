import type { CVContent, CVDoc } from "@/lib/cv/schema";
import type { AssistantAction } from "@/lib/ai/types";
import { newBullet, newSkill } from "@/lib/cv/defaults";
import { analyzeCV, cvToText } from "./cvAnalysis";
import { guardText } from "./guard";
import { addedContactDetail, looksLikeTitle } from "./personalInfo";
import { wordCount } from "./text";

type BulletSection = "experience" | "projects" | "volunteer" | "education";
const BULLET_SECTIONS: BulletSection[] = ["experience", "projects", "volunteer", "education"];

interface ItemWithBullets {
  id: string;
  bullets: { id: string; text: string }[];
  role?: string;
  company?: string;
  name?: string;
  organization?: string;
  degree?: string;
  school?: string;
}

export function findItem(content: CVContent, section: string, itemId: string): ItemWithBullets | undefined {
  if (!BULLET_SECTIONS.includes(section as BulletSection)) return undefined;
  return (content[section as BulletSection] as ItemWithBullets[]).find((i) => i.id === itemId);
}

export function itemLabel(item: ItemWithBullets | undefined): string {
  if (!item) return "";
  return [item.role ?? item.name ?? item.degree, item.company ?? item.organization ?? item.school].filter(Boolean).join(" · ");
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export interface ActionCheck {
  ok: boolean;
  action: AssistantAction;
  problem?: string;
}

/**
 * Validates a proposed assistant change against the current CV:
 * the target must exist, the text must fit the section, and it must not
 * introduce facts (numbers, skills, tools) that aren't in the CV or the user's own messages.
 */
export function validateAction(a: AssistantAction, content: CVContent, userFacts = "", forbidden: string[] = []): ActionCheck {
  const facts = analyzeCV(content);
  const corpus = `${cvToText(content)}\n${userFacts}\n${facts.years}+ ${facts.years}`;
  const newText = a.newText.trim();
  const fail = (problem: string): ActionCheck => ({ ok: false, action: a, problem });
  if (!newText) return fail("The suggestion was empty.");

  // Job metadata (company, location, salary…) never belongs in CV content
  const leaked = forbidden.filter((f) => f && f.length > 2 && norm(newText).includes(norm(f)));
  if (leaked.length) return fail(`Includes job-posting details (“${leaked[0]}”) that don't belong in a CV.`);

  // The candidate's own address/contact details belong in the header, not in summary or bullets
  if (a.type === "replace_summary" || a.type === "update_bullet" || a.type === "add_bullet") {
    const personal = addedContactDetail(newText, a.type === "replace_summary" ? content.summary : a.oldText || "", content);
    if (personal) return fail(`Includes your address or contact details (“${personal}”), which belong in the header only.`);
  }

  let fixed: AssistantAction = { ...a, newText };
  switch (a.type) {
    case "replace_summary": {
      if (wordCount(newText) > 120) return fail("That summary is too long.");
      if (/\b(i|my|me)\b/i.test(newText) && !/\b(i|my|me)\b/i.test(content.summary)) return fail("Summaries shouldn't use first person.");
      fixed = { ...fixed, section: "summary", oldText: content.summary, label: fixed.label || "Summary" };
      break;
    }
    case "update_headline": {
      if (wordCount(newText) > 10) return fail("A professional title should be short.");
      if (!looksLikeTitle(newText)) return fail("That doesn't look like a professional title (addresses and contact details go in the header fields).");
      fixed = { ...fixed, section: "personal", oldText: content.personal.headline, label: "Professional title" };
      break;
    }
    case "update_bullet": {
      const item = findItem(content, a.section, a.itemId);
      const bullet = item?.bullets.find((b) => b.id === a.bulletId) ?? item?.bullets.find((b) => a.oldText && norm(b.text) === norm(a.oldText));
      if (!item || !bullet) return fail("That bullet no longer exists in your CV.");
      if (wordCount(newText) > 50) return fail("That bullet is too long.");
      if (norm(newText) === norm(bullet.text)) return fail("No change.");
      const idx = item.bullets.indexOf(bullet);
      fixed = { ...fixed, bulletId: bullet.id, oldText: bullet.text, label: fixed.label || `${itemLabel(item)} — bullet ${idx + 1}` };
      break;
    }
    case "add_bullet": {
      const item = findItem(content, a.section, a.itemId);
      if (!item || a.section === "education") return fail("That entry no longer exists in your CV.");
      if (wordCount(newText) > 50) return fail("That bullet is too long.");
      fixed = { ...fixed, oldText: "", label: fixed.label || `${itemLabel(item)} — new bullet` };
      break;
    }
    case "add_skill": {
      const name = (a.newText || "").trim();
      if (name.length > 40 || wordCount(name) > 5 || /[@/\\]|\d{3,}/.test(name)) return fail("That doesn't look like a skill.");
      if (content.skills.some((s) => norm(s.name) === norm(name))) return fail("You already list that skill.");
      fixed = { ...fixed, section: "skills", newText: name, oldText: "", label: "Skills" };
      break;
    }
  }

  const g = guardText(newText, corpus);
  if (!g.ok) return fail(g.problems[0]);
  return { ok: true, action: fixed };
}

/** Applies an approved action to a CV draft. Returns false if the target is gone. */
export function applyAction(draft: CVDoc, a: AssistantAction): boolean {
  const c = draft.content;
  switch (a.type) {
    case "replace_summary":
      c.summary = a.newText;
      return true;
    case "update_headline":
      c.personal.headline = a.newText;
      return true;
    case "update_bullet": {
      const b = findItem(c, a.section, a.itemId)?.bullets.find((x) => x.id === a.bulletId);
      if (!b) return false;
      b.text = a.newText;
      return true;
    }
    case "add_bullet": {
      const item = findItem(c, a.section, a.itemId);
      if (!item) return false;
      item.bullets = [...item.bullets.filter((b) => b.text.trim()), newBullet(a.newText)];
      return true;
    }
    case "add_skill":
      if (c.skills.some((s) => norm(s.name) === norm(a.newText))) return true;
      c.skills.push(newSkill(a.newText));
      return true;
  }
}

export const emptyAction = (): AssistantAction => ({ type: "replace_summary", section: "", itemId: "", bulletId: "", oldText: "", newText: "", label: "" });
