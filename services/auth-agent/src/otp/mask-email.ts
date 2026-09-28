/**
 * Enmascara un email para logs -- mismo espíritu que `maskDocumentId` de
 * `services/escalation-agent/src/mask.ts`, implementación local a este
 * servicio (necesidad angosta, no se sube a `@banking-agent/shared`).
 *
 * "ma***@example.com" -- conserva los primeros 2 caracteres del local-part y
 * el dominio completo (útil para debugging real sin exponer el email
 * completo en CloudWatch).
 */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}
