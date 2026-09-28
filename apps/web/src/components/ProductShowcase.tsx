import { LANDING_PRODUCTS } from "../data/landing-catalog";
import { useChatLaunch } from "../chat/ChatLaunchContext";

/**
 * Vidriera de productos detrás del widget de chat -- antes esta zona
 * quedaba en blanco. Datos reales del catálogo (ver `data/landing-catalog.ts`
 * para la justificación de por qué es un espejo estático, no un fetch).
 *
 * "Lo quiero" no navega a ningún lado -- abre el widget de chat (si estaba
 * minimizado) y manda un mensaje ya definido para ESE producto
 * (`chat/ChatLaunchContext.tsx`), arrancando directo el flujo de
 * elegibilidad sin que el usuario tenga que re-explicar qué quiere.
 */
export function ProductShowcase() {
  const { requestOpenWithMessage } = useChatLaunch();

  return (
    <section className="product-showcase">
      <div className="product-showcase-hook">
        <h2>Elegí un producto, hablá con el asistente, salí con una respuesta.</h2>
        <p>Sin formularios largos -- el chat resuelve tu elegibilidad al instante o te deriva a un asesor si hace falta.</p>
      </div>

      <div className="product-grid">
        {LANDING_PRODUCTS.map((product) => (
          <article key={product.productType} className="product-card">
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
            <button type="button" className="product-card-cta" onClick={() => requestOpenWithMessage(product.ctaMessage)}>
              Lo quiero
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
