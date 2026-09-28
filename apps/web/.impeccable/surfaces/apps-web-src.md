---
version: 1
slug: "apps-web-src"
primary_target: "apps/web/src"
related_targets: []
---

# Surface: apps/web landing (app-shell, behind the chat widget)

Mode: Persuade (a first-time visitor decides which credit product to ask
about and acts on it — distinct from the chat widget itself, which stays
Operate).

Audience: the same LATAM bank visitor as PRODUCT.md (anónimo la mayoría de
las veces en este punto — todavía no abrió el chat), en español, viendo la
página por primera vez antes de interactuar con nada.

Job: entender en segundos qué productos de crédito existen y sus términos
reales, elegir uno, y arrancar una conversación de elegibilidad para ESE
producto sin tener que re-explicarlo dentro del chat.

Proof/content: datos reales del catálogo (`services/retrieval-agent/src/
data/catalog.ts`, `SOURCE_ID: internal_catalog_v1`) — tasa/monto/ingreso
mínimo de los 4 productos reales (personal_loan, credit_card, auto_loan,
mortgage). Nunca cifras inventadas.

Constraints: extiende el mundo visual ya establecido (DESIGN.md), no
reemplaza nada del widget de chat. Sin generación de imágenes en este
entorno -- code-led por contrato, sin comp.

## Direction contract

THESIS: La página prueba que este banco tiene productos de crédito reales
con términos transparentes -- rechaza el default de categoría (hero
genérico + CTA vago que esconde la oferta real detrás de marketing).

OWN-WORLD: El sistema ya establecido en DESIGN.md -- navy profundo como
chrome estructural, terracota como ÚNICO color de acción (los 4 botones
"Lo quiero"), tarjetas de producto planas con Borde Sutil (sin sombra,
mismo Flat-Card Rule que las tarjetas del chat), radios generosos
(12-16px), cifras reales legibles sin decoración.

STORY: El visitante llega, lee un hook de una línea, escanea 4 tarjetas de
producto con términos reales, elige una, hace click en "Lo quiero", y
aparece dentro del chat ya preguntando por su elegibilidad para ESE
producto específico -- sin tener que re-explicarlo.

FIRST VIEWPORT: Topbar existente (AuthPanel) sin cambios. Debajo, un hook
corto centrado (headline + subtítulo de 1-2 líneas). Debajo, grid de 4
tarjetas de producto (2x2 desktop, apiladas en mobile) -- cada una: nombre
del producto, rango de tasa, rango de monto, ingreso mínimo, botón "Lo
quiero" terracota. La burbuja del chat sigue flotando abajo a la derecha,
sin cambios.

FORM: Extensión de la superficie ya establecida -- pedido precisamente
especificado por el usuario (4 tarjetas, hook corto, botón "Lo quiero" que
manda un mensaje predefinido), no una superficie abierta que requiera
exploración de 5-7 estructuras -- sin concept-seed roll, por la excepción
explícita de new-work.md ("Never run the script for a local extension or a
precisely specified narrow request; shape those directly").

FINISH: unreviewed and undocumented is unfinished; this build ends with
the finish review, the verdict, DESIGN.md, and every shipping raster
carrying its provenance. (Sin rasters nuevos en este build -- solo tokens
y componentes ya existentes de DESIGN.md, sin generación de imágenes.)
