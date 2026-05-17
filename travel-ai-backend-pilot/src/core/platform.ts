import { CRMAdapterFactory } from "../integrations/crm.js";
import { createModelRouterFromEnv } from "../models/providers.js";
import { createPgPool } from "../db/pg.js";
import { ConversationOrchestrator } from "./orchestrator.js";
import { AnalyticsService } from "./analytics.js";
import { defaultTenant, InMemoryPlatformStore } from "./store.js";
import { IngestionService } from "./ingestionService.js";
import { PostgresPlatformStore } from "./postgresStore.js";
import type { PlatformStore } from "./platformStore.js";

export class Platform {
  readonly store: PlatformStore;
  readonly ingest: IngestionService;
  readonly orchestrator: ConversationOrchestrator;
  readonly analytics: AnalyticsService;
  readonly crmFactory: CRMAdapterFactory;

  private constructor(store: PlatformStore) {
    this.store = store;
    this.crmFactory = new CRMAdapterFactory();
    this.ingest = new IngestionService(this.store);
    this.analytics = new AnalyticsService(this.store);

    const modelRouter = createModelRouterFromEnv();
    this.orchestrator = new ConversationOrchestrator(this.store, modelRouter, this.crmFactory, this.ingest.graph);
  }

  static async create(): Promise<Platform> {
    const backend = (process.env.STORAGE_BACKEND ?? "memory").toLowerCase();
    const store: PlatformStore =
      backend === "postgres"
        ? new PostgresPlatformStore(createPgPool())
        : new InMemoryPlatformStore();

    const platform = new Platform(store);
    await platform.seed();
    return platform;
  }

  private async seed(): Promise<void> {
    await this.store.ensureTenant(defaultTenant);

    await this.ingest.registerSource({
      sourceId: "source_demo_website",
      tenantId: defaultTenant.tenantId,
      kind: "website",
      uri: "https://luxevoyages.example",
      enabled: true,
      syncMode: "nightly",
      domain: "public_marketing",
    });

    await this.ingest.registerSource({
      sourceId: "source_demo_supplier_terms",
      tenantId: defaultTenant.tenantId,
      kind: "pdf",
      uri: "file://supplier-terms.pdf",
      enabled: true,
      syncMode: "nightly",
      domain: "supplier_terms",
    });

    await this.ingest.registerSource({
      sourceId: "source_demo_private_offers",
      tenantId: defaultTenant.tenantId,
      kind: "crm_export",
      uri: "s3://agency/private-offers.csv",
      enabled: true,
      syncMode: "event",
      domain: "client_private_offers",
    });

    await this.ingest.runSource(defaultTenant.tenantId, "source_demo_website");
    await this.ingest.runSource(defaultTenant.tenantId, "source_demo_supplier_terms");
    await this.ingest.runSource(defaultTenant.tenantId, "source_demo_private_offers");
  }
}

