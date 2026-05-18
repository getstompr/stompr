import type { Citation, KnowledgeDocument, KnowledgeDomain } from "../core/types.js";
import type { AdvantageGraph } from "./advantageGraph.js";

type RetrieveOptions = {
  tenantId: string;
  query: string;
  topK?: number;
  policyFirst?: boolean;
  metadataFilters?: Partial<KnowledgeDocument["metadata"]>;
  advantageGraph?: AdvantageGraph;
};

const domainPriority: Record<KnowledgeDomain, number> = {
  agency_policy: 1,
  supplier_terms: 2,
  client_private_offers: 3,
  public_marketing: 4,
};

function tokenize(input: string): Set<string> {
  return new Set(
    input
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((x) => x.length > 1),
  );
}

function semanticScore(query: string, doc: KnowledgeDocument): number {
  const q = tokenize(query);
  const d = tokenize(doc.content);
  if (q.size === 0 || d.size === 0) {
    return 0;
  }

  let overlap = 0;
  q.forEach((t) => {
    if (d.has(t)) {
      overlap += 1;
    }
  });

  return overlap / q.size;
}

function metadataScore(filters: RetrieveOptions["metadataFilters"], doc: KnowledgeDocument): number {
  if (!filters) {
    return 0.2;
  }

  let matches = 0;
  let total = 0;

  for (const [k, v] of Object.entries(filters)) {
    if (v == null) {
      continue;
    }
    total += 1;
    if ((doc.metadata as Record<string, unknown>)[k] === v) {
      matches += 1;
    }
  }

  return total === 0 ? 0.2 : matches / total;
}

function freshnessScore(updatedAt: string): number {
  const ageMs = Date.now() - new Date(updatedAt).getTime();
  const days = Math.max(ageMs / (1000 * 60 * 60 * 24), 0);
  if (days <= 1) {
    return 1;
  }
  if (days <= 7) {
    return 0.85;
  }
  if (days <= 30) {
    return 0.7;
  }
  return 0.5;
}

export function retrieveKnowledge(docs: KnowledgeDocument[], options: RetrieveOptions): Citation[] {
  const topK = options.topK ?? 5;
  const ranked = docs
    .filter((d) => d.tenantId === options.tenantId)
    .map((doc) => {
      const sem = semanticScore(options.query, doc);
      const meta = metadataScore(options.metadataFilters, doc);
      const fresh = freshnessScore(doc.updatedAt);
      const advantageBoost = options.advantageGraph?.scoreBoost(options.tenantId, options.query, doc) ?? 0;
      let score = 0.6 * sem + 0.18 * meta + 0.14 * fresh + 0.08 + advantageBoost;

      if (options.policyFirst) {
        const priorityBoost = 1 - (domainPriority[doc.domain] - 1) * 0.1;
        score *= priorityBoost;
      }

      return { doc, score: Math.min(Math.max(score, 0), 1) };
    })
    .sort((a, b) => {
      if (options.policyFirst && a.doc.domain !== b.doc.domain) {
        return domainPriority[a.doc.domain] - domainPriority[b.doc.domain];
      }
      return b.score - a.score;
    })
    .slice(0, topK);

  return ranked.map((item) => ({
    documentId: item.doc.id,
    title: item.doc.title,
    domain: item.doc.domain,
    score: Number(item.score.toFixed(4)),
    lastUpdatedAt: item.doc.updatedAt,
    imageUrl: item.doc.metadata.imageUrl ?? item.doc.metadata.heroImage,
  }));
}
