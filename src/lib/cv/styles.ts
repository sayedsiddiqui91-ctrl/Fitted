/* CV stylesheet — plain CSS (not Tailwind) so the exact same styles power the
   live preview, thumbnails, the print fallback and server-side PDF export.
   Templates only change presentation; content markup is shared and semantic
   (h1/h2/ul/li, real text) so ATS parsers can read it. */

export const CV_CSS = `
.cv-root{--cv-accent:#2b4c9a;--cv-font:Inter,Arial,sans-serif;--cv-fs:10;--cv-hs:1;--cv-lh:1.4;--cv-ss:1;--cv-margin:16mm;--cv-text:#1d2025;--cv-muted:#555b66;--cv-rule:#dadde2;
  font-family:var(--cv-font);color:var(--cv-text);font-size:calc(var(--cv-fs) * 1pt);line-height:var(--cv-lh);
  -webkit-print-color-adjust:exact;print-color-adjust:exact;text-align:left;font-kerning:normal;overflow-wrap:break-word;color-scheme:light}
.cv-root *{box-sizing:border-box;margin:0;padding:0}
.cv-page{background:#fff;width:var(--cv-pw,210mm);min-height:var(--cv-ph,297mm);padding:var(--cv-margin);position:relative}
.cv-root a{color:inherit;text-decoration:none}
.cv-root a.cv-a{color:var(--cv-accent)}
.cv-root a.cv-a:hover{text-decoration:underline}
.cv-name{font-size:calc(var(--cv-fs) * 2.3pt * var(--cv-hs));font-weight:700;line-height:1.12;letter-spacing:-0.01em}
.cv-headline{font-size:calc(var(--cv-fs) * 1.15pt);color:var(--cv-muted);margin-top:.2em;font-weight:500}
.cv-contact{display:flex;flex-wrap:wrap;gap:.1em .45em;margin-top:.6em;font-size:calc(var(--cv-fs) * .92pt);color:var(--cv-muted)}
.cv-contact .cv-dot{color:var(--cv-rule)}
.cv-section{margin-top:calc(1.15em * var(--cv-ss))}
.cv-h2{font-size:calc(var(--cv-fs) * 1.1pt * var(--cv-hs));font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--cv-accent);margin-bottom:.5em;break-after:avoid;page-break-after:avoid;line-height:1.25}
.cv-item{break-inside:avoid;page-break-inside:avoid;margin-bottom:calc(.75em * var(--cv-ss))}
.cv-item:last-child{margin-bottom:0}
.cv-row{display:flex;justify-content:space-between;gap:1em;align-items:baseline}
.cv-row > :first-child{min-width:0}
.cv-title{font-weight:650}
.cv-org{font-weight:500}
.cv-date,.cv-loc{white-space:nowrap;color:var(--cv-muted);font-size:calc(var(--cv-fs) * .92pt);flex-shrink:0}
.cv-sub{color:var(--cv-muted)}
.cv-bullets{margin-top:.28em;padding-left:1.1em;list-style:disc}
.cv-bullets li{margin-bottom:.14em;padding-left:.2em}
.cv-bullets li::marker{color:var(--cv-muted)}
.cv-text{white-space:pre-line}
.cv-skill-line{margin-bottom:.2em}
.cv-skill-line b{font-weight:600}
.cv-compact{display:flex;justify-content:space-between;gap:1em;margin-bottom:.25em}
.cv-placeholder{color:#b5b9c0}
.cv-desc{margin-top:.2em}

/* ── Modern ── */
.cv-t-modern .cv-headline{color:var(--cv-accent)}
.cv-t-modern .cv-h2{display:flex;align-items:center;gap:.6em}
.cv-t-modern .cv-h2::after{content:"";flex:1;height:1px;background:var(--cv-rule)}
.cv-t-modern .cv-org{color:var(--cv-accent)}
.cv-t-modern .cv-header{padding-bottom:.2em}

/* ── Classic ── */
.cv-t-classic .cv-header{text-align:center}
.cv-t-classic .cv-contact{justify-content:center}
.cv-t-classic .cv-name{font-weight:600;letter-spacing:.02em}
.cv-t-classic .cv-h2{color:var(--cv-text);letter-spacing:.04em;font-size:calc(var(--cv-fs) * 1.08pt * var(--cv-hs));border-bottom:1px solid var(--cv-accent);padding-bottom:.1em;font-weight:600}
.cv-t-classic .cv-role{font-style:italic}

/* ── Minimal ── */
.cv-t-minimal{--cv-muted:#4b5059}
.cv-t-minimal .cv-name{font-size:calc(var(--cv-fs) * 2pt * var(--cv-hs));font-weight:600}
.cv-t-minimal .cv-h2{color:var(--cv-text);font-size:calc(var(--cv-fs) * 1pt * var(--cv-hs));letter-spacing:.05em;font-weight:600;margin-bottom:.4em}
.cv-t-minimal .cv-section{border-top:1px solid var(--cv-rule);padding-top:.7em;margin-top:calc(.95em * var(--cv-ss))}
.cv-t-minimal .cv-contact{color:var(--cv-text)}

/* ── Executive ── */
.cv-t-executive .cv-header{border-bottom:2px solid var(--cv-accent);padding-bottom:.8em}
.cv-t-executive .cv-name{font-size:calc(var(--cv-fs) * 2.5pt * var(--cv-hs));font-weight:600;letter-spacing:.01em}
.cv-t-executive .cv-headline{text-transform:uppercase;letter-spacing:.05em;font-size:calc(var(--cv-fs) * .95pt);color:var(--cv-accent);font-weight:600}
.cv-t-executive .cv-h2{color:var(--cv-accent);letter-spacing:.05em;font-size:calc(var(--cv-fs) * 1pt * var(--cv-hs));border-bottom:1px solid var(--cv-rule);padding-bottom:.25em}
.cv-t-executive .cv-org{font-weight:700;text-transform:uppercase;letter-spacing:.01em;font-size:calc(var(--cv-fs) * .95pt)}
.cv-t-executive .cv-role{font-style:italic;color:var(--cv-muted)}

/* ═══ Generic layout building blocks (used by the template registry) ═══ */
.cv-name{overflow-wrap:anywhere}
.cv-cols{display:grid;gap:1.6em;margin-top:.5em;align-items:start}
.cv-cols-left{grid-template-columns:31% minmax(0,1fr)}
.cv-cols-right{grid-template-columns:minmax(0,1fr) 33%}
.cv-main,.cv-aside{min-width:0}
.cv-aside .cv-section:first-child{margin-top:0}
.cv-aside .cv-compact{display:block}
.cv-stack > div{margin-bottom:.3em}
.cv-stack .cv-muted,.cv-muted{color:var(--cv-muted);font-size:calc(var(--cv-fs) * .9pt)}
.cv-h-split{display:flex;justify-content:space-between;align-items:flex-end;gap:1.5em}
.cv-h-split .cv-h-id{min-width:0}
.cv-contact-stack{display:flex;flex-direction:column;align-items:flex-end;gap:.08em;margin-top:0;text-align:right;flex-shrink:0;max-width:46%}
.cv-details{display:grid;grid-template-columns:auto minmax(0,1fr) auto minmax(0,1fr);gap:.18em .9em;margin-top:.65em;font-size:calc(var(--cv-fs) * .92pt)}
.cv-details dt{color:var(--cv-muted);font-weight:600}
.cv-details dd{min-width:0;overflow-wrap:anywhere}
.cv-rail{display:grid;grid-template-columns:23% minmax(0,1fr);gap:1.1em;align-items:start}
.cv-rail > .cv-h2{margin-bottom:0;padding-top:.15em}
.cv-rail-body{min-width:0}
.cv-dl{display:grid;grid-template-columns:18% minmax(0,1fr);gap:1em}
.cv-dl-side .cv-date,.cv-dl-side .cv-loc{white-space:normal;display:block}
.cv-dl-side .cv-loc{margin-top:.1em}
.cv-dl-main{min-width:0}
.cv-line{min-width:0}
.cv-tags{display:flex;flex-wrap:wrap;gap:.3em .35em}
.cv-skill-line .cv-tags{display:inline-flex;vertical-align:top}
.cv-tag{display:inline-block;padding:.1em .55em;border-radius:4px;background:color-mix(in srgb,var(--cv-accent) 9%,#fff);border:1px solid color-mix(in srgb,var(--cv-accent) 22%,#fff);font-size:calc(var(--cv-fs) * .9pt)}
.cv-skill-cols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.15em 1em;list-style:none}
.cv-skill-cols li{position:relative;padding-left:.85em}
.cv-skill-cols li::before{content:"";position:absolute;left:0;top:.58em;width:.32em;height:.32em;border-radius:50%;background:var(--cv-accent)}
.cv-tl{position:relative;padding-left:1.15em;border-left:2px solid color-mix(in srgb,var(--cv-accent) 28%,#fff);margin-left:.35em;padding-bottom:.25em}
.cv-tl::before{content:"";position:absolute;left:-.43em;top:.28em;width:.62em;height:.62em;border-radius:50%;background:#fff;border:2px solid var(--cv-accent)}
.cv-tl-date{font-size:calc(var(--cv-fs) * .82pt);color:var(--cv-accent);font-weight:700;letter-spacing:.05em;text-transform:uppercase}

/* ── Creative ── */
.cv-t-creative .cv-header{background:var(--cv-accent);color:#fff;padding:1.2em 1.4em;border-radius:6px}
.cv-t-creative .cv-headline{color:rgba(255,255,255,.88)}
.cv-t-creative .cv-contact{color:rgba(255,255,255,.9)}
.cv-t-creative .cv-contact .cv-dot{color:rgba(255,255,255,.45)}
.cv-t-creative .cv-cols{gap:1.7em;margin-top:.4em}
.cv-t-creative .cv-aside .cv-section{margin-top:calc(1.1em * var(--cv-ss))}
.cv-t-creative .cv-aside .cv-section:first-child{margin-top:calc(1.1em * var(--cv-ss))}
.cv-t-creative .cv-aside .cv-h2{border-bottom:2px solid color-mix(in srgb,var(--cv-accent) 30%,#fff);padding-bottom:.2em}
.cv-t-creative .cv-org{color:var(--cv-accent)}

/* ── Finance ── */
.cv-t-finance .cv-header{border-bottom:3px double var(--cv-accent);padding-bottom:.7em}
.cv-t-finance .cv-name{font-weight:700;letter-spacing:.01em;color:var(--cv-accent)}
.cv-t-finance .cv-h2{color:var(--cv-accent);letter-spacing:.04em;font-size:calc(var(--cv-fs) * 1.05pt * var(--cv-hs));border-bottom:1px solid var(--cv-rule);padding-bottom:.1em;font-weight:600}
.cv-t-finance .cv-role{font-style:italic}

/* ── Consulting ── */
.cv-t-consulting .cv-header{border-bottom:1px solid var(--cv-rule);padding-bottom:.85em}
.cv-t-consulting .cv-name{font-size:calc(var(--cv-fs) * 2.1pt * var(--cv-hs));font-weight:700;color:var(--cv-accent)}
.cv-t-consulting .cv-h2{font-size:calc(var(--cv-fs) * .9pt * var(--cv-hs));letter-spacing:.05em;color:var(--cv-accent)}
.cv-t-consulting .cv-org{font-weight:600}

/* ── Technology ── */
.cv-t-technology{--cv-mono:ui-monospace,"SFMono-Regular",Consolas,"Liberation Mono",monospace}
.cv-t-technology .cv-name{font-weight:700;letter-spacing:-.02em}
.cv-t-technology .cv-headline{font-family:var(--cv-mono);color:var(--cv-accent);font-size:calc(var(--cv-fs) * 1pt)}
.cv-t-technology .cv-h2{font-family:var(--cv-mono);text-transform:lowercase;letter-spacing:0;color:var(--cv-text);display:flex;align-items:center;gap:.5em;font-size:calc(var(--cv-fs) * 1.05pt * var(--cv-hs))}
.cv-t-technology .cv-h2::before{content:"";width:.55em;height:.55em;background:var(--cv-accent);border-radius:2px;flex-shrink:0}
.cv-t-technology .cv-date{font-family:var(--cv-mono);font-size:calc(var(--cv-fs) * .84pt)}
.cv-t-technology .cv-org{color:var(--cv-accent)}

/* ── Graduate ── */
.cv-t-graduate .cv-header{text-align:center}
.cv-t-graduate .cv-contact{justify-content:center}
.cv-t-graduate .cv-name::after{content:"";display:block;width:2.2em;height:3px;background:var(--cv-accent);margin:.35em auto 0;border-radius:2px}
.cv-t-graduate .cv-h2{display:inline-block;background:color-mix(in srgb,var(--cv-accent) 12%,#fff);color:var(--cv-accent);padding:.2em .75em;border-radius:999px;letter-spacing:.08em;font-size:calc(var(--cv-fs) * .95pt * var(--cv-hs))}
.cv-t-graduate .cv-section{margin-top:calc(1.35em * var(--cv-ss))}
.cv-t-graduate .cv-org{color:var(--cv-accent)}

/* ── Academic ── */
.cv-t-academic .cv-header{text-align:center}
.cv-t-academic .cv-contact{justify-content:center}
.cv-t-academic .cv-name{font-weight:500;font-size:calc(var(--cv-fs) * 2.2pt * var(--cv-hs))}
.cv-t-academic .cv-h2{color:var(--cv-text);text-transform:none;letter-spacing:.02em;font-size:calc(var(--cv-fs) * 1.2pt * var(--cv-hs));border-bottom:1px solid var(--cv-text);padding-bottom:.1em;font-weight:700}

/* ── Clean Two-Column ── */
.cv-t-twocolumn .cv-header{border-bottom:2px solid var(--cv-accent);padding-bottom:.7em;margin-bottom:.3em}
.cv-t-twocolumn .cv-aside{background:color-mix(in srgb,var(--cv-accent) 7%,#fff);border-radius:6px;padding:1em 1.1em}
.cv-t-twocolumn .cv-org{color:var(--cv-accent)}

/* ── Compact ── */
.cv-t-compact .cv-name{font-size:calc(var(--cv-fs) * 1.9pt * var(--cv-hs))}
.cv-t-compact .cv-contact{margin-top:.35em}
.cv-t-compact .cv-section{margin-top:calc(.8em * var(--cv-ss))}
.cv-t-compact .cv-h2{border-left:3px solid var(--cv-accent);padding-left:.45em;color:var(--cv-text);font-size:calc(var(--cv-fs) * .98pt * var(--cv-hs));margin-bottom:.35em}
.cv-t-compact .cv-item{margin-bottom:calc(.45em * var(--cv-ss))}
.cv-t-compact .cv-bullets{margin-top:.1em}
.cv-t-compact .cv-bullets li{margin-bottom:.04em}

/* ── Modern Sidebar ── */
.cv-t-sidebar .cv-cols{margin-top:0}
.cv-t-sidebar .cv-aside{background:var(--cv-accent);color:#fff;border-radius:6px;padding:1.3em 1.15em;--cv-muted:rgba(255,255,255,.8);--cv-rule:rgba(255,255,255,.3)}
.cv-t-sidebar .cv-aside .cv-h2{color:#fff;border-bottom:1px solid rgba(255,255,255,.35);padding-bottom:.25em}
.cv-t-sidebar .cv-aside .cv-date{color:rgba(255,255,255,.8)}
.cv-t-sidebar .cv-main .cv-header{margin-bottom:.1em;padding-top:.2em}
.cv-t-sidebar .cv-headline{color:var(--cv-accent)}
.cv-t-sidebar .cv-org{color:var(--cv-accent)}
.cv-t-sidebar .cv-main .cv-h2{color:var(--cv-accent)}

/* ── International ── */
.cv-t-international .cv-header{border-bottom:1px solid var(--cv-rule);padding-bottom:.75em}
.cv-t-international .cv-h2{background:#eef0f3;color:var(--cv-text);padding:.28em .55em;letter-spacing:.07em;font-size:calc(var(--cv-fs) * 1pt * var(--cv-hs))}
.cv-t-international .cv-role{color:var(--cv-muted)}

/* ── Professional Minimal ── */
.cv-t-professional .cv-name{font-weight:300;font-size:calc(var(--cv-fs) * 2.6pt * var(--cv-hs));letter-spacing:-.01em}
.cv-t-professional .cv-headline{font-weight:400}
.cv-t-professional .cv-h2{color:var(--cv-muted);font-weight:500;letter-spacing:.06em;font-size:calc(var(--cv-fs) * .84pt * var(--cv-hs))}
.cv-t-professional .cv-section{margin-top:calc(1.5em * var(--cv-ss))}
.cv-t-professional .cv-date{font-size:calc(var(--cv-fs) * .88pt)}

/* ── Contemporary ── */
.cv-t-contemporary .cv-header{padding-bottom:.65em;border-bottom:1px solid var(--cv-rule)}
.cv-t-contemporary .cv-name{font-weight:700}
.cv-t-contemporary .cv-h2{border-left:4px solid var(--cv-accent);padding-left:.5em;color:var(--cv-text);letter-spacing:.07em}
.cv-t-contemporary .cv-org{color:var(--cv-accent);font-weight:600}

/* ── Elegant ── */
.cv-t-elegant .cv-header{text-align:center;border-top:1px solid var(--cv-text);border-bottom:1px solid var(--cv-text);padding:.85em 0}
.cv-t-elegant .cv-contact{justify-content:center}
.cv-t-elegant .cv-name{font-weight:500;letter-spacing:.05em;text-transform:uppercase;font-size:calc(var(--cv-fs) * 2.1pt * var(--cv-hs))}
.cv-t-elegant .cv-headline{letter-spacing:.06em;text-transform:uppercase;font-size:calc(var(--cv-fs) * .9pt)}
.cv-t-elegant .cv-h2{display:flex;align-items:center;gap:.8em;color:var(--cv-text);letter-spacing:.06em;font-weight:500;text-align:center}
.cv-t-elegant .cv-h2::before,.cv-t-elegant .cv-h2::after{content:"";flex:1;height:1px;background:var(--cv-rule)}
.cv-t-elegant .cv-role{font-style:italic}

/* ── Timeline ── */
.cv-t-timeline .cv-name{color:var(--cv-accent)}
/* Profile photo (photo-enabled templates only) */
.cv-photo{width:calc(var(--cv-fs) * 7pt);height:calc(var(--cv-fs) * 7pt);border-radius:50%;object-fit:cover;flex-shrink:0;display:block;background:var(--cv-rule);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cv-h-photo{display:flex;align-items:center;gap:1.1em}
.cv-h-photo > .cv-h-text{min-width:0;flex:1}
.cv-h-center.cv-h-photo{flex-direction:column;gap:.6em}
.cv-h-details-photo{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:1.2em;align-items:start}
.cv-aside-photo{display:flex;justify-content:center;margin:0 0 1.1em}
.cv-aside-photo .cv-photo{width:calc(var(--cv-fs) * 9pt);height:calc(var(--cv-fs) * 9pt);box-shadow:0 0 0 3px rgba(255,255,255,.85)}
.cv-t-creative .cv-photo{box-shadow:0 0 0 2px rgba(255,255,255,.85)}
.cv-t-timeline .cv-h2{color:var(--cv-text)}
.cv-t-timeline .cv-item.cv-tl{margin-bottom:calc(.55em * var(--cv-ss))}
`;

/** Extra CSS used only when exporting / printing the CV. */
export function printCss(pageSize: "A4" | "Letter", marginMm: number): string {
  return `
@page{size:${pageSize === "A4" ? "A4" : "letter"};margin:${marginMm}mm}
html,body{margin:0;padding:0;background:#fff}
.cv-page{width:auto!important;min-height:0!important;padding:0!important;box-shadow:none!important}
`;
}
