# Product

## Register

product

## Users

Clientes (y prospectos) de un banco retail en LATAM (México/Colombia/Argentina),
en español o portugués, resolviendo una tarea bancaria puntual por chat: consultar
condiciones de un producto de crédito, chequear elegibilidad, o disputar un cargo
que no reconocen. Tres estados de identidad conviven en la misma sesión:

- **Anónimo** — llega sin login, puede preguntar por catálogo/FAQ libremente, pero
  se le pide identificarse en cuanto la consulta toca datos personales
  (elegibilidad, disputas).
- **Cliente** — logueado, segmento estándar.
- **Cliente estrella** — logueado, segmento premium, con umbrales de automatización
  más altos (ej. disputas de mayor monto se resuelven solas en vez de escalar).

El contexto de uso es de alta fricción emocional potencial (dinero, un cargo no
reconocido puede generar ansiedad real) pero de tarea corta — el usuario quiere
una respuesta clara y una salida rápida, no explorar. Mobile-first en la práctica
(el widget es un panel angosto tipo Intercom/Front, pensado para convivir con el
resto de una web bancaria, no para ser la pantalla completa).

## Product Purpose

Un widget de chat embebible que resuelve tres flujos bancarios sin intervención
humana cuando es seguro hacerlo (`AUTO`), pide más información cuando falta un
dato (`CLARIFY`), y deriva a un asesor humano cuando la decisión es sensible o
ambigua (`ESCALATE`) — nunca inventa una aprobación ni expone datos sin verificar
identidad primero. Éxito = el usuario resuelve su consulta sin fricción
innecesaria (no le pedimos login para lo que no lo necesita) y sin falsa
confianza (nunca parece "resuelto" algo que en realidad fue escalado).

## Brand Personality

Fintech moderno — el tono de Nubank/Mercado Pago, no el de un banco tradicional
de sucursal ni el de un chatbot de soporte genérico (Intercom/Zendesk default).
Cercano y directo en el copy, pero nunca informal al punto de sonar poco serio
tratándose de dinero. Da la sensación de un producto bancario propio, hecho a
medida — no un widget de terceros pegado encima.

3 palabras: **directo, confiable, ágil**.

## Anti-references

- Look genérico de SaaS: tarjetas idénticas en grid, hero de métrica grande,
  gradientes decorativos, eyebrows en mayúscula sobre cada sección.
- Chat widget "de catálogo" (Intercom/Zendesk/Drift look por defecto) — burbuja
  redonda genérica, paleta azul-violeta sin identidad, sensación de plugin
  instalado en vez de producto propio.
- Banca tradicional aburrida (formularios grises, exceso de disclaimers visuales,
  cero personalidad) — el banco es serio, la interfaz no tiene por qué serlo.

## Design Principles

1. **La identidad del usuario es visible en todo momento, sin ser ruidosa** — el
   usuario siempre sabe si está anónimo o logueado (y como qué segmento), porque
   eso cambia lo que puede pedir; nunca lo descubre recién al chocar con un gate.
2. **Cada estado del sistema tiene una forma visual distinta** — AUTO, CLARIFY,
   ESCALATE y "pendiente de verificación" no deben verse igual ni competir en
   jerarquía visual entre sí; un usuario debe poder distinguir "ya está resuelto"
   de "todavía falta algo" de un vistazo.
3. **Pedir un dato sensible se siente como un paso deliberado, no un muro** — los
   gates de login (dentro del chat o desde el header) están diseñados para
   sentirse como parte del flujo de la tarea, no como una interrupción abrupta.
4. **Menos fricción que seguridad no negociable** — la superficie puede ser
   cálida/ágil, pero nunca a costa de ocultar que una acción requiere
   verificación real (nunca se simula una identidad no probada).
5. **Mobile-first como panel embebido, no como página completa** — el diseño
   asume que este widget convive con otro contenido alrededor, en pantallas
   angostas primero.

## Accessibility & Inclusion

WCAG 2.1 AA como piso (contexto financiero, no negociable): contraste ≥4.5:1 en
texto de cuerpo/placeholders, ≥3:1 en texto grande, navegación completa por
teclado (el modal de login y el widget deben ser operables sin mouse), estados de
foco visibles, `prefers-reduced-motion` respetado en toda animación. Bilingüe
ES/PT de verdad (no placeholder-only) en todo texto de UI, incluyendo mensajes de
error y estados vacíos.
