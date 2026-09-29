# LATAM Bank: profiling y EDA para elegir el flujo

*Factored AI & Data Hackathon 2026 · 27 de septiembre de 2026*

Este documento no es solo el resultado del EDA: es el **hilo de razonamiento** que seguimos como equipo. Cada sección explica *por qué* miramos lo que miramos, qué esperábamos encontrar y cómo lo que encontramos cambió el siguiente paso.

---

## TL;DR

1. **El único dolor medible está en las quejas.** Las llamadas con motivo `Queja` tienen 43.6% de FCR (resolución en el primer contacto), contra 91.5% en `Transaccional`. Además son las de peor CSAT y las que más requieren seguimiento.
2. **Las disputas son el 36% de las quejas:** 12.3k "Cargo no reconocido" y 12.2k "Cobro indebido".
3. **No hay evidencia de demanda de atención por tarjetas.** Probamos 10 hipótesis y todas dieron nulo.
4. **Las tablas no están conectadas causalmente.** Llamadas, quejas y transacciones se comportan como si se hubieran generado por separado. En cambio, el core bancario (clientes, productos, transacciones) sí es coherente y sirve como fuente de verdad.
5. **El texto conversacional no sirve para entrenar.** Los transcripts son plantillas: solo hay 42 textos de cliente distintos y no tienen relación con el tema. Los diálogos de prueba los tenemos que generar nosotros.

**Implicación:** la evidencia favorece **Transaction-dispute intake**, con acciones de tarjeta dentro del flujo. Aún no hay una decisión tomada.

---

## 0. Cómo pensamos el problema antes de tocar los datos

El enunciado nos da 4 flujos candidatos y nos pide elegir **uno** y trabajarlo a fondo:

- Account / payment inquiries
- Card-service support
- Transaction-dispute intake
- Credit-product information & eligibility

El pilar 1 del reto exige justificar la elección **con los datos entregados**, no con intuición. Así que nos planteamos una pregunta guía:

> ¿Cuál de los 4 flujos tiene, a la vez, (a) evidencia de que es un problema real para el cliente, (b) datos confiables para que el agente verifique lo que afirma, y (c) un caso natural de escalamiento a un humano?

Esa pregunta ordenó todo lo que sigue. El profiling responde a "¿qué datos hay y qué tan confiables son?". El EDA 01 responde a "¿dónde está el dolor?". El EDA 02 responde a "¿el dolor de tarjetas y disputas se puede demostrar con datos?".

---

## 1. Datos y método

- **Fuente:** el bucket S3 oficial del hackathon, carpeta `data/`: 7,671 CSV (5.1 GB), convertidos a Parquet con DuckDB.
- **Qué es real y qué no:** el dataset es 100% sintético. Todo caso de prueba que construyamos se etiqueta como *team-generated*.

**Por qué DuckDB sobre Parquet y no pandas:** son ~26M de filas entre todas las tablas. Cargarlas en memoria con pandas es inviable en 15 GB de RAM. DuckDB consulta el Parquet directo desde disco, así que el EDA corre en segundos.

**Cómo reproducirlo** (las credenciales van en un `.env`, que no se sube al repo):

| Paso | Script | Salida |
| --- | --- | --- |
| Descarga | `ml/scripts/download_tables.py` | `data/` |
| Profiling (13 tablas) | `ml/eda/profile_data.py` | `data_parquet/`, `ml/eda/profile_report.md` |
| EDA 01: motivos de contacto y quejas | `ml/eda/01_disputas_vs_tarjetas.py` | `ml/eda/01_disputas_vs_tarjetas.out.md` |
| EDA 02: hipótesis de tarjetas | `ml/eda/02_hipotesis_tarjetas.py` | `ml/eda/02_hipotesis_tarjetas.out.md` |
| EDA 02b: robustez estadística | `ml/eda/02b_robustez.py` | `ml/eda/02b_robustez.out.md` |

**Recursos:** DuckDB está limitado a 4 GB de RAM y 4 hilos. Sin ese límite, la conversión de `digital_events` tumbaba WSL.

---

## 2. Profiling: lo que el diccionario promete y lo que hay

**Qué buscábamos:** antes de elegir un flujo teníamos que saber si los datos eran fiables. El profiling recorre las 13 tablas y calcula, por columna: % de nulos, cardinalidad, mínimos y máximos, top de valores, duplicados, claves foráneas huérfanas y consistencia de fechas.

### Filas reales vs documentadas

| Tabla | Filas reales | Según el PDF |
| --- | ---: | ---: |
| digital_events | 15,620,994 | 10,000,000 |
| transactions | 4,425,008 | 5,000,000 |
| campaign_sends | 1,746,801 | 2,000,000 |
| call_center_interactions | 686,296 | 800,000 |
| products | 400,000 | 400,000 |
| satisfaction_surveys | 212,759 | 250,000 |
| call_transcripts | 171,321 | 200,000 |
| customers | 150,000 | 150,000 |
| complaints | 67,095 | 80,000 |
| daily_exchange_rates | 13,164 | 3,000 |

**Por qué importa:** que los conteos no cuadren con el diccionario fue la primera señal de que el PDF describe un dataset "ideal" que no coincide con el entregado. Nos puso en modo escéptico para todo lo demás.

### Problemas de calidad anunciados que no aparecen

- **Duplicados:** 0, tanto de filas exactas como de claves primarias. El PDF dice ~2%.
- **Cambios de esquema:** hay una sola versión de esquema por tabla.
- **Llegadas tardías:** la partición siempre coincide con `process_date`. El evento cae el mismo día o el anterior, por la zona horaria.

**Consecuencia práctica:** el enunciado premia manejar duplicados, esquemas cambiantes y late arrivals. Como no existen en los datos, tendremos que **simularlos con un test fixture etiquetado** para demostrar que el pipeline los maneja.

### Problemas que sí aparecen

**Texto y etiquetas:**

- `call_transcripts` son plantillas: 42 textos de cliente distintos, casi todos consultas de saldo, con placeholders sin rellenar (`{monto} {moneda}`).
- `detected_intents` siempre dice `consulta_general`.
- `contact_reason`, `reason_category` y `main_topics` son la misma columna, con 6 valores.

**Quejas:**

- `origin_interaction_id` está 100% nulo, así que las quejas no se pueden ligar a llamadas.
- `description` tiene solo 5 textos, todos del tipo "Queja relacionada con X".

**Valores y escalas:**

- No existe MXN: todo lo mexicano está etiquetado como USD, y `amount_usd` es nulo en el 100% de las filas en USD.
- Las encuestas no siguen el diccionario: CSAT y CES van de 1 a 4 (no de 1 a 5), y NPS de 2 a 7 (no de 0 a 10), así que no hay promotores.
- `transaction_country` e `ip_country` mezclan "Mexico" y "México".
- Hay coordenadas cercanas a (0,0).
- `last_updated` tiene fechas en 2027 en 9,316 clientes.

**Claves foráneas rotas:**

- `customers.registration_branch_id`: 99.997% huérfanas.
- `service_agents.assigned_branch_id`: 99.8% huérfanas.
- `mentioned_products`: solo el 0.6% de los IDs existe.
- El resto de las claves foráneas está íntegro.

**Otros datos útiles:**

- Fraude: 4,316 transacciones (0.1%).
- Solo 129 de 1,200 agentes hablan portugués.
- El dataset está 100% en español. **No hay datos en portugués.**

**Qué nos dejó el profiling:** el texto conversacional no sirve (plantillas, intents constantes). Pero el core bancario (clientes, productos, transacciones) se veía sólido. Eso nos llevó a la siguiente pregunta: si el texto no sirve, la elección del flujo tiene que salir de las **métricas de servicio**, no del contenido de las llamadas.

---

## 3. EDA 01: ¿dónde está el dolor?

**Razonamiento:** descartamos elegir el flujo por "cuál nos parece interesante". En su lugar buscamos, en `call_center_interactions`, qué motivo de contacto se comporta peor. La hipótesis de partida era simple: *el flujo que vale la pena automatizar es el que hoy se resuelve mal*. Un motivo que ya se resuelve bien no necesita un agente de IA; uno que se resuelve mal es donde hay margen.

### Métricas por motivo de contacto

La tabla sale de `call_center_interactions` (686,296 filas) agrupada por `contact_reason`. El CSAT viene de un cruce con `satisfaction_surveys` por `interaction_id`.

| Motivo | % volumen | FCR % | Escalado % | Seguimiento % | Duración p50 (s) | CSAT (1–4) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Transaccional | 35.0 | 91.5 | 9.9 | 22.1 | 205 | 2.91 |
| Producto | 22.0 | 89.6 | 10.0 | 23.8 | 263 | 2.90 |
| **Queja** | 17.1 | **43.6** | 10.0 | **63.0** | 431 | **2.43** |
| Técnico | 15.0 | 69.9 | 10.1 | 40.6 | 360 | 2.70 |
| Comercial | 8.0 | 65.2 | 9.8 | 44.5 | 540 | 2.66 |
| Retención | 3.0 | 60.2 | 9.8 | 49.1 | 478 | 2.61 |

**Glosario:**

- **FCR:** porcentaje de `was_resolved = True`, es decir, resuelto en el primer contacto.
- **CSAT:** calificación de la encuesta posterior a la interacción. Solo cubre el ~19% de las interacciones, las que tuvieron encuesta.
- **Duración p50:** mediana de `duration_seconds`. Excluye el 14% de filas sin dato.

**Lectura y decisión que disparó:**

- **Queja** es el mayor dolor: la mitad no se resuelve en el primer contacto, peor CSAT, doble de duración. Confirmó la hipótesis de partida y nos apuntó hacia disputas (que son un tipo de queja).
- **Transaccional** es el mayor volumen, pero ya se resuelve bien (91.5% FCR). Aquí nació la duda: es la opción "account/payment inquiries", con mucho volumen pero poco dolor. La dejamos en segundo plano.
- El escalamiento es plano (~10%) en todos los motivos. **Primera bandera roja:** si el escalamiento no depende del motivo, huele a dato generado al azar. Lo anotamos para verificarlo después.
- No hay diferencias por país ni por segmento, y tampoco estacionalidad. **Segunda bandera roja.**

### Quejas por subcategoría

**Por qué la miramos:** si íbamos hacia disputas, necesitábamos saber si la tabla de quejas distinguía las disputas de otros casos, y si le daba prioridad o urgencia distinta.

| Subcategoría | n | SLA incumplido % | Días de resolución (p50) | High o Critical % | Con compensación % |
| --- | ---: | ---: | ---: | ---: | ---: |
| Cargo no reconocido | 12,297 | 20.4 | 15 | 19.7 | 7.4 |
| Cobro indebido | 12,194 | 19.9 | 16 | 19.6 | 6.9 |
| Problema con app | 12,128 | 20.0 | 16 | 19.9 | 6.7 |
| Atención en sucursal | 11,892 | 20.4 | 16 | 20.2 | 7.0 |
| Calidad de servicio | 11,886 | 20.3 | 16 | 19.5 | 6.7 |

**Lo que nos dijo:** todas las subcategorías tienen métricas idénticas y ~12k casos cada una. La tabla de quejas solo aporta **volumen**, no diferencias de dolor. Tercera bandera roja: la uniformidad se repite.

### Integridad de los cruces

**Por qué:** las tres banderas rojas nos hicieron sospechar que las tablas estaban generadas de forma independiente. Antes de comprometernos con un flujo, teníamos que saber si el agente podría **verificar** una disputa cruzando quejas con transacciones. Si los cruces no funcionan, la tabla de quejas no sirve como verdad.

| Chequeo | Resultado |
| --- | --- |
| El producto afectado pertenece al cliente que reclama | **0 de 44,570** |
| El monto reclamado coincide con una transacción | 0% |
| La transacción pertenece al dueño del producto | **4.4M de 4.4M (100%)** |
| Una llamada va seguida de una queja del mismo cliente en 7 días | 0.3%, igual en todos los motivos |
| Declinadas, reversadas y fraude por tipo de producto | ~5%, ~1% y ~0.1% en **todos** los productos |

**Conclusión del EDA 01:** confirmamos que las tablas no se cruzan causalmente. Pero notamos un contraste clave: dentro de `transactions` y `products` la integridad es perfecta (100% de dueños correctos). Es decir, el core bancario sí es una fuente de verdad, aunque las quejas no. Esto nos dio la forma del flujo: verificar disputas contra las **transacciones reales del cliente**, no contra la tabla de quejas.

---

## 4. EDA 02: ¿hay demanda de atención por tarjetas?

**De dónde salió este EDA:** al comparar disputas contra tarjetas, quedaba una duda honesta. Card-service support tiene volumen (140k tarjetas, 1.5M transacciones con tarjeta), pero no tiene un `contact_reason` propio. La pregunta del equipo fue:

> ¿Y si la demanda de tarjetas existe pero está "escondida" en otros motivos? Antes de descartar tarjetas por falta de evidencia, hay que buscarla en serio.

Así que en vez de asumir, planteamos 10 hipótesis, cada una con una lógica de negocio concreta. La idea que las unía: *si tener o usar una tarjeta genera fricción, esa fricción debería aparecer como más contactos al banco*.

**Método:**

- **Hipótesis temporales:** cada cliente es su propio control. Se compara la tasa de contacto después del evento con una ventana igual 30 días antes (McNemar exacto). Usamos al cliente como su propio control porque cada cliente tiene su propia frecuencia base de llamar; comparar contra el promedio global sesgaría el resultado.
- **Bordes del dataset:** se excluyen los eventos a menos de 60 días de los bordes, porque ahí la ventana posterior queda truncada.
- **Controles:** además se compara contra transacciones aprobadas del mismo periodo y se corren placebos.

### Las hipótesis, con la lógica de cada una

| # | Hipótesis y razonamiento | Resultado | Ratio | p |
| --- | --- | --- | ---: | ---: |
| H1 | *Si las llamadas fueran de tarjetas, mencionarían tarjetas.* Miramos la mezcla de motivos en las llamadas que citan una tarjeta | Misma mezcla (solo 3.5k llamadas con producto válido) | — | — |
| H2 | *Una compra rechazada frustra al cliente y lo hace llamar.* Tras una tarjeta declinada, ¿llama más en 72h? | No | 0.99 | 0.85 |
| H3 | *Un cargo fraudulento es lo más urgente; debería disparar contactos.* Tras un fraude, ¿llama (7d) o reclama (30d) más? | No significativo; el signo se invierte según el método | 1.19 / 0.81 | 0.55 / 0.19 |
| H4 | *Un reverso confunde al cliente ("¿por qué me devolvieron esto?").* Tras un reverso, ¿reclama más en 30d? | No significativo | 1.10 | 0.16 |
| H5 | *Un error en la app de tarjeta empuja a llamar.* Tras un error digital, ¿llama más en 24h? | No; ni siquiera hay errores en páginas de tarjeta | 1.00 | — |
| H6 | *Una tarjeta bloqueada o suspendida obliga a contactar.* ¿Esos clientes contactan más? | No: 4.59 contra 4.58 por cliente | — | — |
| H7 | *Tener tarjeta añade superficie de problemas.* ¿Los que tienen tarjeta contactan o se quejan más? | No: 4.58 contra 4.57; 17.1% de Queja en ambos | — | — |
| H8 | *Quien abre el transcript hablando de su tarjeta debería tener una.* ¿Coincide el texto con el producto real? | No: 48.8% contra 48.9% | — | — |
| H9 | *Una tarjeta en mora genera llamadas de cobro o retención.* ¿Sube el % Comercial/Retención? | No: 10.9% contra 11.0% | — | — |
| H10 | *A más declinaciones, más quejas, por cliente.* Correlación de Spearman | No: Spearman = −0.001 | — | — |

**Lo que aprendimos del método (y por qué corrimos el EDA 02b):** algunas hipótesis daban ratios de 1.1–1.2, tentadores. Para no auto-engañarnos, corrimos un **placebo**: compras aprobadas (que no deberían causar nada) seguidas de una queja. Salió significativo **en sentido contrario** (ratio 0.83, p=0.006). Eso demuestra que el propio diseño con control de "30 días antes" tiene un sesgo de alrededor de ±15% para quejas. Es decir: cualquier ratio de ese tamaño es ruido del método, no señal real. Además hicimos ~12 pruebas, así que un p entre 0.05 y 0.2 no basta para afirmar nada.

**Conclusión del EDA 02:** la intuición de buscar demanda escondida de tarjetas era correcta como reflejo científico, pero el resultado es contundente: no existe. Y algo más importante, esto **no penaliza solo a tarjetas**: H3 y H4 muestran que tampoco podemos ligar disputas a eventos concretos del banco. La desconexión entre tablas es general.

---

## 5. Qué significa para elegir el flujo

| Flujo | Evidencia en los datos | Veredicto |
| --- | --- | --- |
| **Transaction-dispute intake** | Queja con FCR de 43.6% y CSAT de 2.43; las disputas son el 36% de las quejas; las transacciones del cliente son verificables | **La mejor evidencia disponible** |
| Card-service support | ~140k tarjetas y 1.5M transacciones con tarjeta, pero no tiene motivo de contacto propio y las 10 hipótesis dieron nulo | Solo se justifica por volumen y riesgo |
| Account / payment inquiries | Mayor volumen, pero ya tiene 91.5% de FCR | Poco dolor y poco caso de escalamiento |
| Credit-product info & eligibility | 15–20% de nulos en score e ingresos, sin reglas de elegibilidad | La más cara para 10 días |

**Propuesta a discutir:** una disputa por cargo no reconocido que incluya acciones de tarjeta. El flujo sería: identificar la transacción → confirmar con el cliente → bloquear la tarjeta y abrir la disputa → escalar si el monto es alto, hay sospecha de fraude o el cliente reclama seguido. Así el flujo se apoya en el dolor real (quejas) y absorbe lo mejor de tarjetas (la acción de bloqueo) sin abrir un segundo flujo.

---

## 6. Limitaciones que vamos a reportar

1. **La demanda de atención no se puede atribuir a eventos del core bancario**, porque las tablas no están conectadas causalmente. La justificación del flujo se apoya en el motivo de contacto y en el riesgo del proceso.
2. **La tabla `complaints` no sirve como verdad** para evaluar disputas: el producto afectado nunca es del cliente y los montos no coinciden. Los casos se construyen sobre las transacciones reales del cliente.
3. **Los diálogos son generados por nosotros**, porque los transcripts son plantillas. Todo el portugués es generado, ya que el dataset está 100% en español.
4. **Las escalas y monedas no siguen el diccionario** (CSAT de 1 a 4, NPS de 2 a 7, MXN etiquetado como USD). Se documentan y se normalizan.
5. **El CSAT cubre solo el ~19%** de las interacciones.

## Preguntas abiertas para los organizadores

- ¿Qué recursos externos están aprobados, por ejemplo TauIndianBankBench?
- ¿Qué APIs de LLM se pueden usar con estos datos?
