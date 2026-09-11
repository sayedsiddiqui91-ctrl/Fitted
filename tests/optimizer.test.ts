import { suite, test, expect } from "./harness";
import { DEFAULT_DESIGN, defaultLayout, newBullet, sampleContent } from "../src/lib/cv/defaults";
import { analyzeJobDescription } from "../src/lib/engine/jobAnalysis";
import { calculateJobMatch } from "../src/lib/engine/match";
import { generateOptimizationSuggestions } from "../src/lib/engine/optimize";
import { rewriteBullet } from "../src/lib/engine/rewrite";

const JD = `Accounts Payable Specialist — Harbourline Freight, Sydney NSW

About us
Harbourline Freight is a leading Australian logistics company.

Location: Level 12, 200 George Street, Sydney NSW 2000
Employment type: Full-time, permanent
Work arrangement: Hybrid
Salary: $75,000 – $85,000 per annum + super

Key responsibilities
- Process high volumes of vendor invoices using three-way matching
- Perform AP and bank reconciliations
- Prepare weekly payment runs and support month-end close

About you
- 3+ years of accounts payable experience
- Advanced Excel skills
- Experience with SAP or NetSuite
- Experience with Power BI is highly regarded

How to apply
Send your CV to careers@harbourline.com.au quoting ref AP-2231.
Contact: Priya Nair, Talent Partner`;

const content = sampleContent();
content.experience[1].bullets.push(newBullet("Responsible for processing invoices and making payments"));
const doc = { content, layout: defaultLayout(), design: { ...DEFAULT_DESIGN } };
const job = analyzeJobDescription(JD);
const match = calculateJobMatch(content, doc.design, job);
const LEAK = /sydney|george street|harbourline|\$75|per annum|careers@|priya|ref ap-2231/i;

suite("Job description analysis", () => {
  test("separates job metadata from requirements", () => {
    expect(job.salary?.includes("75,000") ?? false, "salary should be captured as metadata");
    expect(job.location?.includes("George Street") ?? false, "location should be captured as metadata");
    expect(job.employmentType === "Full-time", "employment type");
    expect(job.applicationInstructions.length >= 1, "application instructions");
    expect(![...job.requiredSkills, ...job.keywords].some((k) => LEAK.test(k)), "metadata must not become skills/keywords");
  });
  test("maps requirements to CV evidence", () => {
    const three = match.requirements?.find((r) => r.requirement === "Three-Way Matching");
    expect(three?.status === "matched" && !!three.evidence, "three-way matching should be matched with evidence");
    expect(match.requirements?.find((r) => r.requirement === "Power BI")?.status === "missing", "Power BI is not in the CV");
  });
});

suite("Section-aware optimization", () => {
  for (const mode of ["conservative", "balanced", "aggressive"] as const) {
    test(`${mode}: no job metadata injected, nothing fabricated`, () => {
      const plan = generateOptimizationSuggestions(doc, job, match, mode);
      for (const c of plan.changes) {
        expect(!LEAK.test(c.after), `leak in ${c.label}: ${c.after}`);
        expect(!/power bi/i.test(c.after), `fabricated Power BI in ${c.label}`);
      }
    });
  }
  test("rewrites coordinated gerunds correctly", () => {
    const r = rewriteBullet("Responsible for processing invoices, reconciling statements and making payments", { current: false, mode: "balanced", endWithPeriod: false });
    expect(r.text === "Processed invoices, reconciled statements and made payments", r.text);
  });
  test("keeps 'by …ing' clauses intact", () => {
    const r = rewriteBullet("Helped with month-end close by preparing accruals", { current: false, mode: "balanced", endWithPeriod: false });
    expect(r.text.includes("by preparing accruals"), r.text);
  });
});
