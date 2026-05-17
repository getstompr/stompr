import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extractRecordsFromSource } from "../src/rag/extraction.js";
import type { IngestSource } from "../src/core/types.js";

function buildSource(overrides: Partial<IngestSource>): IngestSource {
  return {
    sourceId: "source_test",
    tenantId: "tenant_luxe_demo",
    kind: "website",
    uri: "https://agency.example",
    enabled: true,
    syncMode: "manual_priority",
    domain: "public_marketing",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Extraction pipeline", () => {
  it("crawls website pages and converts html to records", async () => {
    const htmlByUrl: Record<string, string> = {
      "https://agency.example/":
        "<html><head><title>Luxury Travel</title></head><body><h1>Tailored escapes</h1><p>Private villas in Tahiti.</p><a href='/offers'>Offers</a></body></html>",
      "https://agency.example/offers":
        "<html><head><title>Offers</title></head><body><ul><li>Four Seasons Bora Bora</li><li>Aman Kyoto</li></ul></body></html>",
    };

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      const body = htmlByUrl[url];
      if (!body) {
        return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
      }

      return new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    }));

    const records = await extractRecordsFromSource(buildSource({ kind: "website", uri: "https://agency.example/" }));
    expect(records.length).toBeGreaterThanOrEqual(2);
    expect(records[0]?.title).toContain("Luxury Travel");
    expect(records.some((r) => r.content.includes("Four Seasons Bora Bora"))).toBe(true);
  });

  it("extracts text from local csv exports", async () => {
    const dir = await mkdtemp(join(tmpdir(), "travel-ingest-"));
    const csvPath = join(dir, "offers.csv");
    await writeFile(csvPath, "destination,supplier\nTahiti,Four Seasons\nKyoto,Aman\n", "utf-8");

    try {
      const records = await extractRecordsFromSource(
        buildSource({
          kind: "crm_export",
          uri: csvPath,
          domain: "client_private_offers",
        }),
      );

      expect(records).toHaveLength(1);
      expect(records[0]?.content).toContain("Tahiti,Four Seasons");
      expect(records[0]?.content).toContain("Kyoto,Aman");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

