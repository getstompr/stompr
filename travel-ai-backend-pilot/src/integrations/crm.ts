import { randomUUID } from "node:crypto";
import type { CRMProvider, CRMTaskPayload } from "../core/types.js";

export type CRMTaskResult = {
  provider: CRMProvider;
  externalTaskId: string;
  status: "created";
};

export interface CRMAdapter {
  provider: CRMProvider;
  createTask(payload: CRMTaskPayload): Promise<CRMTaskResult>;
}

abstract class BaseAdapter implements CRMAdapter {
  abstract provider: CRMProvider;

  async createTask(payload: CRMTaskPayload): Promise<CRMTaskResult> {
    const stableId = `${this.provider}_${randomUUID().slice(0, 12)}`;
    void payload;
    return {
      provider: this.provider,
      externalTaskId: stableId,
      status: "created",
    };
  }
}

export class HubSpotAdapter extends BaseAdapter {
  provider: CRMProvider = "hubspot";
}

export class SalesforceAdapter extends BaseAdapter {
  provider: CRMProvider = "salesforce";
}

export class PipedriveAdapter extends BaseAdapter {
  provider: CRMProvider = "pipedrive";
}

export class CRMAdapterFactory {
  private readonly adapters: Record<CRMProvider, CRMAdapter>;

  constructor() {
    this.adapters = {
      hubspot: new HubSpotAdapter(),
      salesforce: new SalesforceAdapter(),
      pipedrive: new PipedriveAdapter(),
    };
  }

  forProvider(provider: CRMProvider): CRMAdapter {
    return this.adapters[provider];
  }
}
