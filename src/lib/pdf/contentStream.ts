/* Minimal PDF content-stream parser used to REMOVE edited text for real.
   Covering old text with a white box would leave it in the file, where ATS
   parsers and copy/paste would still find it. Instead we locate the exact
   text-showing operators inside the edited region and rewrite the stream. */

export type Tok =
  | { t: "num"; v: number }
  | { t: "name"; v: string }
  | { t: "str"; b: Uint8Array }
  | { t: "arr"; items: Tok[] }
  | { t: "dict" }
  | { t: "bool" }
  | { t: "null" };

export interface Instr {
  op: string;
  operands: Tok[];
  start: number;
  end: number;
}

const WS = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);
const hexVal = (c: number) => (c >= 0x30 && c <= 0x39 ? c - 0x30 : c >= 0x41 && c <= 0x46 ? c - 55 : c >= 0x61 && c <= 0x66 ? c - 87 : -1);

export function parseContent(d: Uint8Array): Instr[] {
  const out: Instr[] = [];
  const n = d.length;
  let i = 0;

  const skipWS = () => {
    while (i < n) {
      const c = d[i];
      if (WS.has(c)) i++;
      else if (c === 0x25) while (i < n && d[i] !== 10 && d[i] !== 13) i++;
      else break;
    }
  };

  const readTok = (): Tok | string | null => {
    skipWS();
    if (i >= n) return null;
    const c = d[i];
    if (c === 0x28) {
      i++;
      let depth = 1;
      const bytes: number[] = [];
      while (i < n && depth > 0) {
        const ch = d[i++];
        if (ch === 0x5c) {
          const e = d[i++];
          if (e === 0x6e) bytes.push(10);
          else if (e === 0x72) bytes.push(13);
          else if (e === 0x74) bytes.push(9);
          else if (e === 0x62) bytes.push(8);
          else if (e === 0x66) bytes.push(12);
          else if (e >= 0x30 && e <= 0x37) {
            let v = e - 0x30;
            for (let k = 0; k < 2 && d[i] >= 0x30 && d[i] <= 0x37; k++) v = v * 8 + (d[i++] - 0x30);
            bytes.push(v & 0xff);
          } else if (e === 13) {
            if (d[i] === 10) i++;
          } else if (e !== 10) bytes.push(e);
        } else if (ch === 0x28) {
          depth++;
          bytes.push(ch);
        } else if (ch === 0x29) {
          depth--;
          if (depth > 0) bytes.push(ch);
        } else bytes.push(ch);
      }
      return { t: "str", b: Uint8Array.from(bytes) };
    }
    if (c === 0x3c) {
      if (d[i + 1] === 0x3c) {
        i += 2;
        let depth = 1;
        while (i < n && depth > 0) {
          if (d[i] === 0x3c && d[i + 1] === 0x3c) {
            depth++;
            i += 2;
          } else if (d[i] === 0x3e && d[i + 1] === 0x3e) {
            depth--;
            i += 2;
          } else if (d[i] === 0x28) readTok();
          else i++;
        }
        return { t: "dict" };
      }
      i++;
      const hex: number[] = [];
      let hi = -1;
      while (i < n && d[i] !== 0x3e) {
        const v = hexVal(d[i++]);
        if (v < 0) continue;
        if (hi < 0) hi = v;
        else {
          hex.push(hi * 16 + v);
          hi = -1;
        }
      }
      if (hi >= 0) hex.push(hi * 16);
      i++;
      return { t: "str", b: Uint8Array.from(hex) };
    }
    if (c === 0x5b) {
      i++;
      const items: Tok[] = [];
      for (;;) {
        skipWS();
        if (i >= n) break;
        if (d[i] === 0x5d) {
          i++;
          break;
        }
        const tk = readTok();
        if (tk === null) break;
        if (typeof tk !== "string") items.push(tk);
      }
      return { t: "arr", items };
    }
    if (c === 0x2f) {
      i++;
      let s = "";
      while (i < n && !WS.has(d[i]) && !DELIM.has(d[i])) s += String.fromCharCode(d[i++]);
      return { t: "name", v: s };
    }
    if ((c >= 0x30 && c <= 0x39) || c === 0x2b || c === 0x2d || c === 0x2e) {
      let s = "";
      while (i < n && ((d[i] >= 0x30 && d[i] <= 0x39) || d[i] === 0x2b || d[i] === 0x2d || d[i] === 0x2e)) s += String.fromCharCode(d[i++]);
      return { t: "num", v: parseFloat(s) || 0 };
    }
    if (DELIM.has(c)) {
      i++; // stray delimiter — skip
      return readTok();
    }
    let s = "";
    while (i < n && !WS.has(d[i]) && !DELIM.has(d[i])) s += String.fromCharCode(d[i++]);
    if (s === "true" || s === "false") return { t: "bool" };
    if (s === "null") return { t: "null" };
    return s;
  };

  let operands: Tok[] = [];
  let start = -1;
  for (;;) {
    skipWS();
    if (i >= n) break;
    const tokStart = i;
    const tk = readTok();
    if (tk === null) break;
    if (start < 0) start = tokStart;
    if (typeof tk !== "string") {
      operands.push(tk);
      continue;
    }
    if (tk === "BI") {
      // inline image: parameters until ID, then binary data until EI
      for (;;) {
        const t2 = readTok();
        if (t2 === null || t2 === "ID") break;
      }
      i++;
      while (i < n - 1) {
        if (d[i] === 0x45 && d[i + 1] === 0x49 && WS.has(d[i - 1]) && (i + 2 >= n || WS.has(d[i + 2]) || DELIM.has(d[i + 2]))) {
          i += 2;
          break;
        }
        i++;
      }
    }
    out.push({ op: tk, operands, start, end: i });
    operands = [];
    start = -1;
  }
  return out;
}

/* ───────── text positioning ───────── */
export type M = [number, number, number, number, number, number];
export const IDENTITY: M = [1, 0, 0, 1, 0, 0];
export const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4],
  m[4] * n[1] + m[5] * n[3] + n[5],
];
const num = (t: Tok | undefined) => (t && t.t === "num" ? t.v : 0);

/** Glyph metrics for a font resource. `width(code)` is in 1/1000 em, or null when the PDF doesn't say. */
export interface FontMetrics {
  twoByte: boolean;
  width: (code: number) => number | null;
}
const UNKNOWN_FONT: FontMetrics = { twoByte: false, width: () => null };

export interface ShowOp {
  index: number;
  op: string;
  x: number;
  y: number;
  fontSize: number;
  sx: number;
  th: number;
  bt: number;
  /** Advance of the whole op in user space (estimated when glyph widths are unknown) */
  w: number;
  /** The origin is exact: right after a positioning operator, or every earlier advance was measured */
  exact: boolean;
  /** Every glyph width in this op came from the font's own metrics */
  known: boolean;
}

/**
 * Walks the instructions, tracking graphics/text state, and returns the user-space origin and advance of
 * every text-showing operator. Advances use the font's real glyph widths (/Widths, CID /W) when available,
 * plus character/word spacing and TJ adjustments, so positions stay exact along the whole line.
 */
export function findShowOps(instrs: Instr[], ctm0: M, metricsFor: (font: string) => FontMetrics = () => UNKNOWN_FONT, onDo?: (name: string, ctm: M) => void): ShowOp[] {
  const shows: ShowOp[] = [];
  const stack: M[] = [];
  let ctm: M = ctm0;
  let tm: M = IDENTITY;
  let tlm: M = IDENTITY;
  let tfs = 0;
  let th = 1;
  let rise = 0;
  let tl = 0;
  let tc = 0;
  let tw = 0;
  let font = "";
  let bt = 0;
  let posExact = true;

  const newLine = (tx: number, ty: number) => {
    tlm = mul([1, 0, 0, 1, tx, ty], tlm);
    tm = tlm;
    posExact = true;
  };
  const show = (index: number, op: string, items: Tok[]) => {
    const m = metricsFor(font);
    const trm = mul(tm, ctm);
    const origin = mul([1, 0, 0, 1, 0, rise], trm);
    const sx = Math.hypot(trm[0], trm[1]) || 1;
    let tx = 0;
    let known = true;
    for (const it of items) {
      if (it.t === "num") {
        tx -= (it.v / 1000) * tfs * th;
        continue;
      }
      if (it.t !== "str") continue;
      const step = m.twoByte ? 2 : 1;
      for (let k = 0; k + step <= it.b.length; k += step) {
        const code = m.twoByte ? (it.b[k] << 8) | it.b[k + 1] : it.b[k];
        const w0 = m.width(code);
        if (w0 == null) known = false;
        tx += (((w0 ?? 500) / 1000) * tfs + tc + (!m.twoByte && code === 32 ? tw : 0)) * th;
      }
    }
    shows.push({ index, op, x: origin[4], y: origin[5], fontSize: tfs * Math.hypot(ctm[2], ctm[3]) * Math.hypot(tm[2], tm[3]) || tfs, sx, th, bt, w: tx * sx, exact: posExact, known });
    tm = mul([1, 0, 0, 1, tx, 0], tm);
    if (!known) posExact = false;
  };

  instrs.forEach((ins, index) => {
    const o = ins.operands;
    switch (ins.op) {
      case "q":
        stack.push(ctm);
        break;
      case "Q":
        ctm = stack.pop() ?? ctm0;
        break;
      case "cm":
        ctm = mul([num(o[0]), num(o[1]), num(o[2]), num(o[3]), num(o[4]), num(o[5])], ctm);
        break;
      case "BT":
        tm = IDENTITY;
        tlm = IDENTITY;
        bt++;
        posExact = true;
        break;
      case "Tm":
        tlm = [num(o[0]), num(o[1]), num(o[2]), num(o[3]), num(o[4]), num(o[5])];
        tm = tlm;
        posExact = true;
        break;
      case "Tc":
        tc = num(o[0]);
        break;
      case "Tw":
        tw = num(o[0]);
        break;
      case "Td":
        newLine(num(o[0]), num(o[1]));
        break;
      case "TD":
        tl = -num(o[1]);
        newLine(num(o[0]), num(o[1]));
        break;
      case "T*":
        newLine(0, -tl);
        break;
      case "TL":
        tl = num(o[0]);
        break;
      case "Tf":
        font = o[0]?.t === "name" ? o[0].v : font;
        tfs = num(o[1]);
        break;
      case "Tz":
        th = num(o[0]) / 100;
        break;
      case "Ts":
        rise = num(o[0]);
        break;
      case "Tj":
        show(index, "Tj", o[0] ? [o[0]] : []);
        break;
      case "'":
        newLine(0, -tl);
        show(index, "'", o[0] ? [o[0]] : []);
        break;
      case '"':
        tw = num(o[0]);
        tc = num(o[1]);
        newLine(0, -tl);
        show(index, '"', o[2] ? [o[2]] : []);
        break;
      case "TJ":
        show(index, "TJ", o[0]?.t === "arr" ? o[0].items : []);
        break;
      case "Do":
        if (onDo && o[0]?.t === "name") onDo(o[0].v, ctm);
        break;
    }
  });
  return shows;
}

export interface Region {
  x: number;
  y: number;
  w: number;
  fs: number;
}

export interface Replacement {
  start: number;
  end: number;
  text: string;
}

/* A text op belongs to a line if it starts on the line's baseline inside its horizontal extent. With an exact
   origin only a hair of tolerance is needed at the right edge — the next segment on the line starts at or after
   the line's end — so thin last characters (".", ",", "i", "l", ")") are removed too. Estimated origins keep a
   wider margin so neighbouring text is never removed by mistake. */
const inRegion = (s: ShowOp, r: Region) =>
  Math.abs(s.y - r.y) <= Math.max(1.5, r.fs * 0.35) && s.x >= r.x - 1.5 && s.x < r.x + r.w - (s.exact ? 0.35 : Math.min(r.fs * 0.3, r.w * 0.5));

export interface Reach {
  start: number;
  end: number;
  /** true when every removed op had an exact origin and measured width (so start/end can be trusted) */
  reliable: boolean;
}

/** Plans byte-range replacements that remove every text op starting inside the regions. */
export function planRemovals(instrs: Instr[], shows: ShowOp[], regions: Region[]): { replacements: Replacement[]; matched: number[]; reach: Reach[] } {
  const matched = regions.map(() => 0);
  const reach: Reach[] = regions.map(() => ({ start: Infinity, end: -Infinity, reliable: true }));
  const replacements: Replacement[] = [];
  const done = new Set<number>();
  regions.forEach((r, ri) => {
    let firstInGroup = true;
    let lastBt = -1;
    for (const s of shows) {
      if (done.has(s.index) || !inRegion(s, r)) continue;
      if (s.bt !== lastBt) firstInGroup = true;
      lastBt = s.bt;
      const ins = instrs[s.index];
      matched[ri]++;
      done.add(s.index);
      reach[ri].start = Math.min(reach[ri].start, s.x);
      reach[ri].end = Math.max(reach[ri].end, s.x + s.w);
      if (!s.exact || !s.known) reach[ri].reliable = false;
      // Keep the current point where it would have been, so later text on the same line doesn't shift.
      let spacer = "";
      if (firstInGroup) {
        const tfs = s.fontSize / Math.max(s.sx, 1e-6) || 0;
        const adv = tfs > 0 ? -((r.w / s.sx) * 1000) / (tfs * s.th) : 0;
        spacer = Number.isFinite(adv) && adv !== 0 ? ` [${adv.toFixed(2)}] TJ ` : " ";
        firstInGroup = false;
      }
      let prefix = "";
      if (s.op === "'") prefix = " T* ";
      if (s.op === '"') prefix = ` ${num(ins.operands[0])} Tw ${num(ins.operands[1])} Tc T* `;
      replacements.push({ start: ins.start, end: ins.end, text: `${prefix}${spacer}` });
    }
  });
  return { replacements: replacements.sort((a, b) => a.start - b.start), matched, reach };
}

export function applyReplacements(data: Uint8Array, reps: Replacement[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  let pos = 0;
  for (const r of reps) {
    if (r.start < pos) continue;
    parts.push(data.subarray(pos, r.start), enc.encode(r.text));
    pos = r.end;
  }
  parts.push(data.subarray(pos));
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
