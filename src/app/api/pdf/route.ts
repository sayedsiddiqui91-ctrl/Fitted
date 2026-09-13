import { clientKey, rateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

/* Server-side PDF generation with headless Chrome.
   The CV is rendered in memory and never stored. The page runs with
   JavaScript disabled and can only load Google Fonts — nothing else. */

type Browser = import("puppeteer-core").Browser;
let browserPromise: Promise<Browser> | null = null;

/** Use an explicitly configured browser, Puppeteer's bundled Chrome, or a locally installed Chrome/Edge. */
async function findExecutable(): Promise<string | undefined> {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const { existsSync } = await import("node:fs");
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  return candidates.find((p) => existsSync(p));
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      /* On Vercel (and any serverless host) there is no Chrome installed. Without one this route failed and
         every download fell back to the browser's print dialog — which many phones and in-app browsers
         (Messenger, Facebook, Instagram) silently ignore, so tapping Download did nothing at all.
         @sparticuz/chromium ships a Chromium built for serverless functions; its version is pinned to
         match puppeteer-core (Chrome 152). */
      if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
        const chromium = (await import("@sparticuz/chromium")).default;
        const core = (await import("puppeteer-core")).default;
        return core.launch({
          args: await core.defaultArgs({ args: [...chromium.args, "--font-render-hinting=none"], headless: "shell" }),
          executablePath: await chromium.executablePath(),
          headless: "shell",
        });
      }
      const p = (await import("puppeteer")).default;
      const args = ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"];
      try {
        return await p.launch({ headless: true, args });
      } catch {
        const executablePath = await findExecutable();
        if (!executablePath) throw new Error("no browser");
        return p.launch({ headless: true, args, executablePath });
      }
    })();
    browserPromise.catch(() => (browserPromise = null));
  }
  const b = await browserPromise;
  if (!b.connected) {
    browserPromise = null;
    return getBrowser();
  }
  return b;
}

const ALLOWED = [/^data:/, /^https:\/\/fonts\.googleapis\.com\//, /^https:\/\/fonts\.gstatic\.com\//, /^about:blank/];

export async function POST(req: Request) {
  if (!rateLimit(`pdf:${clientKey(req)}`, 30, 10 * 60_000)) {
    return Response.json({ error: "Too many downloads in a short time. Please wait a minute and try again." }, { status: 429 });
  }
  let html: string;
  try {
    const body = (await req.json()) as { html?: unknown };
    if (typeof body.html !== "string" || body.html.length > 1_500_000 || !body.html.includes("cv-root")) throw new Error("bad");
    html = body.html;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  let page: import("puppeteer-core").Page | null = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (r) => (ALLOWED.some((re) => re.test(r.url())) ? r.continue() : r.abort()));
    await page.setContent(html, { waitUntil: "load", timeout: 20_000 });
    // let web fonts finish downloading before printing
    await page.waitForNetworkIdle({ idleTime: 300, timeout: 8_000 }).catch(() => undefined);
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, tagged: true });
    return new Response(Buffer.from(pdf), {
      headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store", "Content-Disposition": "attachment" },
    });
  } catch {
    return Response.json({ error: "PDF generation is unavailable right now." }, { status: 503 });
  } finally {
    await page?.close().catch(() => undefined);
  }
}
