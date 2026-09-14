import { suite, test, expect } from "./harness";
import { BUG_FEATURES, BugReportSchema, describeBrowser, toSheetRow } from "../src/lib/bugReport";

suite("Report a bug", () => {
  test("a report becomes a row in the sheet's column order: Name · Feature · Comment · Page · Browser · Time", () => {
    const r = BugReportSchema.parse({ name: " Ayon ", feature: "Job Optimizer", comment: "The match score stayed at 0 after I pasted the job.", page: "/app/optimize" });
    const row = toSheetRow(r, { browser: "Chrome · Windows", time: new Date("2026-09-14T10:00:00Z") });
    expect(row.length === 6, `expected 6 columns, got ${row.length}`);
    expect(row[0] === "Ayon", "name is trimmed");
    expect(row[1] === "Job Optimizer" && row[3] === "/app/optimize", "feature and page are kept");
    expect(row[4] === "Chrome · Windows" && row[5] === "2026-09-14T10:00:00.000Z", "browser and time are recorded");
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
