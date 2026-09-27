# AI-First Banking Agent — credit-product info & eligibility

Sistema de customer service bancario (no un chatbot de demo) que implementa
el pipeline **Understand → Decide → Act → Verify → Escalate** para un único
flujo: información de productos de crédito y evaluación de elegibilidad.
Soporte español/portugués. Infraestructura AWS real desplegada vía
Terraform — no un mock desechable.

> Este proyecto se construyó en 10 días como respuesta al challenge descrito
> en `Challenge.jpeg`/`Goal.jpeg`/`Focus.jpeg` (raíz del repo). El objetivo
> explícito era un producto completo evaluable como "Make Your Result A Real
> Service" (ver `docs/EVALUATION-CRITERIA.md`), no una demo de superficie.

## Por dónde empezar

| Si querés... | Mirá... |
|---|---|
| Entender qué se construyó y su estado actual, fase por fase | `docs/STATUS.md` |
| Entender el historial de decisiones y por qué se tomaron | `docs/PLAN.md` |
| Los contratos de datos entre piezas (`UnderstandOutput`, `EligibilityResult`, etc.) | `docs/CONTRACTS.md` |
| El criterio de evaluación real del proyecto y las limitaciones finales | `docs/EVALUATION-CRITERIA.md` |
| Desplegar/inspeccionar la infraestructura AWS | `terraform/README.md` |
| Correr la chat UI | ver "Quickstart" abajo |
| El blueprint de arquitectura de referencia (no literal, adaptado) | `E2E-documentacion-tecnica/` |

## Arquitectura (resumen — ver `terraform/README.md` para el diagrama completo)

```
Chat UI (apps/web) → API Gateway → Step Function (Express)
  → conversation-agent (Understand) → policy-agent (Decide)
  → retrieval-agent / transaction-agent (Act) → verification-agent (Verify)
  → escalation-agent (Escalate, cuando corresponde)
```

Cada agente es un Lambda real desplegado en AWS (no simulado), invocado por
una Step Function real, con IAM de mínimo privilegio e invocación
restringida entre pasos. Los datos bancarios/de crédito son simulados (no
hay acceso a un banco real) — la infraestructura sí es real.

## Estructura del monorepo (npm workspaces)

```
packages/shared/       Contratos TypeScript compartidos (fuente de verdad de tipos)
services/
  conversation-agent/  Understand: router de intención, idioma ES/PT, contexto
  policy-agent/        Decide: evalúa policies.yaml (pre_action y post_action)
  retrieval-agent/      Act: catálogo de productos + FAQs
  transaction-agent/    Act: cálculo de elegibilidad, idempotente
  verification-agent/  Verify: segunda verificación independiente
  escalation-agent/    Escalate: resumen estructurado, nunca PII cruda
apps/web/              Chat UI real (React + Vite + TypeScript)
terraform/              Infraestructura AWS (Terraform)
policies.yaml           Reglas de negocio AUTO/CLARIFY/ESCALATE (auditables)
docs/                    STATUS.md, PLAN.md, CONTRACTS.md, EVALUATION-CRITERIA.md
```

## Quickstart

```bash
# 1. Instalar dependencias y correr toda la suite de tests
npm install
npm run build
npm test          # 193 tests en verde, ver docs/STATUS.md para el detalle

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
contra infraestructura real.

## Estado del proyecto

Pipeline completo funcionando de punta a punta sobre AWS real, verificado
con casos reales en español y portugués (ver `docs/STATUS.md` para la
evidencia completa de cada pieza). Limitaciones conocidas, honestas y no
ocultadas: `docs/EVALUATION-CRITERIA.md` y la sección de cierre de
`docs/STATUS.md` (P2).
