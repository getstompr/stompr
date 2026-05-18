import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { PDFParse } from "pdf-parse";
import type { IngestSource } from "../core/types.js";
import type { RawIngestRecord } from "./ingestion.js";

const DEFAULT_FETCH_TIMEOUT_MS = 12_000;
const MAX_WEBSITE_PAGES = 6;

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtmlToText(html: string): string {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");

  const text = withoutNoise
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<li>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ");

  return normalizeWhitespace(decodeHtmlEntities(text));
}

function extractTitleFromHtml(html: string): string | undefined {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!titleMatch) return undefined;
  return normalizeWhitespace(decodeHtmlEntities(titleMatch[1] ?? ""));
}

function extractLinksFromHtml(html: string, baseUrl: URL): string[] {
  const links: string[] = [];
  const hrefPattern = /href\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null = null;

  while ((match = hrefPattern.exec(html)) !== null) {
    const rawHref = (match[1] ?? "").trim();
    if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) {
      continue;
    }

    try {
      const resolved = new URL(rawHref, baseUrl);
      if (resolved.origin !== baseUrl.origin) {
        continue;
      }
      if (!["http:", "https:"].includes(resolved.protocol)) {
        continue;
      }
      links.push(resolved.toString());
    } catch {
      continue;
    }
  }

  return links;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function crawlWebsite(source: IngestSource): Promise<RawIngestRecord[]> {
  const startUrl = new URL(source.uri);
  const queue: string[] = [startUrl.toString()];
  const visited = new Set<string>();
  const records: RawIngestRecord[] = [];

  while (queue.length > 0 && records.length < MAX_WEBSITE_PAGES) {
    const url = queue.shift();
    if (!url || visited.has(url)) {
      continue;
    }
    visited.add(url);

    let response: Response;
    try {
      response = await fetchWithTimeout(url);
    } catch {
      continue;
    }

    if (!response.ok) {
      continue;
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/html")) {
      continue;
    }

    const html = await response.text();
    const text = stripHtmlToText(html);
    if (!text) {
      continue;
    }

    const parsedPath = new URL(url).pathname.replace(/\/$/, "");
    const fallbackTitle = parsedPath && parsedPath !== "/" ? parsedPath : source.sourceId;
    const pageTitle = extractTitleFromHtml(html) ?? fallbackTitle;
    records.push({
      title: pageTitle,
      content: text,
      metadata: {},
    });

    const links = extractLinksFromHtml(html, startUrl);
    for (const link of links) {
      if (!visited.has(link) && !queue.includes(link) && queue.length + records.length < MAX_WEBSITE_PAGES * 2) {
        queue.push(link);
      }
    }
  }

  return records;
}

function sourceUriToFilePath(uri: string): string | undefined {
  if (uri.startsWith("file://")) {
    const parsed = new URL(uri);
    const pathName = decodeURIComponent(parsed.pathname);
    return process.platform === "win32" ? pathName.replace(/^\//, "") : pathName;
  }

  if (/^[a-zA-Z]:\\/.test(uri) || uri.startsWith("/") || uri.startsWith("./") || uri.startsWith("../")) {
    return uri;
  }

  return undefined;
}

async function loadPdfBytes(uri: string): Promise<Buffer> {
  const filePath = sourceUriToFilePath(uri);
  if (filePath) {
    return readFile(filePath);
  }

  const response = await fetchWithTimeout(uri);
  if (!response.ok) {
    throw new Error(`Failed to fetch PDF: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function extractPdf(source: IngestSource): Promise<RawIngestRecord[]> {
  const bytes = await loadPdfBytes(source.uri);
  const parser = new PDFParse({ data: bytes });
  const parsed = await parser.getText();
  await parser.destroy();
  const text = normalizeWhitespace(parsed.text ?? "");
  if (!text) {
    return [];
  }

  return [
    {
      title: `PDF ${source.sourceId}`,
      content: text,
      metadata: {},
    },
  ];
}

function parseCsvToText(csv: string): string {
  return csv
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter((line) => line.length > 0)
    .slice(0, 400)
    .join("\n");
}

async function extractFlatFile(source: IngestSource): Promise<RawIngestRecord[]> {
  const filePath = sourceUriToFilePath(source.uri);
  if (!filePath) {
    throw new Error("Flat file extraction requires a file:// or local path URI");
  }

  const buffer = await readFile(filePath);
  const ext = extname(filePath).toLowerCase();
  const text = buffer.toString("utf-8");
  const content = ext === ".csv" ? parseCsvToText(text) : normalizeWhitespace(text);
  if (!content) {
    return [];
  }

  return [
    {
      title: `File ${source.sourceId}`,
      content,
      metadata: {},
    },
  ];
}

export async function extractRecordsFromSource(source: IngestSource): Promise<RawIngestRecord[]> {
  if (source.kind === "website") {
    return crawlWebsite(source);
  }

  if (source.kind === "pdf") {
    return extractPdf(source);
  }

  if (source.kind === "csv" || source.kind === "crm_export") {
    return extractFlatFile(source);
  }

  return [];
}
