---
name: AI-First Banking Agent — Chat Widget
description: Widget de chat embebible para un agente bancario conversacional (ES/PT, LATAM)
colors:
  navy-deep: "oklch(24% 0.07 255)"
  navy-ink: "oklch(20% 0.03 255)"
  navy-ink-muted: "oklch(45% 0.02 255)"
  terracotta: "oklch(58% 0.16 40)"
  terracotta-deep: "oklch(50% 0.16 40)"
  surface: "oklch(97% 0.008 255)"
  surface-raised: "oklch(100% 0 0)"
  border-subtle: "oklch(90% 0.01 255)"
  emerald: "oklch(45% 0.13 155)"
  emerald-surface: "oklch(95% 0.03 155)"
  crimson: "oklch(48% 0.19 25)"
  crimson-surface: "oklch(95% 0.03 25)"
  amber-caution: "oklch(58% 0.11 75)"
  amber-caution-surface: "oklch(96% 0.04 85)"
  gold-premium: "oklch(75% 0.13 85)"
  gold-premium-surface: "oklch(94% 0.05 90)"
  teal: "oklch(48% 0.09 200)"
  teal-deep: "oklch(36% 0.08 200)"
  teal-surface: "oklch(93% 0.03 200)"
  terracotta-tint: "oklch(93% 0.04 40)"
typography:
  hook:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "clamp(1.5rem, 4vw, 2.25rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.02em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.terracotta}"
    textColor: "{colors.surface-raised}"
    rounded: "{rounded.pill}"
    padding: "10px 18px"
  button-primary-hover:
    backgroundColor: "{colors.terracotta-deep}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  card:
    backgroundColor: "{colors.surface-raised}"
    rounded: "{rounded.md}"
    padding: "12px"
---

# Design System: AI-First Banking Agent — Chat Widget

## Overview

**Creative North Star: "El Asesor de Confianza"**

Un widget de chat que se comporta como un asesor bancario de confianza, no como
un plugin de soporte instalado encima de una web. Cada estado del sistema
(resuelto automáticamente, necesita más información, escalado a un humano,
identidad pendiente de verificar) se comunica con la misma claridad directa que
daría una persona — nunca con ambigüedad decorativa ni con una calma visual que
no se corresponde con lo que realmente pasó. El navy institucional profundo
transmite la seriedad de un banco; el acento terracota cálido — usado solo en
acciones, nunca como decoración — transmite que hay una persona (o un sistema
tan claro como una) del otro lado, no un formulario gris.

Se rechaza explícitamente el azul genérico de SaaS (`#2563eb` sin identidad
propia, repetido en decenas de miles de productos) y el violeta/azul-lavanda
por defecto de los widgets de chat de IA — ninguno de los dos dice nada sobre
*este* producto en particular.

**Actualización (2026-09-28) — de Restrained a Full Palette:** la primera
versión de este sistema era deliberadamente restringida (navy + un acento).
Con la landing (`ProductShowcase.tsx`, la única superficie Persuade del
sistema) se sube a **Full palette**: se agrega Teal como segunda familia de
color -- **Identity**, no Acción ni Estado. Teal nunca aparece en un botón o
control (Terracota sigue siendo el ÚNICO color de acción, The One Action
Rule intacta) ni compite con los 4 colores de estado ya reservados
(emerald/crimson/amber/gold) -- vive en fondos de sección grandes (el hero
navy→teal de la landing), badges numerados de secuencia, y un detalle no
funcional que conecta el widget con la landing (filete de 3px en el header
del chat). El widget (Operate) se queda intencionalmente más restringido
que la landing (Persuade) -- misma paleta, distinto grado de compromiso,
coherente con qué modo tiene permiso de ser más audaz.

**Key Characteristics:**
- Navy profundo como color estructural dominante (headers, chrome, texto).
- Terracota cálido como ÚNICO acento de acción — el mismo rol en todos lados
  (enviar, confirmar, links), nunca dos colores de acción compitiendo.
- Teal como segunda familia de Identity -- fondos de sección grandes en la
  landing, nunca un control interactivo.
- Tarjetas de contenido planas con borde sutil; sombra real reservada
  exclusivamamente para lo que literalmente flota sobre la página (burbuja,
  panel del widget, modal).
- Esquinas más generosas que el sistema anterior (12-16px en vez de 8-12px) —
  parte deliberada de la dirección "cálido y táctil".
- Semántica de color de estado separada de la semántica de rol: verde
  esmeralda = resuelto/verificado, rojo = escalado/error, ámbar sobrio = falta
  información, dorado brillante = segmento premium (cliente estrella) — los
  últimos dos comparten familia cálida a propósito (ambos piden atención) pero
  se diferencian en saturación/luminosidad para no confundir "atención
  requerida" con "sos premium".

## Colors

Paleta restringida: un color estructural (navy), un único acento de acción
(terracota), y 4 colores de estado con su superficie clara asociada. Ningún
otro color de marca — el resto son neutros.

### Primary
- **Navy Profundo** (`oklch(24% 0.07 255)` / `#10214b` aprox.): estructura —
  header del chat, chrome del app-shell, botón "Iniciar sesión" en reposo. Es
  el color que más "pesa" visualmente aunque cubra poca superficie (bloques
  chicos y oscuros, no fondos grandes).
- **Navy Tinta** (`oklch(20% 0.03 255)`): texto de cuerpo por defecto — casi
  negro, con el tinte de matiz del navy en vez de un gris/negro neutro.

### Secondary
- **Terracota** (`oklch(58% 0.16 40)`): el ÚNICO acento de acción del sistema
  — botón de enviar mensaje, botón "Ingresar" del login, links, foco de
  inputs. **The One Action Rule.** Si un elemento es clickeable y dispara la
  acción principal de su contexto, es terracota. Si no, no lo es — nunca dos
  colores de acción compitiendo en la misma pantalla.
- **Terracota Profundo** (`oklch(50% 0.16 40)`): hover/active de lo anterior.

### Neutral
- **Superficie** (`oklch(97% 0.008 255)`): fondo de página/app-shell — casi
  blanco, tinte frío hacia el navy (NUNCA hacia cream/beige — ver Don'ts).
- **Superficie Elevada** (`oklch(100% 0 0)`, blanco puro): fondo de tarjetas,
  panel del widget, modal — contraste real contra la superficie de página.
- **Borde Sutil** (`oklch(90% 0.01 255)`): borde de tarjetas planas.
- **Tinta Muted** (`oklch(45% 0.02 255)`): texto secundario, timestamps,
  metadata (caseId, fuente de un dato).

### Identity
- **Teal** (`oklch(48% 0.09 200)`): segunda familia de color, agregada con
  la landing -- fondo del hero (gradiente navy→teal), badges numerados de
  "Cómo funciona", filete de 3px en el header del widget. NUNCA un botón,
  control interactivo, ni un quinto significado de estado.
- **Teal Profundo** (`oklch(36% 0.08 200)`): extremo oscuro del gradiente
  del hero.
- **Teal Superficie** (`oklch(93% 0.03 200)`): fondo claro de la sección
  "Cómo funciona".
- **Terracota Tinte** (`oklch(93% 0.04 40)`): no es un color nuevo -- una
  extensión tonal de Terracota usada como color de borde en el hover de las
  tarjetas de producto (conecta el hover con el único color de acción sin
  convertirlo en un segundo color de acción).

### Named Rules
**The Navy Shadow Rule.** Ninguna sombra en el sistema usa negro puro
(`rgba(0,0,0,...)`). Todas las sombras reales (burbuja, panel, modal) están
teñidas hacia el navy (`oklch(24% 0.07 255 / alpha)`), para que la elevación
se sienta parte de la misma identidad de color, no un default de navegador.

## Typography

**Body/Display/Label Font:** stack nativo del sistema (`-apple-system,
BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`).

**Character:** funcional y rápida, sin personalidad tipográfica propia —
decisión deliberada, no ausencia de decisión.

### Named Rules
**The Native Font Rule.** Este es un widget EMBEBIDO, no una página completa
— cargar una tipografía web propia suma latencia real por una ganancia de
identidad marginal en un componente que ocupa una fracción de la pantalla del
usuario. La personalidad del sistema vive en color, forma y movimiento, no en
la tipografía. Si en el futuro este widget se convierte en un producto de
página completa, reconsiderar.

### Hierarchy
- **Hook** (700, `clamp(1.5rem, 4vw, 2.25rem)`, 1.2, -0.01em): rol nuevo,
  agregado con la vidriera de productos (`ProductShowcase.tsx`) — el único
  lugar del sistema que es una superficie Persuade (el visitante decide y
  actúa) en vez de Operate como el resto del widget. Mismo stack nativo,
  ningún tamaño fijo de página completa (sigue The Native Font Rule) — solo
  más grande que Título porque tiene que funcionar como headline de página,
  no de header de panel angosto.
- **Título** (700, 16px, 1.3): nombre del widget en el header del chat.
- **Cuerpo** (400, 14px, 1.5): texto de mensajes y tarjetas de contenido.
- **Label** (700, 11px, 1.2, +0.02em, uppercase donde aplica): badges de
  idioma/rol, títulos de sección dentro de tarjetas (ej. "QUÉ SIGUE" en la
  tarjeta de escalación).
- **Meta** (400, 10-11px): timestamps, caseId — siempre en Tinta Muted, nunca
  compitiendo con el cuerpo del mensaje.

Nota de honestidad (no reparada acá, fuera de alcance de este cambio): el
resto de la hoja de estilos usa varios tamaños intermedios (12/13/15/17/18px,
etc.) para badges/botones/metadata que nunca se formalizaron como pasos de
esta escala — deuda preexistente de documentación, no algo introducido por
la vidriera de productos. `impeccable detect` la reporta como advisory.

## Layout

Dos modos de contenedor, mismo componente interno (`.chat-app`):
- **Standalone** (legacy/demo): centrado, `max-width: 720px`, altura completa
  del viewport.
- **Widget** (modo real de producción): panel flotante `380×600px` (máximo
  `calc(100vh - 120px)`), esquina inferior derecha, `24px` de margen del
  borde del viewport. Este es el modo primario — el diseño se piensa
  "widget-first", el standalone es un contenedor de conveniencia, no la
  superficie de referencia.

Ritmo de espaciado: `4 / 8 / 12 / 16 / 24px`. El historial de chat usa `16px`
de padding y `12px` de gap entre mensajes — suficiente aire para que burbujas
consecutivas del mismo emisor no se sientan pegadas, sin desperdiciar el
espacio limitado de un panel de 380px de ancho.

Responsive: en viewports angostos (`<420px` de ancho) el panel del widget
pasa a ocupar el viewport completo menos un margen chico, en vez de mantener
el ancho fijo de 380px (que se desborda en mobile real).

## Elevation & Depth

Híbrida, deliberada — dos vocabularios distintos según si la superficie
flota sobre la página o vive dentro del flujo del chat.

- **Tarjetas de contenido** (info-card, clarify-card, escalation-card,
  dispute-card, login-prompt-card): planas, sin sombra — solo un borde de 1px
  en Borde Sutil. Se distinguen entre sí por el color de fondo/borde de
  estado, no por elevación.
- **Superficies flotantes** (burbuja del widget, panel del widget, modal de
  login): sombra real, porque literalmente están por encima del resto de la
  página — ver Shadow Vocabulary.

### Shadow Vocabulary
- **Burbuja** (`box-shadow: 0 6px 20px oklch(24% 0.07 255 / 0.25)`): ambient,
  invita al click.
- **Panel del widget** (`box-shadow: 0 12px 32px oklch(24% 0.07 255 / 0.18)`):
  estructural, comunica "esto es una capa nueva sobre la página".
- **Modal** (`box-shadow: 0 16px 40px oklch(24% 0.07 255 / 0.22)`): la
  superficie más "arriba" de todas — sombra más fuerte que el panel.

### Named Rules
**The Flat-Card Rule.** Ninguna tarjeta de contenido dentro del chat lleva
sombra. Si algo dentro del chat necesita destacar, se destaca por color de
estado (borde/fondo), nunca por elevación falsa.

## Shapes

Esquinas generosas, parte de la dirección "cálido y táctil" — más redondeadas
que el sistema anterior (que usaba 8-12px casi en todos lados).

- **sm** (`8px`): elementos chicos (badges no-pill, inputs de una línea).
- **md** (`12px`): tarjetas de contenido, bubble del lado que "señala" hacia
  el emisor (la esquina opuesta a `sm=2px` para dar la sensación de origen).
- **lg** (`16px`): panel del widget, modal — las superficies más grandes/
  flotantes llevan el radio más generoso.
- **pill** (`999px`): todo lo que es una acción clickeable chica (botones de
  enviar/ingresar, badges de idioma/rol, burbujas de chat en su forma
  general).

## Components

### Buttons
- **Shape:** pill (`999px`) para acciones primarias; `8px` para acciones
  secundarias/ghost (ej. "Cerrar sesión", "Nueva conversación").
- **Primary:** fondo Terracota, texto blanco, `padding: 10px 18px`,
  `font-weight: 600`.
- **Hover:** fondo pasa a Terracota Profundo + `transform: translateY(-1px)`
  sutil (parte de "cálido y táctil" — el botón "responde" al hover, no solo
  cambia de color). `transition` con `cubic-bezier(0.16, 1, 0.3, 1)`
  (ease-out-quint), `180ms`.
- **Focus-visible:** anillo de foco en Terracota a `2px` de offset — nunca se
  suprime el outline por defecto sin reemplazo.
- **Disabled:** fondo neutro (`oklch(85% 0.01 255)`), sin hover, cursor
  `not-allowed`.
- **Ghost/Secondary:** fondo transparente, borde `1px` en Borde Sutil (o
  blanco translúcido sobre el navy del header), texto Navy Tinta.

### Cards / Containers
- **Corner Style:** `12px` (ver Shapes).
- **Background:** Superficie Elevada (blanco) por defecto; color de estado
  (Esmeralda/Crimson/Ámbar claros) según el tipo de tarjeta.
- **Shadow Strategy:** ninguna — ver Elevation & Depth.
- **Border:** `1px` en Borde Sutil, o el borde de color del estado
  correspondiente cuando la tarjeta representa un estado (clarify/error/
  dispute/login-prompt).
- **Internal Padding:** `12px` (escala `md`).

### Inputs / Fields
- **Style:** borde `1px` en Borde Sutil, fondo blanco, radio `8px`.
- **Focus:** borde pasa a Terracota + halo sutil (`box-shadow: 0 0 0 3px
  oklch(58% 0.16 40 / 0.15)`) — nunca solo un cambio de color de borde sin
  ningún indicador adicional (accesibilidad de foco).
- **Error:** borde Crimson, texto de error debajo en Crimson.

### Navigation (header del widget)
- **Style:** fondo Navy Profundo, texto blanco, título en Label/Título.
  Botones ghost translúcidos sobre el navy (ej. "Nueva conversación").

### Burbuja flotante + Panel (componente señal del sistema)
La burbuja y el panel del widget son el componente más distintivo del
sistema — el punto donde "cálido y táctil" es más visible. Transición de
apertura/cierre animada (`opacity` + `transform: scale/translateY`, nunca un
corte duro de `display: none` a `block`), con
`@media (prefers-reduced-motion: reduce)` reduciendo a un crossfade sin
transform.

### Landing (`ProductShowcase.tsx`, app-shell)
Única superficie Persuade del sistema — el resto es Operate. Tres bandas de
ritmo editorial, cada una con su propia entrada animada al montar (fade +
`translateY(18px)`, `480ms`, nunca scroll-triggered con contenido oculto
por defecto — ver Named Rule abajo):

1. **Hero**: fondo `linear-gradient(135deg, navy, teal-deep)`, texto blanco,
   Hook (rol tipográfico, ver Typography) + subtítulo centrados. Motivo
   geométrico propio (un anillo fino de `1px`, sin blur/glow) en vez de
   iconografía o fotografía — la generación de imágenes queda pendiente a
   propósito (el usuario va a sumar un MCP de imágenes más adelante).
2. **Cómo funciona**: fondo Teal Superficie, 3 pasos numerados (`1`/`2`/`3`
   en badges circulares Teal) que describen el modelo REAL del sistema
   (AUTO/CLARIFY/ESCALATE) — nunca una promesa de marketing inventada. Los
   números están permitidos acá porque la secuencia SÍ importa (a
   diferencia de un eyebrow "01" decorativo, prohibido en cualquier otro
   lado).
3. **Vidriera de productos**: grid de tarjetas (`repeat(auto-fit,
   minmax(380px, 1fr))`, 2 columnas parejas en desktop dentro del
   `max-width: 1040px` del contenedor, 1 columna en mobile). Cada tarjeta
   hereda Cards/Containers (plana, Borde Sutil, `12px`) EN REPOSO — al
   hover gana `translateY(-4px)`, borde Terracota Tinte, y
   `--shadow-panel` (respuesta al estado, nunca decoración permanente,
   mismo principio que la Flat-Card Rule original). Botón "Lo quiero" =
   Button Primary exacto. **The One Action Rule sigue aplicando acá**: "Lo
   quiero" es la única acción de cada tarjeta, terracota, sin competir con
   ningún otro color de acción en la página (Teal nunca es clickeable).

### Named Rules
**The Visible-By-Default Rule.** Ninguna animación de entrada de la landing
esconde contenido hasta que dispare (nada de `opacity: 0` sin animación
como estado base persistente) — todas corren una sola vez al montar, con
`prefers-reduced-motion` cayendo a un crossfade sin transform. Evita el
problema real de contenido que nunca aparece si el JS falla o si una
captura headless corre antes de que el scroll dispare el reveal.

**Pendiente declarado (no una decisión final):** esta landing no usa
fotografía ni ilustración todavía — el usuario va a incorporar un MCP de
generación de imágenes más adelante. Cuando eso pase, revisar este archivo:
la landing probablemente gane una sección de "plates" (ilustración por
producto) que hoy no existe.

## Do's and Don'ts

### Do:
- **Do** usar Terracota exclusivamente para la acción principal de cada
  contexto — nunca dos colores de acción compitiendo en una misma pantalla.
- **Do** teñir toda sombra hacia el navy (`oklch(24% 0.07 255 / alpha)`),
  nunca negro puro.
- **Do** mantener las tarjetas de contenido del chat planas (sin sombra),
  reservando elevación real para lo que literalmente flota.
- **Do** respetar `prefers-reduced-motion` en toda animación nueva
  (burbuja/panel, hover de botones, entrada de mensajes).

### Don't:
- **Don't** usar el azul genérico `#2563eb` en ningún lugar nuevo — es
  exactamente el look de SaaS sin identidad que este rediseño reemplaza.
- **Don't** tender el fondo de página hacia cream/beige/sand para transmitir
  calidez — la calidez de este sistema vive en el acento terracota y en la
  forma/movimiento, el fondo neutro se mantiene frío (tinte hacia el navy).
- **Don't** usar el mismo tono ámbar para "falta información" (Ámbar Cauteloso)
  y para "cliente estrella" (Dorado Premium) — son estados semánticamente
  distintos y deben poder distinguirse sin leer el texto.
- **Don't** agregar sombra a una tarjeta de contenido del chat para "hacerla
  destacar" — usar color de estado en su lugar.
