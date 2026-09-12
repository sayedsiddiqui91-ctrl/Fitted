import { suite, test, expect } from "./harness";
import { claudeAllowed } from "@/lib/ai/enabled";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CVDocument } from "../src/components/cv/CVDocument";
import { DEFAULT_DESIGN, defaultLayout, newBullet, newCustomItem, newCustomSection, sampleContent } from "../src/lib/cv/defaults";
import { applyAutoFixes, planAutoFixes } from "../src/lib/engine/autoFix";
import { compareReadBack } from "../src/lib/engine/atsCheck";
import { TEMPLATE_DEFS } from "../src/lib/cv/templates";
import { analyzeJobDescription } from "../src/lib/engine/jobAnalysis";
import { calculateJobMatch, identifyMissingKeywords } from "../src/lib/engine/match";
import { generateOptimizationSuggestions } from "../src/lib/engine/optimize";
import { localAssistant } from "../src/lib/engine/assistant";
import { validateAction } from "../src/lib/engine/assistantActions";
import { reviewCV } from "../src/lib/engine/review";
import { polishSummary } from "../src/lib/engine/summaryWriter";
import { isSectionHeading } from "../src/lib/engine/parseResume";
import { toGerundClause } from "../src/lib/engine/rewrite";
import { headingStyleMatcher, inferDesign, mapFont } from "../src/lib/import/designInfer";
import type { PdfTextRun } from "../src/lib/pdf/types";
import { analyzeCV } from "../src/lib/engine/cvAnalysis";
import { parseResumeText } from "../src/lib/engine/parseResume";
import { looksLikeAddress } from "../src/lib/engine/personalInfo";
import { buildRuns } from "../src/lib/pdf/runs";

// Found during in-browser end-to-end testing
const JD = `Senior Finance Analyst
Northwind Partners
Location: Austin, TX (Hybrid - 3 days in office)
Employment type: Full-time
Salary: $85,000 - $100,000 per year

About us
Northwind Partners is a fast-growing logistics consultancy serving 300 clients across North America.

Responsibilities
- Own month-end close and prepare accruals and journal entries
- Build management reports and dashboards in Power BI

Requirements
- 4+ years of experience in accounts payable or financial analysis
- Advanced Excel skills (pivot tables, VLOOKUP)
- Experience with SAP or another ERP

How to apply: send your CV to recruiting@northwind.com by 30 October.
Northwind Partners is an equal opportunity employer.`;

suite("Regressions from end-to-end testing", () => {
  const job = analyzeJobDescription(JD);
  test("location keeps the place, drops the arrangement parenthetical", () => {
    expect(job.location === "Austin, TX", `got “${job.location}”`);
    expect(/hybrid/i.test(job.workArrangement ?? ""), "arrangement still captured separately");
  });
  test("the employer's name is never a keyword or a gap", () => {
    const kw = identifyMissingKeywords(analyzeCV(sampleContent()), job);
    const all = [...kw.have, ...kw.canAdd, ...kw.doNotAdd].map((k) => k.term);
    expect(!all.some((t) => /northwind/i.test(t)), `company listed: ${all.filter((t) => /northwind/i.test(t)).join(", ")}`);
  });
  test("lookup skills use the recognizable name", () => {
    const kw = identifyMissingKeywords(analyzeCV(sampleContent()), job);
    const all = [...kw.have, ...kw.canAdd, ...kw.doNotAdd].map((k) => k.term);
    expect(!all.includes("Lookups"), "should say VLOOKUP, not “Lookups”");
  });
  test("“Bachelor of Science in Finance” splits into degree + field correctly", () => {
    const text = `Jordan Lee\njordan.lee@email.com\n\nEducation\nBachelor of Science in Finance, University of Illinois\n2017 – 2021`;
    const e = parseResumeText(text).content.education[0];
    expect(e?.degree === "Bachelor of Science" && e?.field === "Finance", `got degree “${e?.degree}”, field “${e?.field}”`);
  });
});

// Reported: a skills block landed as a bullet under the last Education entry; education fields were swapped
suite("Import: skills and education", () => {
  const CV = `Sam Rahman
sam.rahman@example.com | +880 1712 345678

Education
Part Qualified (3/13 papers completed) 2019 – 2025
ACCA Qualification (Ongoing) CGPA: 3.02 Dhaka
Higher Secondary Certificate (HSC) 2016 – 2018
BAF Shaheen College, GPA: 3.17, Chittagong
Secondary School Certificate (SSC) 2010 – 2016
Chittagong Government High School, GPA: 5.00, Chittagong
• Data & Business Analysis: Microsoft Office Suite (Excel, PowerPoint, Word), dashboard preparation, financial analysis, reporting and data-driven decision making | Business & Operations: Process
improvement, stakeholder coordination, cross-functional collaboration, project tracking, ERP systems (Famous ERP), Jira, Arrive (loan processing platform) and operational problem solving. | AI &
Automation: ChatGPT, Claude, Google Gemini, Microsoft Copilot, Veo 3, generative AI tools, AI-assisted research, workflow automation, prompt engineering and productivity optimization

Projects
Loan Dashboard 2024
• Built an Excel dashboard for loan tracking`;
  const r = parseResumeText(CV);
  const ed = r.content.education;
  const skills = r.content.skills.map((s) => s.name);

  test("a skills list under Education is moved to Skills", () => {
    expect(ed.every((e) => e.bullets.every((b) => !/ChatGPT|Jira/.test(b.text))), "skills text still in education bullets");
    for (const s of ["Microsoft Office Suite (Excel, PowerPoint, Word)", "Process improvement", "Jira", "ChatGPT", "Prompt engineering", "Productivity optimization", "Data-driven decision making"])
      expect(skills.includes(s), `missing skill “${s}” — got: ${skills.join(" / ")}`);
    expect(r.content.skills.find((s) => s.name === "ChatGPT")?.group === "AI & Automation", "category kept");
    expect(r.warnings.some((w) => /moved them to Skills/.test(w)), "user is told");
  });
  test("SSC entry: qualification vs school not swapped", () => {
    const ssc = ed.find((e) => /SSC/.test(e.degree));
    expect(ssc?.school === "Chittagong Government High School", `got degree “${ssc?.degree}”, school “${ssc?.school}”`);
  });
  test("grade and city are separated; ACCA status kept with the qualification", () => {
    const acca = ed.find((e) => /ACCA/.test(e.degree));
    expect(acca?.grade === "CGPA: 3.02" && acca?.location === "Dhaka", `grade “${acca?.grade}”, location “${acca?.location}”`);
    expect(/Part Qualified/.test(acca?.degree ?? "") && !/Part Qualified/.test(acca?.school ?? ""), `degree “${acca?.degree}”, school “${acca?.school}”`);
    const hsc = ed.find((e) => /HSC/.test(e.degree));
    expect(hsc?.grade === "GPA: 3.17" && hsc?.location === "Chittagong", `grade “${hsc?.grade}”, location “${hsc?.location}”`);
  });
  test("non-standard skills headings are recognized, job titles are not", () => {
    const withHeading = parseResumeText(`Sam Rahman\n\nSKILLS & TOOLS PROFICIENCY\nExcel, Jira, SQL\n\nAreas of Expertise\nBudgeting, Forecasting\n\nExperience\nCustomer Experience Specialist\nAcme Ltd 2021 – 2023\n• Resolved customer issues`);
    const names = withHeading.content.skills.map((s) => s.name);
    expect(["Excel", "Jira", "SQL", "Budgeting", "Forecasting"].every((s) => names.includes(s)), names.join(" / "));
    expect(withHeading.content.experience[0]?.role === "Customer Experience Specialist", `role “${withHeading.content.experience[0]?.role}”`);
  });
  test("relevant coursework stays in Education", () => {
    const c = parseResumeText(`Sam Rahman\n\nEducation\nBachelor of Commerce in Accounting, University of Dhaka 2019 – 2023\n• Relevant coursework: Auditing, Taxation, Corporate Finance`);
    expect(c.content.education[0]?.bullets.some((b) => /coursework/i.test(b.text)), "coursework bullet kept");
  });
});

// Reported: imports lost information and ignored the original CV's format
suite("Faithful import", () => {
  const run = (p: Partial<PdfTextRun>): PdfTextRun => ({ id: Math.random().toString(36).slice(2), page: 0, text: "x", x: 50, y: 700, width: 100, fontSize: 10, bold: false, italic: false, family: "sans", ...p });

  test("keeps the original section order and its own section titles", () => {
    const r = parseResumeText(`Sam Rahman\nsam@example.com\n\nPROFESSION SUMMARY\nFinance graduate with audit experience.\n\nEDUCATION\nBachelor of Business Administration (BBA), North South University 2019 – 2023\n\nWORK EXPERIENCE\nAudit Intern 2023 – 2024\nKPMG\n• Performed vouching.\n\nSKILLS\nExcel, SAP`);
    const order = r.layout!.order.slice(0, 4).join(",");
    expect(order === "summary,education,experience,skills", order);
    expect(r.layout!.titles.summary === "Profession Summary" && r.layout!.titles.experience === "Work Experience", JSON.stringify(r.layout!.titles));
  });
  test("headings marked by the PDF reader become their own sections, in place", () => {
    const r = parseResumeText(`Sam Rahman\nsam@example.com\n\n§§ EXPERIENCE\nAudit Intern 2023 – 2024\nKPMG\n• Performed vouching.\n\n§§ PUBLICATIONS & TALKS\nSpeaker at the Dhaka Finance Summit on audit automation`);
    const sec = r.content.custom.find((c) => c.title === "Publications & Talks");
    expect(sec && /Finance Summit/.test(sec.items[0].description), JSON.stringify(r.content.custom));
    expect(!r.content.experience.some((e) => e.bullets.some((b) => /Summit/.test(b.text))), "must not merge into experience");
    expect(r.layout!.order[1] === `custom:${sec!.id}`, r.layout!.order.join(","));
  });
  test("nothing is dropped: unplaced lines are kept under Additional Information", () => {
    const r = parseResumeText(`Sam Rahman\nsam@example.com\nOpen to relocation within Bangladesh\n\nEXPERIENCE\nAudit Intern 2023 – 2024\nKPMG\n• Performed vouching.`);
    expect(!/relocation/i.test(r.content.personal.headline), `title “${r.content.personal.headline}”`);
    expect(r.content.custom.some((c) => c.title === "Additional Information" && /relocation/.test(c.items[0].description)), JSON.stringify(r.content.custom));
  });
  test("extra links and certificate details are kept", () => {
    const r = parseResumeText(`Sam Rahman\nsam@example.com | linkedin.com/in/samr | github.com/samr | behance.net/samr\n\nCERTIFICATIONS\nFinancial Modelling – CFI, Corporate Finance Institute, 2023\n\nEXPERIENCE\nAudit Intern 2023 – 2024\nKPMG`);
    expect(r.content.personal.website === "github.com/samr" && r.content.personal.links.some((l) => /behance/.test(l.url)), JSON.stringify(r.content.personal));
    expect(/Corporate Finance Institute/.test(r.content.certifications[0]?.issuer ?? ""), JSON.stringify(r.content.certifications));
  });
  test("design matching: font, size, colour, margins, page size, centred header", () => {
    const runs = [
      run({ text: "SAM RAHMAN", x: 236, width: 140, y: 740, fontSize: 20, bold: true, font: "Calibri-Bold" }),
      run({ text: "EXPERIENCE", x: 54, y: 700, fontSize: 12, bold: true, font: "Calibri-Bold" }),
      ...Array.from({ length: 12 }, (_, i) => run({ text: "Managed end-to-end financial operations for an international client", x: 54, width: 480, y: 680 - i * 14, fontSize: 10.5, font: "Calibri" })),
    ];
    const d = inferDesign({ runs, pageSizes: [{ w: 612, h: 792 }], headingColor: [0.12, 0.3, 0.6] }).design;
    expect(d.pageSize === "Letter" && d.font === "Source Sans 3" && d.fontSize === 10.5, JSON.stringify(d));
    expect(d.template === "classic", `centred header → classic, got ${d.template}`);
    expect(d.accent === "#1f4d99", `accent ${d.accent}`);
    expect(d.margin === 19, `margin ${d.margin}`);
    expect(mapFont("ABCDEF+TimesNewRomanPSMT") === "Source Serif 4" && mapFont("Arial-BoldMT") === "Inter", "font mapping");
  });
  test("design matching: a two-column CV gets a sidebar template", () => {
    const runs = [
      ...Array.from({ length: 7 }, (_, i) => run({ text: "Excel, SAP", x: 30, width: 150, y: 700 - i * 20 })),
      ...Array.from({ length: 8 }, (_, i) => run({ text: "Streamlined AP workflows through ERP-based process controls", x: 220, width: 350, y: 700 - i * 20 })),
    ];
    const d = inferDesign({ runs, pageSizes: [{ w: 595, h: 842 }] });
    expect(d.columns === 2 && d.design.template === "sidebar", `${d.columns} columns, ${d.design.template}`);
  });
  test("heading style: unusual headings styled like known ones are found, body lines aren't", () => {
    let hy = 800;
    const h = (text: string) => run({ text, fontSize: 12, bold: true, font: "Lato-Bold", y: (hy -= 40) });
    const runs = [h("EXPERIENCE"), h("EDUCATION"), h("SKILLS"), h("LEADERSHIP & IMPACT"), run({ text: "Managed a team of four", font: "Lato" }), run({ text: "KPMG", bold: true, fontSize: 10.5, font: "Lato-Bold" })];
    const mark = headingStyleMatcher(runs, isSectionHeading);
    expect(mark(runs[3]) && !mark(runs[4]) && !mark(runs[5]), runs.map((r) => `${r.text}:${mark(r)}`).join(" "));
  });
});

// Requested: a CV photo, shown only on templates designed for it
suite("CV photo", () => {
  test("the photo appears only on photo-enabled templates (and exactly once)", () => {
    const content = sampleContent();
    content.personal.photo = "data:image/jpeg;base64,/9j/AAAA";
    const enabled = TEMPLATE_DEFS.filter((t) => t.photo).map((t) => t.id);
    expect(enabled.length >= 5, `photo templates: ${enabled.join(", ")}`);
    for (const t of TEMPLATE_DEFS) {
      const html = renderToStaticMarkup(createElement(CVDocument, { doc: { content, layout: defaultLayout(), design: { ...DEFAULT_DESIGN, template: t.id } } }));
      const count = html.split('class="cv-photo"').length - 1;
      expect(count === (t.photo ? 1 : 0), `${t.name}: ${count} photo(s), template photo=${t.photo}`);
    }
  });
  test("no photo means no image and no layout change", () => {
    const content = sampleContent();
    const html = renderToStaticMarkup(createElement(CVDocument, { doc: { content, layout: defaultLayout(), design: { ...DEFAULT_DESIGN, template: "international" } } }));
    expect(!html.includes("cv-photo") && !html.includes("cv-h-details-photo"), "no photo markup without a photo");
  });
});

// Requested: an honest ATS test — read the CV back like a basic ATS and compare with what the user wrote
suite("ATS read-back test", () => {
  const c = sampleContent();
  const dates = (e: { startDate: string; endDate: string; current?: boolean }) => `${e.startDate} – ${e.current ? "Present" : e.endDate}`;
  const clean = [
    c.personal.fullName,
    [c.personal.email, c.personal.phone, c.personal.location].filter(Boolean).join(" | "),
    "",
    "SUMMARY",
    c.summary,
    "",
    "EXPERIENCE",
    ...c.experience.flatMap((e) => [`${e.role}   ${dates(e)}`, e.company, ...e.bullets.map((b) => `• ${b.text}`), ""]),
    "EDUCATION",
    ...c.education.map((e) => `${e.degree}${e.field ? ` in ${e.field}` : ""}, ${e.school}   ${dates(e)}`),
    "",
    "SKILLS",
    c.skills.map((s) => s.name).join(", "),
  ].join("\n");

  test("a cleanly laid-out CV reads back correctly", () => {
    const r = compareReadBack(c, clean);
    expect(r.ok >= r.total - 1, `${r.ok}/${r.total}: ${JSON.stringify(r.checks.filter((x) => x.status !== "ok"))}`);
    expect(r.checks.some((x) => x.label === "Email" && x.status === "ok"), "email must be read");
  });
  test("a CV whose experience can't be read is flagged", () => {
    const broken = clean.replace(/EXPERIENCE[\s\S]*?EDUCATION/, "EDUCATION");
    const r = compareReadBack(c, broken);
    expect(r.checks.filter((x) => x.label.startsWith("Job:")).every((x) => x.status === "missed"), JSON.stringify(r.checks));
    expect(r.ok < r.total, "score must drop");
  });
});

// Requested: "Fix it for me" in Review My CV — smart, permission-based, never invents
suite("Smart auto-fix (Review My CV)", () => {
  const content = sampleContent();
  content.experience[0].bullets.push(newBullet("Completed financila anaylis of vendor spend"));
  const snapshot = JSON.stringify(content);
  const plan = planAutoFixes(content, DEFAULT_DESIGN, 1);
  const fixed = applyAutoFixes(content, plan.fixes);
  const bulletTexts = (c: typeof content) => c.experience.flatMap((e) => e.bullets.map((b) => b.text));

  test("fixes weak openers and typos", () => {
    const t = bulletTexts(fixed);
    expect(!t.some((x) => /^(Responsible for|Helped with|Worked on)/i.test(x)), t.join(" | "));
    expect(t.some((x) => /financial analysis/i.test(x)), `typos not fixed: ${t.join(" | ")}`);
  });
  test("never adds or removes numbers in bullets", () => {
    const nums = (list: string[]) => list.join(" ").match(/\d+/g)?.sort().join(",") ?? "";
    expect(nums(bulletTexts(content)) === nums(bulletTexts(fixed)), `${nums(bulletTexts(content))} vs ${nums(bulletTexts(fixed))}`);
  });
  test("estimated score goes up; big changes are opt-in", () => {
    expect(plan.scoreAfter > plan.scoreBefore, `${plan.scoreBefore} → ${plan.scoreAfter}`);
    const rewrite = plan.fixes.find((f) => f.kind === "summary" && /Replaces|Adds/.test(f.reason));
    expect(!rewrite || rewrite.optional === true, "a full summary rewrite must be opt-in");
  });
  test("a misspelt bullet is fixed even when the correct words appear nowhere else in the CV", () => {
    const c = sampleContent();
    c.summary = "";
    c.skills = [];
    c.projects = [];
    c.experience = [c.experience[0]];
    c.experience[0].bullets = [newBullet("Completed financila anaylis of vendor spend.")];
    const p = planAutoFixes(c, DEFAULT_DESIGN, 1);
    const f = p.fixes.find((x) => x.kind === "bullet");
    expect(f && /financial analysis/.test(f.after), JSON.stringify(p.fixes.map((x) => x.after)));
  });
  test("planning and applying never change the original until the user applies", () => {
    expect(JSON.stringify(content) === snapshot, "original content was mutated");
  });
  test("assistant adds the user's own words to the summary", () => {
    const r = localAssistant([{ role: "user", content: "mention IFRS" }], { content: sampleContent(), selection: { scope: "section", section: "summary" }, job: null, design: DEFAULT_DESIGN });
    expect(r.actions.some((a) => a.type === "replace_summary" && /IFRS/.test(a.newText)), JSON.stringify(r.actions.map((a) => a.newText)));
  });
});

// Reported with a real CV: Leadership went into Training, roles/companies swapped, ACCA swallowed the BBA
suite("Import: real CV structure", () => {
  const TEXT = `Sam Rahman
sam.rahman@example.com | linkedin.com/in/samr | samrahman.lovable.app

§§ PROFESSIONAL EXPERIENCE
Wilbur (USA Clients), Client & Vendor Management Associate   10/2025 – 12/2025
•   Coordinated cross-functional real estate and mortgage operations involving clients,
vendors, and external partners across the USA.
KPMG in Bangladesh (Rahman Rahman Huq Chartered Accountants), Internship   07/2025 – 09/2025
•   Performed vouching, analytical procedures and prepared working papers.

§§ EDUCATION
ACCA Qualification (Ongoing) — Part Qualified (3/13 papers completed)

Bachelor of Business Administration (BBA), North South University   2019 – 2025
Major: Finance, CGPA: 3.02   Dhaka

§§ TRAINING AND WORKSHOP
Excel Boot Camp Spring 2025 by Career & Placement Center(CPC)

§§ LEADERSHIP & IMPACT
Founder | No Signature– Online Clothing Business:   2020 – 2022
•   Built and managed an online retail business from product sourcing to customer
acquisition.
•   Managed supplier negotiations, pricing decisions and operational execution.

§§ CO-CURRICULAR ACTVITIES
•   Runners up in amateur billiards tournament Chittagong.
•   Participated in university-level chess competitions, developing strategic decision-
making skills.
•   Provided one-on-one support to over 10 students.`;
  const r = parseResumeText(TEXT);
  const c = r.content;

  test("role and company aren't swapped when the job title comes second", () => {
    expect(c.experience[0]?.role === "Client & Vendor Management Associate" && c.experience[0]?.company === "Wilbur (USA Clients)", JSON.stringify(c.experience[0]));
    expect(c.experience[1]?.role === "Internship" && /^KPMG/.test(c.experience[1]?.company ?? ""), JSON.stringify(c.experience[1]));
  });
  test("an undated qualification doesn't swallow the next degree", () => {
    expect(c.education.length === 2, `${c.education.length} entries: ${c.education.map((e) => e.degree).join(" / ")}`);
    const bba = c.education[1];
    expect(bba?.degree === "Bachelor of Business Administration (BBA)" && bba?.school === "North South University" && bba?.field === "Finance" && bba?.location === "Dhaka", JSON.stringify(bba));
  });
  test("Leadership & Impact is its own section with title, dates and bullets", () => {
    const lead = c.custom.find((s) => s.title === "Leadership & Impact");
    const item = lead?.items[0];
    expect(item?.title === "Founder" && item?.subtitle === "No Signature– Online Clothing Business" && item?.date === "2020 – 2022", JSON.stringify(item));
    expect(/^• Built and managed an online retail business from product sourcing to customer acquisition\.\n• Managed/.test(item?.description ?? ""), JSON.stringify(item?.description));
    const training = c.custom.find((s) => s.title === "Training And Workshop");
    expect(training && !JSON.stringify(training).includes("Founder"), JSON.stringify(training));
    expect(!c.custom.some((s) => s.title === "Additional Information"), "nothing should be left over");
  });
  test("bulleted extra sections keep their bullets; website keeps its subdomain", () => {
    const co = c.custom.find((s) => /Co-Curricular/.test(s.title));
    expect(/^• Runners up/.test(co?.items[0]?.description ?? ""), JSON.stringify(co));
    expect(/decision-making skills/.test(co?.items[0]?.description ?? ""), "a line break at a hyphen isn't a space");
    const training = c.custom.find((s) => s.title === "Training And Workshop");
    expect(training?.items[0]?.description === "Excel Boot Camp Spring 2025 by Career & Placement Center(CPC)", `plain lines stay plain: ${JSON.stringify(training?.items)}`);
    expect(c.personal.website === "samrahman.lovable.app", c.personal.website);
  });
  test("section order and titles follow the original", () => {
    const titles = r.sections!.map((s) => s.title).join(" | ");
    expect(titles === "Professional Experience | Education | Training And Workshop | Leadership & Impact | Co-Curricular Actvities", titles);
  });
  test("a section can be re-parsed as another type from the review step", () => {
    const again = parseResumeText(TEXT, { kindOverrides: { "leadership & impact": "volunteer" } });
    expect(again.content.volunteer[0]?.role === "Founder" && again.content.volunteer[0]?.bullets.length === 2, JSON.stringify(again.content.volunteer));
  });
  test("custom sections render bullets as a list; heading-less items have no empty heading", () => {
    const content = sampleContent();
    const sec = newCustomSection("Leadership & Impact");
    const a = newCustomItem();
    Object.assign(a, { title: "Founder", subtitle: "No Signature", date: "2020 – 2022", description: "• Built an online store.\n• Managed suppliers." });
    const b = newCustomItem();
    b.description = "Excel Boot Camp Spring 2025";
    sec.items = [a, b];
    content.custom = [sec];
    const layout = { ...defaultLayout(), order: [...defaultLayout().order, `custom:${sec.id}`] };
    const html = renderToStaticMarkup(createElement(CVDocument, { doc: { content, layout, design: { ...DEFAULT_DESIGN } } }));
    expect(/<li>Built an online store\.<\/li><li>Managed suppliers\.<\/li>/.test(html), "bullets should render as <li>");
    expect(html.includes("Excel Boot Camp Spring 2025") && !html.includes("• Built"), "plain line kept, bullet glyph not printed as text");
  });
  test("summary clauses keep parallel verbs", () => {
    const g = toGerundClause("Analyzed invoice discrepancies and collaborated with cross-functional stakeholders.");
    expect(g === "analyzing invoice discrepancies and collaborating with cross-functional stakeholders", `got “${g}”`);
  });
});

// Reported: optimized summary opened with "PROFESSION SUMMARY", used a tutoring line, ignored the experience section
suite("Tailored summary", () => {
  const CV = `Sam Rahman
sam.rahman@example.com | +880 1712 345678
PROFESSION SUMMARY
Analytical and result-driven business graduate with experience across finance, consulting, real estate operations and process optimization. Demonstrated ability to work with international stakeholders, lead initiatives and continuously learn in fast-
paced environments.
EXPERIENCE
Accounts Executive (AP & Vendor Coordination) 01/2026 – Present
SMAC Advisory Ltd
• Analyzed invoice discrepancies and collaborated with cross-functional stakeholders to improve payment accuracy and operational efficiency.
• Streamlined AP workflows through ERP-based process controls and reconciliation practices.
• Supported month-end reporting and audit readiness through structured financial analysis and documentation.
Client & Vendor Management Associate 10/2025 – 12/2025
Wilbur (USA Clients)
• Reduced mortgage file processing and documentation turnaround time from 4–5 days to approximately 2 days through improved workflow coordination and stakeholder alignment.
EDUCATION
Bachelor of Business Administration (BBA), North South University 2019 – 2025
SKILLS
Excel, Jira, ERP systems
VOLUNTEER EXPERIENCE
Volunteer Tutor 2022 – 2023
Local Learning Centre
• Provided one-on-one support to over 10 students.`;
  const AP_JD = `Accounts Payable Analyst
Responsibilities
- Process vendor invoices and resolve invoice discrepancies
- Perform vendor reconciliations and support month-end close
- Maintain AP controls in the ERP system and support audits
Requirements
- 1+ years of accounts payable or finance experience
- Strong Excel skills and ERP experience
- Bachelor's degree in Business, Finance or Accounting`;
  const content = parseResumeText(CV).content;
  const job = analyzeJobDescription(AP_JD);
  const design = { ...DEFAULT_DESIGN };
  const plan = generateOptimizationSuggestions({ content, layout: defaultLayout(), design }, job, calculateJobMatch(content, design, job), "balanced");
  const s = plan.changes.find((c) => c.kind === "summary");
  const text = s?.after ?? "";

  test("“PROFESSION SUMMARY” is read as a heading, and the summary imports in full", () => {
    expect(!/summary/i.test(content.personal.headline), `title “${content.personal.headline}”`);
    expect(/fast-paced environments\.$/.test(content.summary), `summary ends “${content.summary.slice(-40)}”`);
  });
  test("roles and companies keep their closing bracket", () => {
    expect(content.experience[0]?.role === "Accounts Executive (AP & Vendor Coordination)", `role “${content.experience[0]?.role}”`);
    expect(content.experience[1]?.company === "Wilbur (USA Clients)", `company “${content.experience[1]?.company}”`);
  });
  test("opens with the real title, uses the experience section, 40–60 words, no filler", () => {
    expect(/^Accounts Executive with /.test(text), `summary: “${text}”`);
    const wc = text.split(/\s+/).length;
    expect(wc >= 35 && wc <= 62, `${wc} words: “${text}”`);
    expect(!/results?[- ]driven|passionate|analytical thinking|team player/i.test(text), `generic phrase in “${text}”`);
    expect(!/students|tutor/i.test(text), "volunteer tutoring is irrelevant to an AP job");
    expect(/invoice|AP workflows|reconciliation/i.test(text), `no job-relevant experience in “${text}”`);
    expect(!/\bJira\b/.test(text), "tools the job doesn't ask for shouldn't pad the summary");
  });
  test("a cut-off summary is finished in the user's own words", () => {
    const p = polishSummary("Analytical business graduate with experience across finance. Demonstrated ability to work with international stakeholders, lead initiatives and continuously learn in fast-");
    expect(p === "Analytical business graduate with experience across finance. Demonstrated ability to work with international stakeholders and lead initiatives.", `got “${p}”`);
  });
});

// Reported: an imported address ("G-block, Bashundhara R/A…") ended up as the title and opened the optimized summary
suite("Personal details stay in the header", () => {
  const ADDRESS = "G-block,Bashundhara R/A, Dhaka, Bangladesh";
  const ADDR_RE = /g-block|bashundhara/i;
  const withAddressTitle = () => {
    const c = sampleContent();
    c.personal.headline = ADDRESS;
    return c;
  };
  const job = analyzeJobDescription(JD);

  test("import puts an address line in Location, not the professional title", () => {
    const r = parseResumeText(`Sam Rahman\n${ADDRESS}\nsam.rahman@example.com | +880 1712 345678\n\nExperience\nBusiness Analyst, Acme Ltd\nJan 2024 – Present\n- Analyzed sales data in Excel`);
    expect(!ADDR_RE.test(r.content.personal.headline), `title was “${r.content.personal.headline}”`);
    expect(ADDR_RE.test(r.content.personal.location), `location was “${r.content.personal.location}”`);
  });
  test("optimized summary never opens with (or contains) the address", () => {
    const content = withAddressTitle();
    const design = { ...DEFAULT_DESIGN };
    const plan = generateOptimizationSuggestions({ content, layout: defaultLayout(), design }, job, calculateJobMatch(content, design, job), "balanced");
    const summary = plan.changes.find((ch) => ch.kind === "summary");
    expect(summary, "a summary suggestion is still made");
    expect(!ADDR_RE.test(summary!.after), `summary: “${summary!.after}”`);
    expect(/^Finance Analyst\b/.test(summary!.after), `should open with the real role, got “${summary!.after.slice(0, 40)}”`);
  });
  test("assistant summary versions don't contain the address", () => {
    const r = localAssistant([{ role: "user", content: "Give me three versions of my summary." }], { content: withAddressTitle(), selection: { scope: "global" }, job: null, design: DEFAULT_DESIGN });
    expect(r.actions.length > 0 && r.actions.every((a) => !ADDR_RE.test(a.newText)), r.actions.map((a) => a.newText).join(" || "));
  });
  test("validators block address text in the summary", () => {
    const content = withAddressTitle();
    const v = validateAction({ type: "replace_summary", section: "summary", itemId: "", bulletId: "", oldText: "", label: "", newText: `${ADDRESS}. with 1+ year of experience in business analysis.` }, content);
    expect(!v.ok, "an address in the summary must be rejected");
    expect(!validateAction({ type: "update_headline", section: "personal", itemId: "", bulletId: "", oldText: "", label: "", newText: ADDRESS }, content).ok, "an address is not a title");
  });
  test("Review My CV flags an address used as the title", () => {
    const items = reviewCV(withAddressTitle(), DEFAULT_DESIGN).items;
    expect(items.some((i) => /professional title doesn't look like a job title/i.test(i.title)), "should flag the title");
  });
});

suite("Free to run: paid AI can't switch itself on", () => {
  const KEY = "sk-ant-test";
  test("a key left in the hosting dashboard does NOT enable paid AI in production", () => {
    expect(!claudeAllowed({ ANTHROPIC_API_KEY: KEY, NODE_ENV: "production" }), "production must stay on the free on-device engine");
    expect(!claudeAllowed({ ANTHROPIC_AUTH_TOKEN: KEY, NODE_ENV: "production" }), "an auth token must not enable it either");
  });
  test("production needs the explicit opt-in as well as a key", () => {
    expect(claudeAllowed({ ANTHROPIC_API_KEY: KEY, FITTED_ENABLE_CLAUDE: "1", NODE_ENV: "production" }), "explicit opt-in should work");
    expect(!claudeAllowed({ FITTED_ENABLE_CLAUDE: "1", NODE_ENV: "production" }), "the opt-in alone, with no key, must not enable it");
  });
  test("the kill switch beats every other setting", () => {
    expect(!claudeAllowed({ ANTHROPIC_API_KEY: KEY, FITTED_ENABLE_CLAUDE: "1", FITTED_DISABLE_CLAUDE: "1", NODE_ENV: "production" }), "FITTED_DISABLE_CLAUDE=1 must win");
  });
  test("local development still works with just a key", () => {
    expect(claudeAllowed({ ANTHROPIC_API_KEY: KEY, NODE_ENV: "development" }), "npm run dev with a key should use Claude");
    expect(!claudeAllowed({ NODE_ENV: "development" }), "no key, no paid AI");
  });
});

suite("Import: PDFs that report the wrong glyph widths", () => {
  /* Some CV generators embed subset fonts with missing or default widths. Every piece of text is then
     reported far wider than it is drawn, so the gap between two words measures as zero or negative and
     the words run together ("SMAC Advisory Ltd" → "SMACAdvisoryLtd"). Item positions stay correct. */
  const SIZE = 10;
  const REAL = 5.1; // what a character is actually drawn at
  const LIED = 9.4; // what the PDF claims a character is

  function itemsFor(words: string[], y: number, startX = 50) {
    let x = startX;
    return words.map((str) => {
      const it = { str, transform: [SIZE, 0, 0, SIZE, x, y], width: str.length * LIED, height: SIZE, fontName: "g_d0_f1" };
      x += str.length * REAL + REAL; // advance, plus the space that follows
      return it;
    });
  }

  test("words separated only by position still come back with their spaces", () => {
    const items = [...itemsFor(["SMAC", "Advisory", "Ltd", "(Snehasish", "Mahmud", "&", "Co.)"], 700), ...itemsFor(["Bachelor", "of", "Business", "Administration", "(BBA)"], 680)];
    const runs = buildRuns(items, 0, () => ({}));
    const text = runs.map((r) => r.text).join(" | ");
    expect(text.includes("SMAC Advisory Ltd (Snehasish Mahmud & Co.)"), `company came back as: ${text}`);
    expect(text.includes("Bachelor of Business Administration (BBA)"), `degree came back as: ${text}`);
  });

  test("a right-aligned date is still its own run, not glued to the job title", () => {
    const items = [...itemsFor(["Executive", "Accountant"], 660), ...itemsFor(["01/2026", "–", "Present"], 660, 470)];
    const runs = buildRuns(items, 0, () => ({}));
    expect(runs.length === 2, `expected the title and the date to stay apart, got ${JSON.stringify(runs.map((r) => r.text))}`);
    expect(runs[0].text === "Executive Accountant", `title: “${runs[0].text}”`);
  });

  test("a space the PDF spells out is honoured even when the gap measures zero", () => {
    const items = [
      { str: "North", transform: [SIZE, 0, 0, SIZE, 50, 640], width: 5 * LIED, height: SIZE, fontName: "f1" },
      { str: " ", transform: [SIZE, 0, 0, SIZE, 75, 640], width: LIED, height: SIZE, fontName: "f1" },
      { str: "South", transform: [SIZE, 0, 0, SIZE, 78, 640], width: 5 * LIED, height: SIZE, fontName: "f1" },
    ];
    expect(buildRuns(items, 0, () => ({}))[0].text === "North South", `got “${buildRuns(items, 0, () => ({}))[0].text}”`);
  });

  test("a PDF with honest widths is unchanged — no spaces invented inside words", () => {
    let x = 50;
    const items = ["Power", "Point", "2024"].map((str) => {
      const it = { str, transform: [SIZE, 0, 0, SIZE, x, 620], width: str.length * REAL, height: SIZE, fontName: "f1" };
      x += str.length * REAL; // no space between them at all
      return it;
    });
    expect(buildRuns(items, 0, () => ({}))[0].text === "PowerPoint2024", `got “${buildRuns(items, 0, () => ({}))[0].text}”`);
  });
});

suite("A project's link is a real link", () => {
  const docFor = (template: (typeof TEMPLATE_DEFS)[number]["id"]) => {
    const content = sampleContent();
    content.projects = [{ id: "p1", name: "Fitted — AI CV Builder", role: "", link: "https://fitted-cv.vercel.app/", startDate: "", endDate: "", bullets: [newBullet("Built an AI-powered CV builder.")] }];
    const layout = defaultLayout();
    if (!layout.order.includes("projects")) layout.order.push("projects");
    layout.hidden = layout.hidden.filter((k) => k !== "projects");
    return { content, layout, design: { ...DEFAULT_DESIGN, template } };
  };

  test("every template renders the URL as a clickable anchor", () => {
    for (const t of TEMPLATE_DEFS) {
      const html = renderToStaticMarkup(createElement(CVDocument, { doc: docFor(t.id) }));
      expect(html.includes('href="https://fitted-cv.vercel.app/"'), `${t.name}: the project URL is not a link`);
      expect(html.includes("fitted-cv.vercel.app"), `${t.name}: the project URL is missing`);
    }
  });

  test("thumbnails keep it as plain text (a link inside a link is invalid)", () => {
    const html = renderToStaticMarkup(createElement(CVDocument, { doc: docFor("modern"), interactive: false }));
    expect(!html.includes("<a "), "a thumbnail must not contain anchors");
    expect(html.includes("fitted-cv.vercel.app"), "the URL should still be shown");
  });
});

suite("Job posting written as prose, not bullets", () => {
  const JD = [
    "Backend Engineer — Fintech Ltd, Dhaka",
    "",
    "We are looking for a backend engineer with strong .NET and C# experience. You will build REST and GraphQL APIs and work with Docker. Requirements: 2+ years with .NET, SQL, Git, Agile. Nice to have: Angular, Kubernetes, Azure.",
  ].join("\n");

  test("a required list and a nice-to-have list in one paragraph stay apart", () => {
    const a = analyzeJobDescription(JD);
    expect(a.requiredSkills.includes(".NET"), `.NET should be required, got required=${JSON.stringify(a.requiredSkills)}`);
    expect(a.requiredSkills.includes("SQL") && a.requiredSkills.includes("Git"), `required=${JSON.stringify(a.requiredSkills)}`);
    for (const nice of ["Angular", "Kubernetes", "Azure"]) {
      expect(a.preferredSkills.includes(nice), `${nice} should be preferred, got ${JSON.stringify(a.preferredSkills)}`);
      expect(!a.requiredSkills.includes(nice), `${nice} must not be required`);
    }
  });

  test("a requirement written as prose still counts as required", () => {
    const a = analyzeJobDescription(JD);
    expect(a.requiredSkills.includes("C#"), `"strong .NET and C# experience" should make C# required, got ${JSON.stringify(a.requiredSkills)}`);
  });
});

suite("Import: a dense technical CV", () => {
  // Shaped like a real software-engineering CV: long bullets that wrap onto a second line,
  // a projects list with one project per bullet, and a phone number that looks like a date range.
  const CV = [
    "ARIYAN JAHANGIR",
    "Software Engineer — Full-Stack & API Integrations",
    "Dhaka, Bangladesh | ariyan@example.com | +880 1817 274124",
    "",
    "§§ PROFESSIONAL EXPERIENCE",
    "",
    "Full Stack Assistant Software Engineer — A4Aero Limited   Dec 2024 – Present",
    "• Work extensively with REST, GraphQL and SOAP APIs; deliver secure auth via Google OAuth and",
    "Meta Auth.",
    "",
    "Junior Software Engineer — Accelx Inc.   Feb 2024 – Nov 2024",
    "• Containerized services with Docker; automated ML workflows via",
    "Shell/Python and integrated models into Django backends.",
    "",
    "§§ SELECTED PROJECTS",
    "",
    "• Huddle — huddle.ariyan.app — Real-time collaboration platform combining chat and file sharing.",
    "• FairSplit — fair-split.ariyan.app — Utility bill-splitting app for shared electricity costs.",
    "",
    "§§ EDUCATION",
    "",
    "Bachelor of Science, Computer Science and Engineering   Jan 2019 – Mar 2023",
    "American International University-Bangladesh — CGPA 3.94, Magna Cum Laude",
    "",
    "§§ REFERENCES",
    "",
    "D M Imtiaz Ul Amin — Senior Account Manager, Ericsson | imtiaz@example.com | +880 1613-142805",
  ].join("\n");

  test("a bullet wrapped onto a second line is not read as a new job title", () => {
    const { content } = parseResumeText(CV);
    expect(content.experience.length === 2, `expected 2 jobs, got ${content.experience.length}: ${content.experience.map((e) => e.role).join(" | ")}`);
    expect(
      content.experience.every((e) => e.company),
      "every job keeps its company",
    );
    const first = content.experience[0].bullets.map((b) => b.text).join(" ");
    expect(/Google OAuth and Meta Auth\./.test(first), `wrapped bullet was not re-joined: ${first}`);
    const second = content.experience[1].bullets.map((b) => b.text).join(" ");
    expect(/workflows via Shell\/Python and integrated/.test(second), `wrapped bullet was not re-joined: ${second}`);
  });

  test("a projects list keeps each project's name and link", () => {
    const { projects } = parseResumeText(CV).content;
    expect(projects.length === 2, `expected 2 projects, got ${projects.length}`);
    expect(projects[0].name === "Huddle", `name was “${projects[0].name}”`);
    expect(projects[0].link === "huddle.ariyan.app", `link was “${projects[0].link}”`);
    expect(projects[1].name === "FairSplit", `name was “${projects[1].name}”`);
  });

  test("the subject after a degree is the field, and the university line is the school", () => {
    const e = parseResumeText(CV).content.education[0];
    expect(e.degree === "Bachelor of Science", `degree was “${e.degree}”`);
    expect(e.field === "Computer Science and Engineering", `field was “${e.field}”`);
    expect(/American International University/.test(e.school), `school was “${e.school}”`);
    expect(/3\.94/.test(e.grade), `grade was “${e.grade}”`);
  });

  test("ordinary CV prose is not mistaken for a postal address", () => {
    // "building scalable APIs" and "state of the art" are not addresses; "G-block, Bashundhara" is.
    const prose = ["Full-stack Software Engineer at A4Aero Limited building scalable .NET 8 APIs and Angular applications.", "Delivered state of the art analytics for a district heating client.", "Led a 5-person team building Django services."];
    for (const s of prose) expect(!looksLikeAddress(s), `treated as an address: “${s}”`);
    const addresses = ["G-block, Bashundhara R/A, Dhaka, Bangladesh", "House 12, Road 5, Dhanmondi, Dhaka", "Rangs Building, 5th Floor, Tejgaon, Dhaka"];
    for (const s of addresses) expect(looksLikeAddress(s), `not recognized as an address: “${s}”`);
  });

  test("a phone number is never read as a date range", () => {
    const { content } = parseResumeText(CV);
    const dates = [
      ...content.experience.flatMap((e) => [e.startDate, e.endDate]),
      ...content.education.flatMap((e) => [e.startDate, e.endDate]),
      ...content.custom.flatMap((s) => s.items.map((i) => i.date)),
    ].filter(Boolean);
    expect(
      dates.every((d) => /^(?:[A-Za-z]{3,9}\s)?(?:19|20)\d{2}$|^Present$/.test(d)),
      `a phone number was read as a date: ${dates.join(", ")}`,
    );
    const ref = content.custom.find((s) => /references/i.test(s.title));
    expect(ref?.items.every((i) => !i.date), "the reference's phone number must not become a date");
  });
});
