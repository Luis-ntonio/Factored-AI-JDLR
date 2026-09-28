# AI-First Banking Agent — transaction-dispute intake + credit-product info & eligibility

Sistema de customer service bancario (no un chatbot de demo) que implementa
el pipeline **Understand → Decide → Act → Verify → Escalate** para DOS
flujos sobre la misma infraestructura: **disputa de cargo no reconocido**
(`dispute_unrecognized_charge` — foco principal desde el pivot de
2026-09-27, justificado con el EDA real del dataset del hackathon) e
**información de productos de crédito y elegibilidad** (`eligibility_check`
— flujo original, sigue intacto). Soporte español/portugués.
Infraestructura AWS real desplegada vía Terraform — no un mock desechable.

> Este proyecto se construyó en 10 días como respuesta al
> "Factored AI & Data Hackathon 2026" (`hacka-info/Factored AI & Data
> Hackathon 2026.pdf`, contexto local no versionado). El pivot de
> `credit-product info & eligibility` a `transaction-dispute intake` como
> foco principal se decidió el día 1 del dataset real, con evidencia
> cuantitativa del propio EDA del equipo — ver `docs/STATUS.md`, "Fase 3".
> Ver `docs/EVALUATION-CRITERIA.md` para cómo este repo responde a cada uno
> de los 6 puntos que el PDF pide demostrar explícitamente.

## Por dónde empezar

| Si querés... | Mirá... |
|---|---|
| Entender qué se construyó y su estado actual, fase por fase | `docs/STATUS.md` |
| Entender el historial de decisiones y por qué se tomaron | `docs/PLAN.md` |
| Los contratos de datos entre piezas (`UnderstandOutput`, `EligibilityResult`, `DisputeVerificationResult`, etc.) | `docs/CONTRACTS.md` |
| Cómo este repo responde a cada punto del rubric oficial del hackathon | `docs/EVALUATION-CRITERIA.md` |
| Evaluación del guardrail de Bedrock (baseline vs. sistema, held-out real) | `docs/EVALUATION-DECIDE-STAGE.md` |
| Entrenamiento/evaluación del clasificador de fraude sobre el dataset real (resultado negativo honesto) | `ml/README.md`, `ml/REPORT.md` |
| Desplegar/inspeccionar la infraestructura AWS | `terraform/README.md` |
| Correr la chat UI | ver "Quickstart" abajo |
| El blueprint de arquitectura de referencia (no literal, adaptado) | `E2E-documentacion-tecnica/` |

## Arquitectura (resumen — ver `terraform/README.md` para el diagrama completo)

```
Chat UI (apps/web) → API Gateway → Step Function (Express)
  → conversation-agent (Understand: intent + entities, eligibility O disputa)
  → policy-agent (Decide: policies.yaml + guardrail de Bedrock, pre_action)
  → retrieval-agent (Act, product_info/faq) / transaction-agent (Act,
    eligibility_check O dispute_unrecognized_charge -- mismo Lambda,
    discriminado por intent) → verification-agent (Verify)
  → policy-agent (Decide, post_action -- solo eligibility/disputa)
  → escalation-agent (Escalate, cuando corresponde)
```

Un solo pipeline compartido por ambos flujos (decisión de arquitectura
deliberada, ver `docs/STATUS.md` "Fase 3" — extender el pipeline existente
en vez de duplicar infraestructura por challenge). Cada agente es un Lambda
real desplegado en AWS (no simulado), invocado por una Step Function real,
con IAM de mínimo privilegio e invocación restringida entre pasos. Los
datos bancarios/de crédito para el DEMO en vivo son simulados (mock chico
que respeta el schema real); el pipeline de evaluación de `ml/` sí entrena
contra el dataset real completo del hackathon (offline, no en el demo).

## Estructura del monorepo (npm workspaces + un pipeline Python aparte)

```
packages/shared/       Contratos TypeScript compartidos (fuente de verdad de tipos)
services/
  conversation-agent/  Understand: router de intención, idioma ES/PT, contexto
  policy-agent/        Decide: policies.yaml + guardrail de Bedrock (pre_action y post_action)
  retrieval-agent/      Act: catálogo de productos + FAQs
  transaction-agent/    Act: elegibilidad O disputa (computeEligibility/computeDisputeVerification)
  verification-agent/  Verify: segunda verificación independiente
  escalation-agent/    Escalate: resumen estructurado, nunca PII cruda
apps/web/              Chat UI real (React + Vite + TypeScript)
terraform/              Infraestructura AWS (Terraform)
policies.yaml           Reglas de negocio AUTO/CLARIFY/ESCALATE (auditables), ambos flujos
ml/                     Pipeline offline (Python) de evaluación del "learned component" —
                        entrenamiento/evaluación del clasificador de fraude sobre el dataset real
docs/                    STATUS.md, PLAN.md, CONTRACTS.md, EVALUATION-CRITERIA.md, EVALUATION-DECIDE-STAGE.md
```

## Quickstart

```bash
# 1. Instalar dependencias y correr toda la suite de tests
npm install
npm run build
npm test          # 333 tests en verde, ver docs/STATUS.md para el detalle

# 2. Desplegar/verificar infraestructura AWS (requiere credenciales propias,
#    ver terraform/README.md "Credenciales AWS")
cd terraform/envs/dev
terraform init
terraform plan
terraform apply

# 3. Levantar el frontend, ya apuntando al endpoint desplegado
cd ../../..
npm run dev --workspace=@banking-agent/web
# abrir http://localhost:5173
```

No hace falta correr Terraform para ejecutar los tests — todos los servicios
tienen tests unitarios/integración que no dependen de AWS real (usan clientes
mockeados). Terraform solo hace falta para probar el pipeline end-to-end
contra infraestructura real. `ml/` es un pipeline Python separado (venv
propio, ver `ml/README.md`) — no forma parte de `npm test`.

## Estado del proyecto

Pipeline completo funcionando de punta a punta sobre AWS real para AMBOS
flujos (eligibility y disputa), verificado con casos reales en español y
portugués, incluyendo evaluación formal del "learned component" (guardrail
de Bedrock evaluado contra baseline con held-out set real, y un
clasificador de fraude entrenado sobre el dataset completo del hackathon —
ver `docs/STATUS.md`, "Fase ML", para la evidencia completa de cada pieza).
Limitaciones conocidas, honestas y no ocultadas: `docs/EVALUATION-CRITERIA.md`
y la sección de cierre de `docs/STATUS.md`.
