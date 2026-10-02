import type { Customer } from "@banking-agent/transaction-agent/dist/data/mock-core-banking";

/**
 * Verificación de identidad PURA (sin AWS, testeable sin mocks) -- ya NO
 * mintea ningún token acá (ver `otp/verify.ts` para eso). Decisión de
 * seguridad del usuario (ver docs/STATUS.md, fase "Login con código por
 * email obligatorio"): "un documento solo no prueba identidad" (PDF del
 * hackathon, pág. 5) se venía resolviendo exigiendo TAMBIÉN nombre/
 * apellido, pero eso sigue siendo un solo factor verificable a partir de
 * datos que pueden filtrarse o publicarse (literalmente el caso de este
 * proyecto: 2 clientes reales con su documento+nombre publicados en el
 * propio README para que los jueces los prueben -- ver
 * `services/transaction-agent/src/data/real-customers.ts`). Por eso TODO
 * login ahora exige un segundo factor real (código de un solo uso por
 * email, `otp/`) -- esta función sigue siendo el primer factor (identidad
 * declarada vs. core bancario), ahora como paso previo a enviar el código,
 * nunca como el login completo por sí solo.
 */

export interface IdentityClaim {
  document_id: string;
  first_name: string;
  last_name: string;
}

/** trim + lowercase + sin tildes/diacríticos (NFD, despoja los combining
 * marks) -- muchos usuarios tipean sin tildes (teclados sin config regional,
 * mobile, apuro). "Maria" debe matchear "María" igual que "maria" matchea
 * "MARIA" -- mismo espíritu de tolerancia, un usuario real no debería
 * fallar el login por no haber tipeado un acento. */
export function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Busca el `Customer` cuyo `document_number` matchea Y cuyo nombre/apellido
 * matchean (case-insensitive, trim, sin tildes) -- `null` si CUALQUIERA de
 * los dos no matchea, exactamente igual (nunca se revela cuál de los dos
 * falló -- anti-enumeración, mismo criterio que `otp/request.ts` aplica
 * después sobre el resultado de esta función).
 */
export function findVerifiedCustomer(
  claim: Partial<IdentityClaim>,
  customers: readonly Customer[]
): Customer | null {
  const documentId = typeof claim.document_id === "string" ? claim.document_id.trim() : "";
  const firstName = typeof claim.first_name === "string" ? claim.first_name : "";
  const lastName = typeof claim.last_name === "string" ? claim.last_name : "";

  if (!documentId || !firstName.trim() || !lastName.trim()) {
    return null;
  }

  const customer = customers.find((c) => c.document_number === documentId);
  if (!customer) return null;

  const nameMatches =
    normalizeName(customer.first_name) === normalizeName(firstName) &&
    normalizeName(customer.last_name) === normalizeName(lastName);
  return nameMatches ? customer : null;
}
