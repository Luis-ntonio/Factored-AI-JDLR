/**
 * Enmascarado de `entities.document_id` (PII directa, ver
 * `docs/CONTRACTS.md` sección 4.3 y `policies.yaml` sección `security`) y
 * redacción defensiva de cualquier ocurrencia cruda del valor en el
 * `EscalationSummary` final.
 *
 * Esta es la pieza que resuelve la regla `sec-masked-identifier-for-escalation`
 * de `policies.yaml`, dejada explícitamente "PENDIENTE de confirmar con
 * escalation-agent cuando se implemente".
 */

/** Cantidad de caracteres finales que se mantienen visibles. */
const VISIBLE_SUFFIX_LENGTH = 4;

/**
 * Criterio de enmascarado EXACTO:
 *  - `null`/`undefined`/no-string/string vacío (tras `trim`) -> `null` (no
 *    se conoce ningún documento para este case, no hay nada que enmascarar).
 *  - longitud <= 4 -> se enmascara POR COMPLETO (`"*".repeat(longitud)`).
 *    Un documento tan corto revelaría demasiado si se mostraran sus últimos
 *    4 caracteres (serían TODOS los caracteres) -- se prefiere el criterio
 *    más conservador.
 *  - longitud > 4 -> se mantienen los últimos 4 caracteres visibles, el
 *    resto se reemplaza por `*` (uno por carácter, para preservar una
 *    noción aproximada de longitud sin ambigüedad adicional). Ejemplo:
 *    `"12345678900"` (11 chars) -> `"*******8900"`.
 */
export function maskDocumentId(rawDocumentId: string | null | undefined): string | null {
  if (typeof rawDocumentId !== "string") return null;
  const trimmed = rawDocumentId.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= VISIBLE_SUFFIX_LENGTH) return "*".repeat(trimmed.length);
  const visible = trimmed.slice(-VISIBLE_SUFFIX_LENGTH);
  return "*".repeat(trimmed.length - VISIBLE_SUFFIX_LENGTH) + visible;
}

/**
 * Longitud mínima del valor crudo para intentar redactarlo por substring de
 * cualquier campo de texto del resumen. Por debajo de este umbral NO se
 * redacta por substring (ver "Limitaciones" en README.md): un valor
 * demasiado corto podría coincidir por casualidad con una subcadena de un
 * número no relacionado (ej. `requested_amount` en la narrativa) y producir
 * un enmascarado incorrecto/engañoso. Los documentos de identidad reales
 * (DNI/CC/CPF/RG/pasaporte) siempre tienen más caracteres que esto en la
 * práctica, así que esta salvaguarda no debilita la protección real.
 */
const MIN_REDACTABLE_LENGTH = 5;

/**
 * Red de seguridad de "defensa en profundidad": recorre TODOS los campos de
 * texto (recursivamente, incluyendo arrays) de `value` y reemplaza cualquier
 * ocurrencia literal del `rawDocumentId` crudo por su versión enmascarada.
 *
 * Por diseño, `buildEscalationSummary` (`src/build-summary.ts`) NUNCA debería
 * interpolar `entities.document_id` crudo en ningún campo -- esta función es
 * una segunda línea de defensa (no la única), para que ningún cambio futuro
 * en las plantillas de texto, o un `reason`/`askField` mal formado que
 * llegara desde policy-agent/verification-agent, filtre el valor crudo por
 * accidente. Ver test explícito de seguridad en `test/security.test.ts`.
 */
export function redactRawDocumentId<T>(
  value: T,
  rawDocumentId: string | null | undefined,
  maskedDocumentId: string | null
): T {
  if (typeof rawDocumentId !== "string") return value;
  const needle = rawDocumentId.trim();
  if (needle.length < MIN_REDACTABLE_LENGTH) return value;
  const replacement = maskedDocumentId ?? "*".repeat(needle.length);
  return deepReplaceInStrings(value, needle, replacement);
}

function deepReplaceInStrings<T>(value: T, needle: string, replacement: string): T {
  if (typeof value === "string") {
    return value.split(needle).join(replacement) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => deepReplaceInStrings(entry, needle, replacement)) as unknown as T;
  }
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = deepReplaceInStrings(entry, needle, replacement);
    }
    return out as unknown as T;
  }
  return value;
}
