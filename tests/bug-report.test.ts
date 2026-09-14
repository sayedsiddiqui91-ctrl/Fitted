import { suite, test, expect } from "./harness";
import { BUG_FEATURES, BUG_FORM_FIELDS, BugReportSchema, bugFormUrl, describeBrowser, toFormBody } from "../src/lib/bugReport";

suite("Report a bug", () => {
  test("a report fills every field of the Google Form: Name · Feature · Comment · Page · Browser · Time", () => {
    const r = BugReportSchema.parse({ name: " Ayon ", feature: "Job Optimizer", comment: "The match score stayed at 0 after I pasted the job.", page: "/app/optimize" });
    const body = toFormBody(r, { browser: "Chrome · Windows", time: new Date("2026-09-14T10:00:00Z") });
    expect([...body.keys()].length === 6, `expected 6 fields, got ${[...body.keys()].length}`);
    expect(body.get(BUG_FORM_FIELDS.name) === "Ayon", "name is trimmed");
    expect(body.get(BUG_FORM_FIELDS.feature) === "Job Optimizer" && body.get(BUG_FORM_FIELDS.page) === "/app/optimize", "feature and page are kept");
    expect(body.get(BUG_FORM_FIELDS.browser) === "Chrome · Windows" && body.get(BUG_FORM_FIELDS.time) === "2026-09-14T10:00:00.000Z", "browser and time are recorded");
    expect(new Set(Object.values(BUG_FORM_FIELDS)).size === 6 && Object.values(BUG_FORM_FIELDS).every((f) => /^entry\.\d+$/.test(f)), "every column maps to a distinct entry id");
    expect(bugFormUrl().endsWith("/formResponse"), "submits to the form's response endpoint");
  });

  test("a report needs a real description and a known feature", () => {
    expect(!BugReportSchema.safeParse({ feature: "Edit PDF", comment: "broken" }).success, "a 6-character comment is rejected");
    expect(!BugReportSchema.safeParse({ feature: "Made-up area", comment: "Something went wrong on the page." }).success, "an unknown feature is rejected");
    expect(BugReportSchema.safeParse({ feature: BUG_FEATURES[0], comment: "Something went wrong on the page." }).success, "name and page are optional");
  });

  test("the browser column is a short readable label, not the whole user-agent", () => {
    const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(describeBrowser(ua) === "Safari · iOS", `got "${describeBrowser(ua)}"`);
    const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
    expect(describeBrowser(chrome) === "Chrome · Windows", `got "${describeBrowser(chrome)}"`);
    expect(describeBrowser(null) === "", "no user-agent is an empty cell");
  });
});
