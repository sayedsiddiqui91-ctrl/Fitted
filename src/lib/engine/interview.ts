import type { CVContent } from "@/lib/cv/schema";
import type { InterviewPrep, InterviewQuestion, JobAnalysis, MatchResult } from "@/lib/ai/types";
import { analyzeCV, evidenceFor } from "./cvAnalysis";
import { lookupTerm, similarity } from "./text";

const BEHAVIORAL: Record<string, string> = {
  Communication: "Tell me about a time you had to explain something complex to someone without your background.",
  Collaboration: "Describe a project where you worked closely with another team. How did you keep everyone aligned?",
  "Problem Solving": "Walk me through a difficult problem you solved at work. How did you approach it?",
  "Analytical Thinking": "Tell me about a time your analysis changed a decision.",
  "Attention to Detail": "Describe a time you caught an error others had missed. What did you do?",
  Leadership: "Tell me about a time you took the lead without being asked.",
  "Time Management": "Tell me about a time you had several deadlines at once. How did you prioritize?",
  Adaptability: "Describe a time priorities changed suddenly. How did you adapt?",
  "Stakeholder Management": "Tell me about a time you had to manage a difficult stakeholder.",
  "Cross-Functional Collaboration": "Describe working with a cross-functional team toward a shared goal.",
  Negotiation: "Tell me about a negotiation you were part of. What was the outcome?",
  "Customer Focus": "Tell me about a time you went beyond what a customer expected.",
};
const DEFAULT_BEHAVIORAL = [
  "Tell me about a mistake you made at work and what you learned from it.",
  "Describe a time you disagreed with a colleague. How did you resolve it?",
  "What achievement are you most proud of in your career so far, and why?",
];

export function generateInterviewQuestions(content: CVContent, job: JobAnalysis, match: MatchResult | null): InterviewPrep {
  const facts = analyzeCV(content);
  const role = job.jobTitle || "this role";

  const technical: InterviewQuestion[] = [];
  for (const skill of [...job.requiredSkills, ...job.preferredSkills].slice(0, 6)) {
    const ev = evidenceFor(facts, skill);
    const lex = lookupTerm(skill);
    const q =
      lex?.category === "tool"
        ? `How have you used ${skill} in your work? Walk me through a specific example.`
        : `How would you approach ${/[A-Z]{2}|&/.test(skill) ? skill : skill.toLowerCase()} in the ${role} role?`;
    technical.push({
      question: q,
      why: `${skill} is ${job.requiredSkills.includes(skill) ? "a core requirement" : "listed as a plus"} for this job.`,
      talkingPoints:
        ev.status === "strong" && ev.snippet
          ? [`Use your real example: “${ev.snippet}”`, "Explain the context, what you did step by step, and the outcome.", "Mention tools, volume or frequency only if you know them."]
          : ev.status !== "none"
            ? [`Your CV lists ${skill} — prepare one concrete example of using it.`, "Be specific about your level; don't overstate it."]
            : [`Your CV doesn't show ${skill}. Be honest about your level.`, "Mention related experience and how you'd get up to speed."],
    });
  }
  for (const r of job.responsibilities.slice(0, 2)) {
    const best = facts.bullets.map((b) => ({ b, s: similarity(r, b.text) })).sort((a, b) => b.s - a.s)[0];
    technical.push({
      question: `This role involves: “${r.replace(/[.;]$/, "")}”. How would you handle that here?`,
      why: "Taken directly from the job's responsibilities.",
      talkingPoints: best && best.s > 0.15 ? [`Connect it to: “${best.b.text}” (${best.b.label})`, "Describe your process and what you'd do in your first months."] : ["Describe the steps you would take and the questions you'd ask.", "Relate it to the closest thing you've done, honestly."],
    });
  }

  const behavioral: InterviewQuestion[] = [];
  for (const s of job.softSkills) {
    const q = BEHAVIORAL[lookupTerm(s)?.canonical ?? s];
    if (q && behavioral.length < 4) behavioral.push({ question: q, why: `The job emphasizes ${s.toLowerCase()}.`, talkingPoints: ["Use the STAR method: Situation, Task, Action, Result.", "Pick a real example — interviewers probe for details."] });
  }
  for (const q of DEFAULT_BEHAVIORAL) if (behavioral.length < 4) behavioral.push({ question: q, why: "A common behavioral question for most roles.", talkingPoints: ["Keep it to 2 minutes.", "Focus on what you did and what changed as a result."] });

  const experience: InterviewQuestion[] = facts.bullets
    .filter((b) => b.section === "experience" || b.section === "projects")
    .map((b) => ({ b, s: job.responsibilities.reduce((m, r) => Math.max(m, similarity(r, b.text)), 0) + (/\d/.test(b.text) ? 0.1 : 0) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 4)
    .map(({ b }) => ({
      question: `On your CV you wrote: “${b.text.replace(/[.]$/, "")}”. Can you walk me through it?`,
      why: `Interviewers dig into the achievements most relevant to the job (${b.label}).`,
      talkingPoints: [
        "Situation: what was the context and why did it matter?",
        "Action: what exactly did you do — and what did others do?",
        /\d/.test(b.text) ? "Result: be ready to explain how the number was measured." : "Result: what changed? If you don't have a number, describe the outcome honestly.",
      ],
    }));

  const gaps: InterviewQuestion[] = (match?.keywords.doNotAdd ?? [])
    .filter((k) => k.importance !== "keyword")
    .slice(0, 3)
    .map((k) => ({
      question: `The role mentions ${k.term}. What's your experience with it?`,
      why: "Your CV doesn't show this, so it may come up.",
      talkingPoints: ["Be honest — don't claim experience you don't have.", "Mention related skills and how quickly you've learned tools before.", "If you've started learning it, say what you've done so far."],
    }));

  const askThem = [
    `What does success look like in the first 90 days for the ${role}?`,
    "What are the biggest challenges the team is facing right now?",
    job.jobFunction === "Finance" || job.jobFunction === "Accounting" ? "Which reporting tools and systems does the team use day to day?" : "Which tools and processes does the team rely on most?",
    "How is performance measured and reviewed?",
    "What do you enjoy most about working here?",
  ];

  return { technical: technical.slice(0, 7), behavioral, experience, gaps, askThem };
}
