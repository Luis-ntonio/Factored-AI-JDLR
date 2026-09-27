import type { FaqEntry, ProductCatalogEntry } from "@banking-agent/shared";

/**
 * Seed de datos del catálogo, versionado en el repo.
 *
 * IMPORTANTE (ver README.md de este servicio): este es un catálogo SIMULADO
 * para la demo — el "banco" detrás sigue siendo un mock (docs/PLAN.md,
 * "los datos bancarios/de crédito siguen siendo simulados"). Las tasas,
 * montos y plazos son valores placeholder razonables para un flujo de
 * crédito LATAM genérico, NO tasas reales de ningún banco. Nunca se generan
 * ni se ajustan en runtime — `StaticCatalogRepository` los sirve tal cual
 * están acá, y cada entrada lleva su propio `source` para que quede
 * trazable de dónde salió el dato.
 *
 * `SOURCE_ID` es el identificador de fuente para TODO este seed. Si en el
 * futuro se cargan productos/FAQs desde fuentes distintas (ej. un feed real
 * de tasas), cada entrada debe llevar su propio `source` específico en vez
 * de este valor compartido.
 */
export const SOURCE_ID = "internal_catalog_v1";

/**
 * Catálogo de productos de crédito. Los 4 `ProductType` reales de
 * `packages/shared` (se excluye `"unknown"`, no es un producto).
 *
 * Nota sobre `credit_card`: a diferencia de un préstamo con cuotas fijas,
 * una tarjeta de crédito es una línea revolvente. `termRange` se modela acá
 * como el período de vigencia/renovación típico de la línea (en meses), no
 * como un plazo de cuotas — supuesto explícito documentado acá porque el
 * contrato `ProductCatalogEntry` es genérico para los 4 productos.
 */
export const PRODUCT_CATALOG: readonly ProductCatalogEntry[] = [
  {
    productType: "personal_loan",
    interestRateRange: { min: 18, max: 36 },
    requirements: {
      minIncome: 800,
      acceptedDocumentTypes: ["DNI", "CC", "CPF", "passport"],
      acceptedEmploymentStatus: ["employed", "self_employed", "retired"],
    },
    termRange: { minMonths: 6, maxMonths: 60 },
    amountRange: { min: 500, max: 20000 },
    source: SOURCE_ID,
  },
  {
    productType: "credit_card",
    interestRateRange: { min: 35, max: 55 },
    requirements: {
      minIncome: 500,
      acceptedDocumentTypes: ["DNI", "CC", "CPF", "RG", "passport"],
      acceptedEmploymentStatus: ["employed", "self_employed"],
    },
    // Vigencia/renovación de la línea revolvente (ver nota arriba), no
    // cuotas de un préstamo a plazo fijo.
    termRange: { minMonths: 12, maxMonths: 12 },
    amountRange: { min: 300, max: 15000 },
    source: SOURCE_ID,
  },
  {
    productType: "auto_loan",
    interestRateRange: { min: 12, max: 24 },
    requirements: {
      minIncome: 700,
      acceptedDocumentTypes: ["DNI", "CC", "CPF", "passport"],
      acceptedEmploymentStatus: ["employed", "self_employed", "retired"],
    },
    termRange: { minMonths: 12, maxMonths: 72 },
    amountRange: { min: 3000, max: 60000 },
    source: SOURCE_ID,
  },
  {
    productType: "mortgage",
    interestRateRange: { min: 8, max: 14 },
    requirements: {
      minIncome: 1500,
      acceptedDocumentTypes: ["DNI", "CC", "CPF", "passport"],
      acceptedEmploymentStatus: ["employed", "self_employed"],
    },
    termRange: { minMonths: 60, maxMonths: 360 },
    amountRange: { min: 20000, max: 300000 },
    source: SOURCE_ID,
  },
];

/**
 * FAQs del flujo de crédito, redactadas naturalmente en español y portugués
 * (no traducción automática literal). Cada tema (`id`) tiene un par es/pt.
 */
export const FAQS: readonly FaqEntry[] = [
  // --- Horarios de atención -------------------------------------------
  {
    id: "faq-business-hours",
    language: "es",
    question: "¿Cuál es el horario de atención?",
    answer:
      "Nuestro equipo de atención está disponible de lunes a viernes de 8:00 a 20:00 y sábados de 9:00 a 14:00 (hora local). El chat automatizado, en cambio, está disponible las 24 horas para consultas generales de catálogo.",
    source: SOURCE_ID,
  },
  {
    id: "faq-business-hours",
    language: "pt",
    question: "Qual é o horário de atendimento?",
    answer:
      "Nossa equipe de atendimento está disponível de segunda a sexta das 8h às 20h e aos sábados das 9h às 14h (horário local). Já o chat automatizado fica disponível 24 horas para consultas gerais do catálogo.",
    source: SOURCE_ID,
  },

  // --- Canales de contacto ---------------------------------------------
  {
    id: "faq-contact-channels",
    language: "es",
    question: "¿Por qué canales puedo contactarlos?",
    answer:
      "Podés escribirnos por este chat, por teléfono a nuestra línea de atención al cliente, o acercarte a cualquiera de nuestras sucursales físicas. Si el chat detecta que necesitás hablar con una persona, te transferimos con todo el contexto de la conversación ya cargado.",
    source: SOURCE_ID,
  },
  {
    id: "faq-contact-channels",
    language: "pt",
    question: "Por quais canais posso entrar em contato?",
    answer:
      "Você pode falar conosco por este chat, por telefone na nossa central de atendimento, ou ir a qualquer uma das nossas agências físicas. Se o chat perceber que você precisa falar com uma pessoa, transferimos a conversa já com todo o contexto carregado.",
    source: SOURCE_ID,
  },

  // --- Qué es la tasa efectiva anual ------------------------------------
  {
    id: "faq-what-is-tea",
    language: "es",
    question: "¿Qué es la tasa efectiva anual (TEA)?",
    answer:
      "La tasa efectiva anual (TEA) es el costo (o rendimiento) real de un crédito durante un año, incluyendo el efecto de la capitalización de intereses. A diferencia de una tasa nominal simple, la TEA te permite comparar productos de crédito de forma más justa porque refleja lo que realmente vas a pagar en un año.",
    source: SOURCE_ID,
  },
  {
    id: "faq-what-is-tea",
    language: "pt",
    question: "O que é a taxa efetiva anual?",
    answer:
      "A taxa efetiva anual é o custo (ou rendimento) real de um crédito ao longo de um ano, considerando o efeito da capitalização de juros. Diferente de uma taxa nominal simples, ela permite comparar produtos de crédito de forma mais justa porque reflete o que você realmente vai pagar em um ano.",
    source: SOURCE_ID,
  },

  // --- Tiempo de aprobación típico ---------------------------------------
  {
    id: "faq-approval-time",
    language: "es",
    question: "¿Cuánto tiempo tarda la aprobación de un crédito?",
    answer:
      "Cuando toda la información necesaria está completa y no se requiere revisión humana adicional, la evaluación automática se resuelve en minutos. Si tu caso se deriva a un asesor (por ejemplo, montos altos o datos incompletos), el tiempo de respuesta puede extenderse a 1-2 días hábiles.",
    source: SOURCE_ID,
  },
  {
    id: "faq-approval-time",
    language: "pt",
    question: "Quanto tempo demora a aprovação de um crédito?",
    answer:
      "Quando todas as informações necessárias estão completas e não é preciso revisão humana adicional, a avaliação automática é resolvida em minutos. Se o seu caso for encaminhado a um analista (por exemplo, valores altos ou dados incompletos), o prazo de resposta pode se estender para 1-2 dias úteis.",
    source: SOURCE_ID,
  },

  // --- Qué pasa si te escalan a un humano --------------------------------
  {
    id: "faq-what-happens-if-escalated",
    language: "es",
    question: "¿Qué pasa si me derivan a un asesor humano?",
    answer:
      "Si tu solicitud requiere revisión humana (por ejemplo, por el monto solicitado o por tu situación laboral declarada), un asesor recibe un resumen estructurado de tu caso -sin exponer tus datos sensibles en texto plano innecesariamente- y te contacta para continuar el proceso. No perdés el progreso de la conversación.",
    source: SOURCE_ID,
  },
  {
    id: "faq-what-happens-if-escalated",
    language: "pt",
    question: "O que acontece se eu for encaminhado para um atendente humano?",
    answer:
      "Se a sua solicitação precisar de revisão humana (por exemplo, pelo valor solicitado ou pela sua situação de emprego declarada), um atendente recebe um resumo estruturado do seu caso -sem expor dados sensíveis em texto simples desnecessariamente- e entra em contato para continuar o processo. Você não perde o andamento da conversa.",
    source: SOURCE_ID,
  },

  // --- Documentos necesarios en general -----------------------------------
  {
    id: "faq-required-documents",
    language: "es",
    question: "¿Qué documentos necesito para solicitar un crédito?",
    answer:
      "En general pedimos un documento de identidad vigente (DNI, cédula, CPF o pasaporte, según el país) y datos sobre tu ingreso y situación laboral. Los requisitos exactos de documento aceptado varían según el producto -podés preguntarme por un producto específico para ver el detalle.",
    source: SOURCE_ID,
  },
  {
    id: "faq-required-documents",
    language: "pt",
    question: "Quais documentos preciso para solicitar um crédito?",
    answer:
      "Em geral pedimos um documento de identidade válido (RG, CPF, cédula ou passaporte, dependendo do país) e dados sobre sua renda e situação de emprego. Os requisitos exatos de documento aceito variam conforme o produto -você pode me perguntar sobre um produto específico para ver o detalhe.",
    source: SOURCE_ID,
  },

  // --- Prepago / cancelación anticipada ------------------------------------
  {
    id: "faq-early-repayment",
    language: "es",
    question: "¿Puedo pagar mi crédito antes de tiempo?",
    answer:
      "Sí, en general nuestros productos de crédito permiten el prepago o cancelación anticipada. Las condiciones específicas (si aplica algún costo) dependen del producto y se detallan en el contrato al momento de la aprobación -este catálogo general no reemplaza esas condiciones contractuales.",
    source: SOURCE_ID,
  },
  {
    id: "faq-early-repayment",
    language: "pt",
    question: "Posso pagar meu crédito antes do prazo?",
    answer:
      "Sim, em geral nossos produtos de crédito permitem o pagamento antecipado ou quitação antes do prazo. As condições específicas (se há algum custo) dependem do produto e são detalhadas no contrato no momento da aprovação -este catálogo geral não substitui essas condições contratuais.",
    source: SOURCE_ID,
  },

  // --- Qué pasa si no calificás ---------------------------------------------
  {
    id: "faq-not-eligible",
    language: "es",
    question: "¿Qué pasa si no califico para un crédito?",
    answer:
      "Si la evaluación determina que no calificás en este momento, te lo comunicamos de forma clara junto con los motivos generales cuando sea posible. Esto no te impide volver a intentarlo más adelante, por ejemplo si tu situación de ingresos o empleo cambia.",
    source: SOURCE_ID,
  },
  {
    id: "faq-not-eligible",
    language: "pt",
    question: "O que acontece se eu não for elegível para um crédito?",
    answer:
      "Se a avaliação determinar que você não é elegível no momento, comunicamos isso de forma clara junto com os motivos gerais quando possível. Isso não impede que você tente novamente mais adiante, por exemplo se a sua situação de renda ou emprego mudar.",
    source: SOURCE_ID,
  },
] as const;
