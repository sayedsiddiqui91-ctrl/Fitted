import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { suite, test, expect } from "./harness";
import { CVDocument } from "../src/components/cv/CVDocument";
import { TEMPLATE_DEFS } from "../src/lib/cv/templates";
import { DEFAULT_DESIGN, TEMPLATE_DESIGN_DEFAULTS, defaultLayout, newBullet, newExperience, newSkill, sampleContent } from "../src/lib/cv/defaults";

const c = sampleContent();
c.personal.fullName = "Maximilian Alexander Konstantinos Papadopoulos-Ramírez";
c.experience[0].company = "International Consolidated Logistics and Freight Forwarding Holdings Group Ltd";
const extra = newExperience();
extra.role = "Accounts Assistant";
extra.company = "Café & Co. “Quotes” <Test>";
extra.bullets = [newBullet("Reconciled accounts weekly — including €, £ and ¥ transactions")];
c.experience.push(extra);
c.skills = Array.from({ length: 30 }, (_, i) => newSkill(`Skill${i}`));

const expected = [c.personal.fullName, c.summary, ...c.experience.flatMap((e) => [e.role, e.company, ...e.bullets.map((b) => b.text)]), ...c.skills.map((s) => s.name), ...c.education.map((e) => e.school)];
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
const text = (html: string) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");

suite(`Templates (${TEMPLATE_DEFS.length})`, () => {
  test("at least 15 templates, several ATS-friendly", () => {
    expect(TEMPLATE_DEFS.length >= 15, "template count");
    expect(TEMPLATE_DEFS.filter((t) => t.atsFriendly).length >= 8, "ATS-friendly count");
  });
  for (const t of TEMPLATE_DEFS) {
    test(`${t.name}: renders every piece of CV data`, () => {
      const html = renderToStaticMarkup(createElement(CVDocument, { doc: { content: c, layout: defaultLayout(), design: { ...DEFAULT_DESIGN, ...TEMPLATE_DESIGN_DEFAULTS[t.id], template: t.id } } }));
      const out = text(html);
      const missing = expected.filter((s) => !out.includes(s.replace(/\s+/g, " ")));
      expect(missing.length === 0, `missing: ${missing.slice(0, 3).join(" | ")}`);
    });
  }
  test("missing sections render no empty headings", () => {
    const sparse = { ...sampleContent(), summary: "", education: [], skills: [], certifications: [], languages: [] };
    for (const t of TEMPLATE_DEFS) {
      const html = renderToStaticMarkup(createElement(CVDocument, { doc: { content: sparse, layout: defaultLayout(), design: { ...DEFAULT_DESIGN, template: t.id } } }));
      expect(!/<h2 class="cv-h2">[^<]*<\/h2><\/section>/.test(html), `${t.id} has an empty section`);
    }
  });
});
