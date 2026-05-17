export type WidgetInitConfig = {
  apiBaseUrl: string;
  tenantId: string;
  siteId: string;
  consentGiven: boolean;
};

export async function initTravelWidget(config: WidgetInitConfig): Promise<{ sessionId: string; send: (message: string) => Promise<unknown> }> {
  const sessionResp = await fetch(`${config.apiBaseUrl}/v1/chat/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenantId: config.tenantId,
      siteId: config.siteId,
      visitorId: crypto.randomUUID(),
      consentGiven: config.consentGiven,
    }),
  });

  const session = (await sessionResp.json()) as { sessionId: string };

  return {
    sessionId: session.sessionId,
    send: async (message: string) => {
      const resp = await fetch(`${config.apiBaseUrl}/v1/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: config.tenantId,
          sessionId: session.sessionId,
          message,
        }),
      });
      return resp.json();
    },
  };
}
