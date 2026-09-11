import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { CVDoc, CVContent, Design } from "@/lib/cv/schema";
import { fontOption, PAGE_DIMENSIONS, sectionTitle } from "@/lib/cv/meta";
import { templateDef, type TemplateDef } from "@/lib/cv/templates";
import { formatRange } from "@/lib/cv/dates";

/* Template renderer: CV DATA + TEMPLATE DEFINITION → semantic HTML.
   Pure & deterministic, shared by the live preview, thumbnails and PDF export.
   Templates never change content — only how the same content is presented. */

interface Props {
  doc: Pick<CVDoc, "content" | "layout" | "design">;
  showPlaceholders?: boolean;
  /** false = render links as plain text (for thumbnails nested inside other links) */
  interactive?: boolean;
}

export function cvRootStyle(design: Design): CSSProperties {
  const page = PAGE_DIMENSIONS[design.pageSize];
  return {
    ["--cv-accent" as string]: design.accent,
    ["--cv-font" as string]: fontOption(design.font).stack,
    ["--cv-fs" as string]: String(design.fontSize),
    ["--cv-hs" as string]: String(design.headingScale),
    ["--cv-lh" as string]: String(design.lineHeight),
    ["--cv-ss" as string]: String(design.sectionSpacing),
    ["--cv-margin" as string]: `${design.margin}mm`,
    ["--cv-pw" as string]: `${page.widthMm}mm`,
    ["--cv-ph" as string]: `${page.heightMm}mm`,
  };
}

const clean = (s: string | undefined) => (s ?? "").trim();
const hasText = (s: string | undefined) => clean(s).length > 0;

function displayUrl(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}
function hrefFor(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

interface ContactItem {
  label: string;
  node: ReactNode;
}

function contactItems(content: CVContent, interactive: boolean): ContactItem[] {
  const p = content.personal;
  const link = (href: string, text: string) => (interactive ? <a href={href}>{text}</a> : <span>{text}</span>);
  const out: ContactItem[] = [];
  if (hasText(p.email)) out.push({ label: "Email", node: link(`mailto:${clean(p.email)}`, clean(p.email)) });
  if (hasText(p.phone)) out.push({ label: "Phone", node: <span>{clean(p.phone)}</span> });
  if (hasText(p.location)) out.push({ label: "Location", node: <span>{clean(p.location)}</span> });
  if (hasText(p.linkedin)) out.push({ label: "LinkedIn", node: link(hrefFor(clean(p.linkedin)), displayUrl(clean(p.linkedin))) });
  if (hasText(p.website)) out.push({ label: "Website", node: link(hrefFor(clean(p.website)), displayUrl(clean(p.website))) });
  for (const l of p.links) if (hasText(l.url)) out.push({ label: clean(l.label) || "Link", node: link(hrefFor(clean(l.url)), clean(l.label) || displayUrl(clean(l.url))) });
  return out;
}

export function CVDocument({ doc, showPlaceholders = false, interactive = true }: Props) {
  const { content, layout, design } = doc;
  const def = templateDef(design.template);
  const visible = layout.order.filter((k) => !layout.hidden.includes(k));
  const fullDoc = doc as CVDoc;
  const contacts = contactItems(content, interactive);

  const renderSection = (key: string, zone: "main" | "aside") => {
    const node = sectionBody(key, content, def, zone);
    if (!node) return null;
    const title = <h2 className="cv-h2">{sectionTitle(fullDoc, key)}</h2>;
    if (def.sectionStyle === "rail" && zone === "main") {
      return (
        <section className="cv-section cv-rail" key={key} data-section={key}>
          {title}
          <div className="cv-rail-body">{node}</div>
        </section>
      );
    }
    return (
      <section className="cv-section" key={key} data-section={key}>
        {title}
        {node}
      </section>
    );
  };

  const header = <Header content={content} def={def} contacts={def.contactInSidebar ? [] : contacts} showPlaceholders={showPlaceholders} />;

  let body: ReactNode;
  if (def.layout === "single") {
    body = (
      <>
        {header}
        {visible.map((k) => renderSection(k, "main"))}
      </>
    );
  } else {
    const asideKeys = visible.filter((k) => def.sidebarSections.includes(k));
    const mainKeys = visible.filter((k) => !def.sidebarSections.includes(k));
    const aside = (
      <aside className="cv-aside">
        {def.contactInSidebar && (contacts.length > 0 || showPlaceholders) && (
          <section className="cv-section" data-section="contact">
            <h2 className="cv-h2">Contact</h2>
            <div className="cv-stack">{contacts.length ? contacts.map((c, i) => <div key={i}>{c.node}</div>) : <div className="cv-placeholder">email@example.com</div>}</div>
          </section>
        )}
        {asideKeys.map((k) => renderSection(k, "aside"))}
      </aside>
    );
    const main = (
      <main className="cv-main">
        {def.headerInMain && header}
        {mainKeys.map((k) => renderSection(k, "main"))}
      </main>
    );
    body = (
      <>
        {!def.headerInMain && header}
        <div className={`cv-cols ${def.layout === "sidebar-left" ? "cv-cols-left" : "cv-cols-right"}`}>{def.layout === "sidebar-left" ? [<Fragment key="a">{aside}</Fragment>, <Fragment key="m">{main}</Fragment>] : [<Fragment key="m">{main}</Fragment>, <Fragment key="a">{aside}</Fragment>]}</div>
      </>
    );
  }

  return (
    <div className={`cv-root cv-t-${def.id} cv-e-${def.entry}`} style={cvRootStyle(design)}>
      <div className="cv-page">{body}</div>
    </div>
  );
}

function Header({ content, def, contacts, showPlaceholders }: { content: CVContent; def: TemplateDef; contacts: ContactItem[]; showPlaceholders: boolean }) {
  const p = content.personal;
  const empty = !hasText(p.fullName) && !hasText(p.headline) && contacts.length === 0;
  const ph = showPlaceholders && empty;
  const name = (
    <h1 className={`cv-name${!hasText(p.fullName) && showPlaceholders ? " cv-placeholder" : ""}`}>{clean(p.fullName) || (showPlaceholders ? "Your Name" : "")}</h1>
  );
  const headline = (hasText(p.headline) || ph) && <div className={`cv-headline${ph ? " cv-placeholder" : ""}`}>{clean(p.headline) || "Professional Title"}</div>;
  const placeholderContact = <div className="cv-contact cv-placeholder">email@example.com · +1 555 000 0000 · City</div>;

  if (def.header === "split") {
    return (
      <header className="cv-header cv-h-split">
        <div className="cv-h-id">
          {name}
          {headline}
        </div>
        {contacts.length > 0 ? (
          <div className="cv-contact cv-contact-stack">
            {contacts.map((c, i) => (
              <div key={i}>{c.node}</div>
            ))}
          </div>
        ) : (
          ph && placeholderContact
        )}
      </header>
    );
  }

  if (def.header === "details") {
    return (
      <header className="cv-header">
        {name}
        {headline}
        {contacts.length > 0 ? (
          <dl className="cv-details">
            {contacts.map((c, i) => (
              <Fragment key={i}>
                <dt>{c.label}</dt>
                <dd>{c.node}</dd>
              </Fragment>
            ))}
          </dl>
        ) : (
          ph && placeholderContact
        )}
      </header>
    );
  }

  return (
    <header className={`cv-header cv-h-${def.header}`}>
      {name}
      {headline}
      {contacts.length > 0 ? (
        <div className="cv-contact">
          {contacts.map((c, i) => (
            <Fragment key={i}>
              {i > 0 && (
                <span className="cv-dot" aria-hidden="true">
                  {def.contactSeparator}
                </span>
              )}
              {c.node}
            </Fragment>
          ))}
        </div>
      ) : (
        ph && placeholderContact
      )}
    </header>
  );
}

function Bullets({ items }: { items: { id: string; text: string }[] }) {
  const list = items.filter((b) => hasText(b.text));
  if (!list.length) return null;
  return (
    <ul className="cv-bullets">
      {list.map((b) => (
        <li key={b.id}>{clean(b.text)}</li>
      ))}
    </ul>
  );
}

/** Free text where lines starting with "•" (or "-", "*") are bullet points — used by custom sections. */
function RichDescription({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (!bullets.length) return;
    const list = bullets;
    out.push(
      <ul className="cv-bullets" key={`u${out.length}`}>
        {list.map((b, k) => (
          <li key={k}>{clean(b)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((l, k) => {
      const m = l.match(/^[•▪*\-–]\s+(.*)$/);
      if (m) bullets.push(m[1]);
      else {
        flush();
        out.push(
          <p className="cv-desc cv-text" key={`p${k}`}>
            {clean(l)}
          </p>,
        );
      }
    });
  flush();
  return <>{out}</>;
}

interface EntryProps {
  def: TemplateDef;
  title: string;
  org: string;
  location?: string;
  date?: string;
  extra?: string;
  children?: ReactNode;
}

/** Entry heading layout varies per template; the text itself never changes. */
function Entry({ def, title, org, location, date, extra, children }: EntryProps) {
  const sep = def.separator;
  const primary = title || org;
  const secondary = title ? org : "";

  switch (def.entry) {
    case "traditional":
      return (
        <div className="cv-item">
          <div className="cv-row">
            <div className="cv-org">{org || title}</div>
            {hasText(location) && <div className="cv-loc">{location}</div>}
          </div>
          {(org ? hasText(title) : false) || hasText(date) || hasText(extra) ? (
            <div className="cv-row">
              <div className="cv-role">
                {org ? title : ""}
                {hasText(extra) ? `${org && title ? sep : ""}${extra}` : ""}
              </div>
              {hasText(date) && <div className="cv-date">{date}</div>}
            </div>
          ) : null}
          {children}
        </div>
      );

    case "dates-left":
      return (
        <div className="cv-item cv-dl">
          <div className="cv-dl-side">
            {hasText(date) && <div className="cv-date">{date}</div>}
            {hasText(location) && <div className="cv-loc">{location}</div>}
          </div>
          <div className="cv-dl-main">
            <div className="cv-title">{primary}</div>
            {(secondary || hasText(extra)) && (
              <div className="cv-sub">
                {secondary && <span className="cv-org">{secondary}</span>}
                {hasText(extra) && `${secondary ? sep : ""}${extra}`}
              </div>
            )}
            {children}
          </div>
        </div>
      );

    case "compact":
      return (
        <div className="cv-item">
          <div className="cv-row">
            <div className="cv-line">
              <span className="cv-title">{primary}</span>
              {secondary && <span className="cv-org">{`, ${secondary}`}</span>}
              {hasText(location) && <span className="cv-sub">{` — ${location}`}</span>}
              {hasText(extra) && <span className="cv-sub">{`${sep}${extra}`}</span>}
            </div>
            {hasText(date) && <div className="cv-date">{date}</div>}
          </div>
          {children}
        </div>
      );

    case "timeline":
      return (
        <div className="cv-item cv-tl">
          {hasText(date) && <div className="cv-tl-date">{date}</div>}
          <div className="cv-title">{primary}</div>
          {[secondary, location, extra].some(hasText) && (
            <div className="cv-sub">
              {secondary && <span className="cv-org">{secondary}</span>}
              {[location, extra].filter(hasText).map((s, i) => (
                <span key={i}>{`${secondary || i > 0 ? sep : ""}${s}`}</span>
              ))}
            </div>
          )}
          {children}
        </div>
      );

    default: {
      const subParts = [org, location, extra].filter(hasText);
      return (
        <div className="cv-item">
          <div className="cv-row">
            <div className="cv-title">{primary}</div>
            {hasText(date) && <div className="cv-date">{date}</div>}
          </div>
          {title && subParts.length > 0 && (
            <div className="cv-sub">
              {org && <span className="cv-org">{org}</span>}
              {[location, extra].filter(hasText).map((s, i) => (
                <span key={i}>
                  {org || i > 0 ? sep : ""}
                  {s}
                </span>
              ))}
            </div>
          )}
          {children}
        </div>
      );
    }
  }
}

function sectionBody(key: string, c: CVContent, def: TemplateDef, zone: "main" | "aside"): ReactNode | null {
  const inAside = zone === "aside";
  switch (key) {
    case "summary":
      return hasText(c.summary) ? <p className="cv-text">{clean(c.summary)}</p> : null;

    case "experience":
    case "volunteer": {
      const list =
        key === "experience"
          ? c.experience.map((e) => ({ ...e, org: e.company }))
          : c.volunteer.map((v) => ({ ...v, org: v.organization }));
      const items = list.filter((e) => hasText(e.role) || hasText(e.org) || e.bullets.some((b) => hasText(b.text)));
      if (!items.length) return null;
      return items.map((e) => (
        <Entry key={e.id} def={def} title={clean(e.role)} org={clean(e.org)} location={clean(e.location)} date={formatRange(e.startDate, e.endDate, e.current)}>
          <Bullets items={e.bullets} />
        </Entry>
      ));
    }

    case "education": {
      const items = c.education.filter((e) => hasText(e.degree) || hasText(e.school));
      if (!items.length) return null;
      return items.map((e) => {
        const title = [clean(e.degree), clean(e.field)].filter(Boolean).join(e.degree && e.field ? " in " : "");
        return (
          <Entry key={e.id} def={def} title={title} org={clean(e.school)} location={clean(e.location)} date={formatRange(e.startDate, e.endDate)} extra={clean(e.grade)}>
            <Bullets items={e.bullets} />
          </Entry>
        );
      });
    }

    case "skills": {
      const skills = c.skills.filter((s) => hasText(s.name));
      if (!skills.length) return null;
      const grouped = skills.some((s) => hasText(s.group));
      const groups = groupBy(skills, (s) => clean(s.group) || "Other");
      if (inAside) {
        if (grouped)
          return (
            <div className="cv-stack">
              {groups.map(([g, list]) => (
                <div key={g}>
                  <div style={{ fontWeight: 600 }}>{g}</div>
                  <div className="cv-muted">{list.map((s) => clean(s.name)).join(", ")}</div>
                </div>
              ))}
            </div>
          );
        return (
          <div className="cv-stack">
            {skills.map((s) => (
              <div key={s.id}>{clean(s.name)}</div>
            ))}
          </div>
        );
      }
      if (def.skills === "tags") {
        return grouped ? (
          groups.map(([g, list]) => (
            <div className="cv-skill-line" key={g}>
              <b>{g}:</b>{" "}
              <span className="cv-tags">
                {list.map((s) => (
                  <span className="cv-tag" key={s.id}>
                    {clean(s.name)}
                  </span>
                ))}
              </span>
            </div>
          ))
        ) : (
          <div className="cv-tags">
            {skills.map((s) => (
              <span className="cv-tag" key={s.id}>
                {clean(s.name)}
              </span>
            ))}
          </div>
        );
      }
      if (def.skills === "columns" && !grouped) {
        return (
          <ul className="cv-skill-cols">
            {skills.map((s) => (
              <li key={s.id}>{clean(s.name)}</li>
            ))}
          </ul>
        );
      }
      if (grouped) {
        return groups.map(([g, list]) => (
          <div className="cv-skill-line" key={g}>
            <b>{g}:</b> {list.map((s) => clean(s.name)).join(", ")}
          </div>
        ));
      }
      const joiner = def.separator.trim() === "|" || def.id === "classic" || def.entry === "traditional" ? ", " : "  •  ";
      return <p>{skills.map((s) => clean(s.name)).join(joiner)}</p>;
    }

    case "projects": {
      const items = c.projects.filter((p) => hasText(p.name));
      if (!items.length) return null;
      return items.map((p) => (
        <Entry key={p.id} def={def} title={clean(p.name)} org={clean(p.role)} location={p.link ? displayUrl(clean(p.link)) : ""} date={formatRange(p.startDate, p.endDate)}>
          <Bullets items={p.bullets} />
        </Entry>
      ));
    }

    case "certifications": {
      const items = c.certifications.filter((x) => hasText(x.name));
      if (!items.length) return null;
      return items.map((x) => (
        <div className="cv-compact" key={x.id}>
          <div>
            <span className="cv-title">{clean(x.name)}</span>
            {hasText(x.issuer) && <span className="cv-sub">{`, ${clean(x.issuer)}`}</span>}
          </div>
          {hasText(x.date) && <div className="cv-date">{clean(x.date)}</div>}
        </div>
      ));
    }

    case "awards": {
      const items = c.awards.filter((x) => hasText(x.title));
      if (!items.length) return null;
      return items.map((x) => (
        <div className="cv-item" key={x.id}>
          <div className="cv-compact" style={{ marginBottom: 0 }}>
            <div>
              <span className="cv-title">{clean(x.title)}</span>
              {hasText(x.issuer) && <span className="cv-sub">{`, ${clean(x.issuer)}`}</span>}
            </div>
            {hasText(x.date) && <div className="cv-date">{clean(x.date)}</div>}
          </div>
          {hasText(x.description) && <p className="cv-desc cv-text">{clean(x.description)}</p>}
        </div>
      ));
    }

    case "languages": {
      const items = c.languages.filter((l) => hasText(l.name));
      if (!items.length) return null;
      if (inAside)
        return (
          <div className="cv-stack">
            {items.map((l) => (
              <div key={l.id}>
                {clean(l.name)}
                {hasText(l.proficiency) && <span className="cv-muted">{` — ${clean(l.proficiency)}`}</span>}
              </div>
            ))}
          </div>
        );
      return <p>{items.map((l) => (hasText(l.proficiency) ? `${clean(l.name)} (${clean(l.proficiency)})` : clean(l.name))).join("  •  ")}</p>;
    }

    default: {
      if (!key.startsWith("custom:")) return null;
      const sec = c.custom.find((s) => s.id === key.slice(7));
      const items = sec?.items.filter((i) => hasText(i.title) || hasText(i.description)) ?? [];
      if (!items.length) return null;
      return items.map((i) =>
        // Items without a heading (a plain list, like "Co-curricular activities") render as just their lines/bullets
        !hasText(i.title) && !hasText(i.subtitle) && !hasText(i.date) ? (
          <div key={i.id} className="cv-item">
            <RichDescription text={i.description} />
          </div>
        ) : (
          <Entry key={i.id} def={def} title={clean(i.title)} org={clean(i.subtitle)} date={clean(i.date)}>
            {hasText(i.description) && <RichDescription text={i.description} />}
          </Entry>
        ),
      );
    }
  }
}

function groupBy<T>(arr: T[], key: (t: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const item of arr) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  return [...map.entries()];
}
