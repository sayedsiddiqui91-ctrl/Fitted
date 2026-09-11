"use client";

import { del, get, keys, set } from "idb-keyval";
import type { PdfTextRun } from "./types";

/* The ORIGINAL uploaded PDF is stored as-is and never modified.
   Edits live separately (in the store); the edited file is generated on demand. */

const bytesKey = (id: string) => `fitted-pdf:${id}`;
const ocrKey = (id: string) => `fitted-pdf-ocr:${id}`;

export async function saveOriginal(id: string, bytes: Uint8Array): Promise<void> {
  await set(bytesKey(id), bytes);
}

export async function loadOriginal(id: string): Promise<Uint8Array | null> {
  const v = await get<Uint8Array | ArrayBuffer>(bytesKey(id));
  if (!v) return null;
  return v instanceof Uint8Array ? v : new Uint8Array(v);
}

export async function saveOcrRuns(id: string, runs: PdfTextRun[]): Promise<void> {
  await set(ocrKey(id), runs);
}

export async function loadOcrRuns(id: string): Promise<PdfTextRun[] | null> {
  return (await get<PdfTextRun[]>(ocrKey(id))) ?? null;
}

export async function deletePdfData(id: string): Promise<void> {
  await Promise.all([del(bytesKey(id)), del(ocrKey(id))]);
}

export async function deleteAllPdfData(): Promise<void> {
  const all = await keys();
  await Promise.all(all.filter((k) => typeof k === "string" && k.startsWith("fitted-pdf")).map((k) => del(k)));
}
