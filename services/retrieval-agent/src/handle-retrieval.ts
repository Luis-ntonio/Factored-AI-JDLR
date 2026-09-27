import type { RetrievalResult, UnderstandOutput } from "@banking-agent/shared";
import type { CatalogRepository } from "./repository/types";

/**
 * Lógica de negocio pura de retrieval-agent — la capa "Act" (parte
 * informativa) del pipeline. Se exporta directamente (no solo envuelta en
 * el handler de Lambda) porque:
 *
 *  1. Los tests unitarios/de integración la llaman sin pasar por un evento
 *     de API Gateway (ver `test/handle-retrieval.test.ts` y
 *     `test/pipeline-integration.test.ts`).
 *  2. Es el punto de entrada esperado desde un futuro orquestador real
 *     (Step Functions u otro), que hoy NO existe (ver README.md,
 *     limitación de orquestación).
 *
 * Contrato de entrada: un `UnderstandOutput` ya autorizado por policy-agent
 * con `decision === "AUTO"` (`evaluatePreAction` de `@banking-agent/policy-
 * agent`) para `intent: "product_info"` o `intent: "faq"` — los DOS únicos
 * intents que `policies.yaml` autoriza hacia retrieval-agent
 * (`auto-product-info-complete`, `auto-faq-always`). Hoy esa garantía es un
 * contrato probado por test (`pipeline-integration.test.ts`), no algo
 * forzado en runtime por infraestructura — ver limitación en README.md.
 *
 * Reliability/Security no-negociable: esta función NUNCA inventa un dato
 * que no venga de `repo` — cada camino de "no encontrado" o "fuente no
 * disponible" resulta en `found: false` con `notes` explícito, nunca en una
 * excepción sin manejar ni en un valor placeholder disfrazado de dato real.
 */
export async function handleRetrieval(input: UnderstandOutput, repo: CatalogRepository): Promise<RetrievalResult> {
  const language = input.language;

  try {
    if (input.intent === "product_info") {
      return await resolveProductInfo(input, repo, language);
    }

    if (input.intent === "faq") {
      return await resolveFaq(repo, language);
    }

    // Defensivo: retrieval-agent solo debería recibir "product_info"/"faq"
    // (ver docstring arriba). Si llega otro intent (ej. bug de
    // orquestación futura), no se inventa ni se intenta adivinar una
    // respuesta — se responde de forma explícita y segura.
    return {
      intent: "faq",
      language,
      found: false,
      notes: `retrieval-agent no maneja el intent "${input.intent}" (solo "product_info" y "faq" están autorizados hacia esta pieza por policies.yaml). Esto no debería ocurrir si policy-agent gateó correctamente el turno; si ocurre, es un bug de orquestación, no un dato inventado.`,
    };
  } catch (error) {
    // Red de seguridad final: cualquier excepción inesperada (ej. un bug no
    // previsto en el repo inyectado) nunca se propaga como 5xx/crash — se
    // responde igual con un RetrievalResult válido, `found: false`.
    return {
      intent: input.intent === "faq" ? "faq" : "product_info",
      language,
      found: false,
      notes: `Error interno inesperado al resolver la consulta de catálogo/FAQs: ${
        error instanceof Error ? error.message : "error desconocido"
      }. No se generó ningún dato para compensar la falla.`,
    };
  }
}

async function resolveProductInfo(
  input: UnderstandOutput,
  repo: CatalogRepository,
  language: UnderstandOutput["language"]
): Promise<RetrievalResult> {
  const productType = input.entities.product_type;

  if (!productType || productType === "unknown") {
    return {
      intent: "product_info",
      language,
      found: false,
      notes:
        "No se recibió un product_type válido en entities (debería haber sido garantizado por policy-agent antes de llegar acá). No se puede identificar qué catálogo devolver sin inventar un producto.",
    };
  }

  const result = await repo.getProduct(productType);

  switch (result.status) {
    case "found":
      return { intent: "product_info", language, found: true, product: result.value };
    case "not_found":
      return {
        intent: "product_info",
        language,
        found: false,
        notes: `No hay información de catálogo para el producto "${productType}" en la fuente actual. No se inventa una tasa/condición para compensarlo.`,
      };
    case "unavailable":
      return {
        intent: "product_info",
        language,
        found: false,
        notes: `El catálogo de productos no está disponible en este momento (motivo: ${result.reason}). Por favor intente nuevamente más tarde en vez de recibir un dato no confirmado.`,
      };
  }
}

async function resolveFaq(repo: CatalogRepository, language: UnderstandOutput["language"]): Promise<RetrievalResult> {
  const result = await repo.listFaqs(language);

  switch (result.status) {
    case "found":
      if (result.value.length === 0) {
        return {
          intent: "faq",
          language,
          found: false,
          notes: `No hay FAQs registradas para el idioma "${language}" en la fuente actual.`,
        };
      }
      return { intent: "faq", language, found: true, faqs: result.value };
    case "not_found":
      // No debería ocurrir con las implementaciones actuales (ver
      // repository/*.ts), pero se maneja igual por completitud del tipo
      // CatalogLookupResult sin asumir nada.
      return {
        intent: "faq",
        language,
        found: false,
        notes: `No hay FAQs registradas para el idioma "${language}" en la fuente actual.`,
      };
    case "unavailable":
      return {
        intent: "faq",
        language,
        found: false,
        notes: `Las FAQs no están disponibles en este momento (motivo: ${result.reason}). Por favor intente nuevamente más tarde.`,
      };
  }
}
