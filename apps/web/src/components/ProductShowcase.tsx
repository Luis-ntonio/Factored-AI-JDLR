import type { CSSProperties } from "react";
import { LANDING_PRODUCTS } from "../data/landing-catalog";
import { useChatLaunch } from "../chat/ChatLaunchContext";

/**
 * Landing detrás del widget de chat -- tres bandas de ritmo editorial
 * (hero / cómo funciona / vidriera de productos), ver `DESIGN.md` sección
 * "Vidriera de productos" y el surface brief en `.impeccable/surfaces/`.
 *
 * "Cómo funciona" describe el modelo REAL del sistema (AUTO/CLARIFY/
 * ESCALATE, ya verificado en producción) -- nunca una promesa de marketing
 * inventada ("Prove, don't claim").
 *
 * "Lo quiero" no navega a ningún lado -- abre el widget de chat (si estaba
 * minimizado) y manda un mensaje ya definido para ESE producto
 * (`chat/ChatLaunchContext.tsx`), arrancando directo el flujo de
 * elegibilidad sin que el usuario tenga que re-explicar qué quiere.
 */

const HOW_IT_WORKS_STEPS = [
  {
    title: "Contale qué necesitás",
    text: "Elegí un producto acá abajo o escribile directo al asistente lo que buscás.",
  },
  {
    title: "Resolvemos al instante",
    text: "Con los datos claros, el sistema te dice si calificás en minutos -- sin formularios largos.",
  },
  {
    title: "Si hace falta, sigue un humano",
    text: "Cuando el caso lo requiere, un asesor recibe el contexto completo y continúa -- nunca te deja esperando una respuesta que nadie te va a dar.",
  },
];

export function ProductShowcase() {
  const { requestOpenWithMessage } = useChatLaunch();

  return (
    <div className="landing">
      <header className="landing-hero">
        <div className="landing-hero-inner">
          <h1>Elegí un producto, hablá con el asistente, salí con una respuesta.</h1>
          <p>Sin formularios largos -- el chat resuelve tu elegibilidad al instante o te deriva a un asesor si hace falta.</p>
        </div>
      </header>

      <section className="how-it-works">
        {/* h2 real -- antes este section arrancaba directo en h3 (los
            pasos), saltando de h1 (hero) a h3 sin un h2 que lo organice.
            Encontrado en /impeccable audit, corregido acá. */}
        <h2 className="how-it-works-title">Cómo funciona</h2>
        <ol className="how-it-works-steps">
          {HOW_IT_WORKS_STEPS.map((step, index) => (
            <li key={step.title} className="how-it-works-step" style={{ "--stagger-index": index } as CSSProperties}>
              <span className="step-number">{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="product-showcase">
        <h2>Elegí tu producto</h2>
        <div className="product-grid">
          {LANDING_PRODUCTS.map((product, index) => (
            <article key={product.productType} className="product-card" style={{ "--stagger-index": index } as CSSProperties}>
              <h3>{product.name}</h3>
              <dl className="product-card-facts">
                <div>
                  <dt>Tasa anual</dt>
                  <dd>
                    {product.interestRateRange.min}% – {product.interestRateRange.max}%
                  </dd>
                </div>
                <div>
                  <dt>Monto</dt>
                  <dd>
                    {product.amountRange.min.toLocaleString()} – {product.amountRange.max.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt>Ingreso mínimo</dt>
                  <dd>{product.minIncome.toLocaleString()}</dd>
                </div>
              </dl>
              <button
                type="button"
                className="product-card-cta"
                aria-label={`Lo quiero: ${product.name}`}
                onClick={() => requestOpenWithMessage(product.ctaMessage)}
              >
                Lo quiero
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
