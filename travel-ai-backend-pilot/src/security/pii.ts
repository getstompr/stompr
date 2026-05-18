const piiPatterns: RegExp[] = [
  /\b\d{3}-\d{2}-\d{4}\b/g, // SSN-style
  /\b(?:\d[ -]*?){13,16}\b/g, // card-ish
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\+?\d[\d\s().-]{7,}\d/g,
];

export function detectPii(text: string): boolean {
  return piiPatterns.some((pattern) => pattern.test(text));
}

export function redactPii(text: string): string {
  let result = text;
  for (const pattern of piiPatterns) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

export type Role = "admin" | "agent" | "viewer";

export function canAccessTenant(role: Role, actorTenantId: string, targetTenantId: string): boolean {
  if (role === "admin") {
    return true;
  }
  return actorTenantId === targetTenantId;
}
