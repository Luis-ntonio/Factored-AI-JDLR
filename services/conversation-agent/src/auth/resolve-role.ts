import { verifySessionToken, type UserRole } from "@banking-agent/shared";
import { getSessionSecret } from "./session-config";

export interface ResolvedSession {
  role: UserRole;
  /** `null` si `role === "anonimo"`. */
  customerId: string | null;
}

const ANONYMOUS: ResolvedSession = { role: "anonimo", customerId: null };

/**
 * Resuelve el rol de sesión de ESTE turno a partir de `sessionToken`
 * (opcional, viene en el body de `POST /chat` -- ver `ChatRequestBody` en
 * `../index.ts`). NUNCA lanza -- cualquier problema (sin token, SSM no
 * disponible, token inválido/expirado) degrada a `ANONYMOUS`, jamás
 * bloquea el turno completo por esto.
 *
 * Deliberadamente NO confía en `body.customerId` para identidad -- ese
 * campo históricamente podía venir sin probar nada (ver
 * `docs/EVALUATION-CRITERIA.md`, gap de autenticación ya documentado). La
 * única fuente de verdad de identidad es el `sessionToken` verificado acá.
 */
export async function resolveRole(sessionToken: string | null | undefined): Promise<ResolvedSession> {
  if (!sessionToken) return ANONYMOUS;

  const secret = await getSessionSecret();
  if (!secret) return ANONYMOUS;

  const payload = verifySessionToken(sessionToken, secret);
  if (!payload) return ANONYMOUS;

  return { role: payload.role, customerId: payload.customerId };
}
