import type { KnowledgeDocument } from "../core/types.js";

export type AdvantageEdge = {
  supplier: string;
  destination: string;
  tripType: string;
  strength: number; // 0-1
  evidenceDocIds: string[];
};

export class AdvantageGraph {
  private readonly edgesByTenant = new Map<string, AdvantageEdge[]>();

  buildFromDocuments(tenantId: string, docs: KnowledgeDocument[]): AdvantageEdge[] {
    const map = new Map<string, AdvantageEdge>();

    for (const doc of docs) {
      const supplier = doc.metadata.supplier ?? "unknown_supplier";
      const destination = doc.metadata.destination ?? "unknown_destination";
      const tripType = doc.metadata.packageType ?? "luxury_escape";
      const key = `${supplier}|${destination}|${tripType}`;
      const current = map.get(key);
      const docStrength =
        doc.domain === "client_private_offers" ? 0.92 :
        doc.domain === "agency_policy" ? 0.75 :
        doc.domain === "supplier_terms" ? 0.68 : 0.55;

      if (!current) {
        map.set(key, {
          supplier,
          destination,
          tripType,
          strength: docStrength,
          evidenceDocIds: [doc.id],
        });
      } else {
        current.strength = Math.min(1, Number(((current.strength + docStrength) / 2 + 0.05).toFixed(4)));
        current.evidenceDocIds.push(doc.id);
        map.set(key, current);
      }
    }

    const edges = [...map.values()].sort((a, b) => b.strength - a.strength);
    this.edgesByTenant.set(tenantId, edges);
    return edges;
  }

  getTenantEdges(tenantId: string): AdvantageEdge[] {
    return this.edgesByTenant.get(tenantId) ?? [];
  }

  scoreBoost(tenantId: string, query: string, doc: KnowledgeDocument): number {
    const q = query.toLowerCase();
    const edges = this.getTenantEdges(tenantId);
    if (edges.length === 0) {
      return 0;
    }

    const supplier = doc.metadata.supplier?.toLowerCase() ?? "";
    const destination = doc.metadata.destination?.toLowerCase() ?? "";
    const tripType = doc.metadata.packageType?.toLowerCase() ?? "";

    const matched = edges.find((e) =>
      e.supplier.toLowerCase() === supplier &&
      e.destination.toLowerCase() === destination &&
      e.tripType.toLowerCase() === tripType,
    );

    if (!matched) {
      return 0;
    }

    const queryMatch = [supplier, destination, tripType].some((k) => k && q.includes(k));
    return queryMatch ? matched.strength * 0.2 : matched.strength * 0.08;
  }
}
