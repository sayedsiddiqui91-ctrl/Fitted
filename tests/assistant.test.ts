import { suite, test, expect } from "./harness";
import { DEFAULT_DESIGN, SAMPLE_JOB, sampleContent } from "../src/lib/cv/defaults";
import { localAssistant } from "../src/lib/engine/assistant";
import { validateAction } from "../src/lib/engine/assistantActions";
import { analyzeJobDescription } from "../src/lib/engine/jobAnalysis";
import type { AssistantSelection } from "../src/lib/ai/types";

const content = sampleContent();
const exp = content.experience[0];
const global: AssistantSelection = { scope: "global" };
const bullet: AssistantSelection = { scope: "bullet", section: "experience", itemId: exp.id, bulletId: exp.bullets[0].id };
const analysis = analyzeJobDescription(SAMPLE_JOB);
const job = { title: analysis.jobTitle, company: analysis.company, analysis, match: null };
const ask = (q: string, selection = global, withJob = false) => localAssistant([{ role: "user", content: q }], { content, selection, job: withJob ? job : null, design: DEFAULT_DESIGN });

suite("AI assistant (on-device)", () => {
  test("improves the summary from real CV facts with an Apply-able action", () => {
    const r = ask("Make my summary stronger.");
    expect(r.actions.length === 1 && r.actions[0].type === "replace_summary", "expected one replace_summary action");
    expect(/accounts payable/i.test(r.actions[0].newText), "summary should use the CV's own domain terms");
  });
  test("gives three different summary versions", () => {
    const r = ask("Give me three versions of my summary.");
    expect(r.actions.length === 3, `expected 3 versions, got ${r.actions.length}`);
    expect(new Set(r.actions.map((a) => a.newText)).size === 3, "versions should differ");
  });
  test("names the actual weak bullets", () => {
    const r = ask("Which parts of my CV are weak?");
    expect(r.reply.includes("Responsible for"), "should quote the weak opener from the CV");
    expect(r.actions.some((a) => a.type === "update_bullet"), "should propose bullet fixes");
  });
  test("'make this stronger' targets the selected bullet", () => {
    const r = ask("Make this stronger", bullet);
    expect(r.actions[0]?.bulletId === exp.bullets[0].id, "action must target the selected bullet");
  });
  test("asks for details instead of inventing team management", () => {
    const r = ask("Add that I managed a team");
    expect(r.actions.length === 0, "must not propose a change without details");
    expect(/team size/i.test(r.reply), "should ask for the team size");
    expect(!r.followUps.some((f) => /^i\s/i.test(f)), "must not offer a made-up first-person claim as a one-click chip");
  });
  test("doesn't silently drop a claim bundled with a skills request", () => {
    const r = ask("Add Python and Power BI to my skills and say I increased revenue by 40%.");
    expect(r.actions.length === 2 && r.actions.every((a) => a.type === "add_skill"), "only the stated skills become actions");
    expect(/didn't add .*increased revenue by 40%/i.test(r.reply), "should say the revenue claim wasn't added and ask for context");
  });
  test("answers job-fit questions from the job context", () => {
    const r = ask("Do I have enough experience for this job?", global, true);
    expect(/years/i.test(r.reply) && /Estimated job match/i.test(r.reply), "should compare years and give the estimate");
  });
});

suite("Assistant action validator", () => {
  const base = { section: "experience", itemId: exp.id, bulletId: exp.bullets[0].id, oldText: "", label: "" };
  test("blocks invented metrics", () => {
    expect(!validateAction({ ...base, type: "update_bullet", newText: "Managed a team of 10 accountants." }, content).ok, "number 10 is not in the CV");
  });
  test("blocks invented tools", () => {
    expect(!validateAction({ ...base, type: "update_bullet", newText: "Managed invoice processing in Python for 120+ suppliers." }, content).ok, "Python is not in the CV");
  });
  test("blocks job-posting details", () => {
    expect(!validateAction({ ...base, type: "replace_summary", newText: "Finance analyst seeking a role at Northwind Partners." }, content, "", ["Northwind Partners"]).ok, "company name leaked");
  });
  test("allows facts the user stated", () => {
    expect(validateAction({ ...base, type: "add_bullet", newText: "Led a team of 4 AP clerks." }, content, "I led a team of 4 AP clerks").ok, "user-provided fact should pass");
  });
});
