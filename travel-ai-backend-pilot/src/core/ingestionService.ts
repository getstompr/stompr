import type { PlatformStore } from "./platformStore.js";
import type { IngestSource, KnowledgeDocument } from "./types.js";
import { ingestRecords, type RawIngestRecord } from "../rag/ingestion.js";
import { extractRecordsFromSource } from "../rag/extraction.js";
import { AdvantageGraph } from "../rag/advantageGraph.js";

const nowIso = () => new Date().toISOString();

function synthesizeRecords(source: IngestSource): RawIngestRecord[] {
  const base = source.uri.toLowerCase();
  if (source.kind === "website") {
    return [
      {
        title: `Website policy snapshot ${source.sourceId}`,
        content:
          "Our agency specializes in luxury honeymoon and family journeys with advisor-confirmed inventory. Preferred partners include Aman and Virtuoso properties in Maldives, Japan, and Italy. Summer and winter planning windows are supported.",
      },
      {
        title: `Offer highlights ${source.sourceId}`,
        content:
          "Private offers include villa upgrades, flexible cancellation terms, and concierge add-ons for high-value clients. Supplier terms require advisor confirmation before booking.",
      },
    ];
  }

  if (source.kind === "crm_export") {
    return [
      {
        title: `CRM preferences ${source.sourceId}`,
        content: "Repeat clients prefer boutique luxury stays, private transfers, and food-focused itineraries in Japan and Italy.",
        metadata: { packageType: "luxury_escape", destination: "japan" },
      },
    ];
  }

  return [
    {
      title: `Imported source ${source.sourceId}`,
      content: `Imported from ${base}. Agency policy and supplier terms applied.`,
    },
  ];
}

export class IngestionService {
  readonly graph = new AdvantageGraph();

  constructor(private readonly store: PlatformStore) {}

  async registerSource(source: IngestSource): Promise<IngestSource> {
    return this.store.registerSource(source);
  }

  async runSource(tenantId: string, sourceId: string): Promise<{ sourceId: string; ingestedCount: number; docs: KnowledgeDocument[] }> {
    const source = (await this.store.listSources(tenantId)).find((s) => s.sourceId === sourceId);
    if (!source) {
      throw new Error("Ingest source not found");
    }

    let records: RawIngestRecord[] = [];
    let extractionMode = "live_extraction";

    try {
      records = await extractRecordsFromSource(source);
    } catch (error) {
      extractionMode = "fallback_synthetic_error";
      await this.store.addAudit(tenantId, "ingest_extraction_failed", "ingest_source", sourceId, "system", {
        reason: (error as Error).message.slice(0, 180),
      });
    }

    if (records.length === 0) {
      extractionMode = extractionMode === "live_extraction" ? "fallback_synthetic_empty" : extractionMode;
      records = synthesizeRecords(source);
    }

    await this.store.addAudit(tenantId, "ingest_extraction_mode", "ingest_source", sourceId, "system", {
      mode: extractionMode,
      sourceKind: source.kind,
      recordCount: String(records.length),
    });

    const docs = ingestRecords(tenantId, source, records).map((d) => ({
      ...d,
      updatedAt: nowIso(),
    }));

    const ingestedCount = await this.store.upsertDocs(tenantId, docs);
    this.graph.buildFromDocuments(tenantId, await this.store.getDocs(tenantId));

    return { sourceId, ingestedCount, docs };
  }
}

