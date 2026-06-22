import type { PlatformStore } from "./platformStore.js";
import type { AnalyticsFunnel } from "./types.js";

export class AnalyticsService {
  constructor(private readonly store: PlatformStore) {}

  async getFunnel(tenantId: string): Promise<AnalyticsFunnel> {
    return this.store.getFunnel(tenantId);
  }

  async markMeetingBooked(tenantId: string): Promise<void> {
    await this.store.updateFunnel(tenantId, { meetingsBooked: 1 });
  }

  async markBooking(tenantId: string): Promise<void> {
    await this.store.updateFunnel(tenantId, { bookings: 1 });
  }
}
