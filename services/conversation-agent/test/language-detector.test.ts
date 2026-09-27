import { describe, expect, it } from "vitest";
import { detectLanguage } from "../src/router/language-detector";

describe("detectLanguage", () => {
  it("detecta español por keywords y signos ¿¡", () => {
    expect(detectLanguage("¿Cuál es la tasa de interés del préstamo personal?").language).toBe("es");
  });

  it("detecta español en un saludo simple", () => {
    expect(detectLanguage("Hola, quiero saber sobre mi tarjeta de crédito").language).toBe("es");
  });

  it("detecta portugués por diacríticos exclusivos (ã, õ, ç)", () => {
    expect(detectLanguage("Não sei qual é a condição do meu cartão de crédito").language).toBe("pt");
  });

  it("detecta portugués por keywords típicas", () => {
    expect(detectLanguage("Bom dia, eu quero saber sobre o empréstimo pessoal").language).toBe("pt");
  });

  it("permite cambiar de idioma mensaje a mensaje dentro de la misma conversación", () => {
    const first = detectLanguage("Hola, ¿cuál es la tasa del préstamo?");
    const second = detectLanguage("Na verdade, prefiro falar em português, obrigado");
    expect(first.language).toBe("es");
    expect(second.language).toBe("pt");
  });

  it("usa 'es' como default documentado ante mensaje vacío/ambiguo", () => {
    expect(detectLanguage("").language).toBe("es");
    expect(detectLanguage("12345").language).toBe("es");
  });

  // Regresión: bug reportado por QA — "quero" matcheaba como substring crudo
  // dentro de la palabra española "que" (ES_STRONG_WORDS), empatando esScore
  // con ptScore y cayendo al default "es" en vez de detectar "pt".
  // Ver countMatches() en language-detector.ts.
  it("detecta portugués en 'quero falar com um atendente' (no debe matchear 'que' dentro de 'quero')", () => {
    expect(detectLanguage("quero falar com um atendente").language).toBe("pt");
  });

  it("detecta portugués en 'quero falar com uma pessoa'", () => {
    expect(detectLanguage("quero falar com uma pessoa").language).toBe("pt");
  });

  it("detecta portugués en 'quero saber os requisitos'", () => {
    expect(detectLanguage("quero saber os requisitos").language).toBe("pt");
  });

  it("sigue detectando portugués cuando la señal fuerte está pegada a puntuación final", () => {
    expect(detectLanguage("quero saber sobre a taxa?").language).toBe("pt");
  });

  it("preserva la intención original del fallback de puntuación: palabra clave pegada directamente a un signo", () => {
    expect(detectLanguage("Obrigado!").language).toBe("pt");
    expect(detectLanguage("Gracias!").language).toBe("es");
  });
});
