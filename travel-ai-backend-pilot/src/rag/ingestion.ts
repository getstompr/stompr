import { createHash, randomUUID } from "node:crypto";
import type { IngestSource, KnowledgeDocument, KnowledgeDomain } from "../core/types.js";
import { detectPii, redactPii } from "../security/pii.js";

const nowIso = () => new Date().toISOString();

export type RawIngestRecord = {
  title: string;
  content: string;
  metadata?: Partial<KnowledgeDocument["metadata"]>;
};

function chunkText(content: string, maxLen = 800): string[] {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const chunks: string[] = [];
  let idx = 0;
  while (idx < normalized.length) {
    chunks.push(normalized.slice(idx, idx + maxLen));
    idx += maxLen;
  }

  return chunks;
}

function enrichMetadata(content: string, domain: KnowledgeDomain, metadata: Partial<KnowledgeDocument["metadata"]>): KnowledgeDocument["metadata"] {
  const lc = content.toLowerCase();
  const supplier = metadata.supplier ?? (lc.includes("virtuoso") ? "virtuoso" : lc.includes("aman") ? "aman" : undefined);
  const destination =
    metadata.destination ??
    (lc.includes("maldives") ? "maldives" : lc.includes("japan") ? "japan" : lc.includes("italy") ? "italy" : undefined);

  const packageType = metadata.packageType ?? (lc.includes("honeymoon") ? "honeymoon" : lc.includes("family") ? "family" : "luxury_escape");
  const seasonality = metadata.seasonality ?? (lc.includes("summer") ? "summer" : lc.includes("winter") ? "winter" : "all_season");
  const policyClass = metadata.policyClass ?? (domain === "supplier_terms" ? "terms" : domain === "agency_policy" ? "policy" : "content");

  return {
    supplier,
    destination,
    packageType,
    seasonality,
    policyClass,
    piiDetected: detectPii(content),
  };
}

function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export function ingestRecords(tenantId: string, source: IngestSource, records: RawIngestRecord[]): KnowledgeDocument[] {
  const docs: KnowledgeDocument[] = [];

  for (const record of records) {
    const chunks = chunkText(record.content);
    for (const chunk of chunks) {
      const redacted = redactPii(chunk);
      const metadata = enrichMetadata(redacted, source.domain, record.metadata ?? {});
      const id = `${source.sourceId}_${contentHash(redacted)}_${randomUUID().slice(0, 8)}`;

      docs.push({
        id,
        tenantId,
        sourceId: source.sourceId,
        title: record.title,
        domain: source.domain,
        content: redacted,
        metadata,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    }
  }

  return docs;
}
