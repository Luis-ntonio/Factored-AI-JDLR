import type { EligibilityResult, LanguageCode, RetrievalResult } from "@banking-agent/shared";
import type { ChatResponse } from "../types";
import { isRetrievalResult } from "../types";
import { ENTITY_LABELS, PRODUCT_TYPE_LABELS, SCORE_ZONE_LABELS, formatEntityValue } from "../labels";
import { EscalationCard } from "./EscalationCard";
import { LanguageBadge } from "./LanguageBadge";

const NO_PRODUCT_INFO: Record<LanguageCode, string> = {
  es: "No encontramos información disponible para esa consulta.",
  pt: "Não encontramos informações disponíveis para essa consulta.",
};

const NO_FAQS: Record<LanguageCode, string> = {
  es: "No encontramos preguntas frecuentes para esa consulta.",
  pt: "Não encontramos perguntas frequentes para essa consulta.",
};

const INTEREST_RATE_LABEL: Record<LanguageCode, string> = {
  es: "Tasa de interés anual:",
  pt: "Taxa de juros anual:",
};

const AMOUNT_LABEL: Record<LanguageCode, string> = {
  es: "Monto:",
  pt: "Valor:",
};

const TERM_LABEL: Record<LanguageCode, string> = {
  es: "Plazo:",
  pt: "Prazo:",
};

const MIN_INCOME_LABEL: Record<LanguageCode, string> = {
  es: "Ingreso mínimo requerido:",
  pt: "Renda mínima exigida:",
};

const ACCEPTED_DOCUMENTS_LABEL: Record<LanguageCode, string> = {
  es: "Documentos aceptados:",
  pt: "Documentos aceitos:",
};

const ACCEPTED_EMPLOYMENT_LABEL: Record<LanguageCode, string> = {
  es: "Situación laboral aceptada:",
  pt: "Situação profissional aceita:",
};

const SOURCE_LABEL: Record<LanguageCode, string> = {
  es: "Fuente:",
  pt: "Fonte:",
};

const ELIGIBILITY_RESULT_LABEL: Record<LanguageCode, string> = {
  es: "Resultado de elegibilidad — ",
  pt: "Resultado de elegibilidade — ",
};

const SCORE_LABEL: Record<LanguageCode, string> = {
  es: "Puntaje:",
  pt: "Pontuação:",
};

function clarifyQuestion(language: LanguageCode, label: string): string {
  return language === "pt"
    ? `Você poderia nos informar ${label.toLowerCase()}?`
    : `¿Podrías indicarnos tu ${label.toLowerCase()}?`;
}

function ProductCard({ retrieval, language }: { retrieval: RetrievalResult; language: LanguageCode }) {
  if (!retrieval.found) {
    return <p className="bot-text">{retrieval.notes ?? NO_PRODUCT_INFO[language]}</p>;
  }

  const product = retrieval.product;
  if (!product) {
    return <p className="bot-text">{NO_PRODUCT_INFO[language]}</p>;
  }

  return (
    <div className="info-card">
      <strong>{PRODUCT_TYPE_LABELS[language][product.productType] ?? product.productType}</strong>
      <ul>
        <li>
          {INTEREST_RATE_LABEL[language]} {product.interestRateRange.min}% – {product.interestRateRange.max}%
        </li>
        <li>
          {AMOUNT_LABEL[language]} {product.amountRange.min.toLocaleString()} – {product.amountRange.max.toLocaleString()}
        </li>
        <li>
          {TERM_LABEL[language]} {product.termRange.minMonths} – {product.termRange.maxMonths} meses
        </li>
        <li>
          {MIN_INCOME_LABEL[language]} {product.requirements.minIncome.toLocaleString()}
        </li>
        <li>
          {ACCEPTED_DOCUMENTS_LABEL[language]} {product.requirements.acceptedDocumentTypes.join(", ")}
        </li>
        <li>
          {ACCEPTED_EMPLOYMENT_LABEL[language]} {product.requirements.acceptedEmploymentStatus.join(", ")}
        </li>
      </ul>
      <span className="source-tag">
        {SOURCE_LABEL[language]} {product.source}
      </span>
    </div>
  );
}

function FaqList({ retrieval, language }: { retrieval: RetrievalResult; language: LanguageCode }) {
  if (!retrieval.found || !retrieval.faqs || retrieval.faqs.length === 0) {
    return <p className="bot-text">{retrieval.notes ?? NO_FAQS[language]}</p>;
  }

  return (
    <div className="info-card">
      {retrieval.faqs.map((faq) => (
        <div key={faq.id} className="faq-item">
          <p className="faq-question">{faq.question}</p>
          <p className="faq-answer">{faq.answer}</p>
          <span className="source-tag">
            {SOURCE_LABEL[language]} {faq.source}
          </span>
        </div>
      ))}
    </div>
  );
}

function EligibilityCard({ eligibility, language }: { eligibility: EligibilityResult; language: LanguageCode }) {
  const zoneClass =
    eligibility.score_zone === "approved"
      ? "zone-approved"
      : eligibility.score_zone === "declined"
        ? "zone-declined"
        : "zone-borderline";

  return (
    <div className={`info-card eligibility-card ${zoneClass}`}>
      <strong>
        {ELIGIBILITY_RESULT_LABEL[language]}
        {PRODUCT_TYPE_LABELS[language][eligibility.productType] ?? eligibility.productType}
      </strong>
      <p className="eligibility-zone">{SCORE_ZONE_LABELS[language][eligibility.score_zone] ?? eligibility.score_zone}</p>
      <p>
        {SCORE_LABEL[language]} {eligibility.eligibility_score} / 100
      </p>
    </div>
  );
}

function ClarifyQuestion({
  response,
  language,
}: {
  response: Extract<ChatResponse, { status: "clarify" }>;
  language: LanguageCode;
}) {
  const label = ENTITY_LABELS[language][response.policyDecision.askField] ?? response.policyDecision.askField;
  // `policyDecision.reason` es texto de auditoría para un revisor humano
  // interno (cita reglas/archivos de policies.yaml, ver evaluator.ts) — NUNCA
  // se le muestra al cliente final. Solo la pregunta ya "humanizada".
  return (
    <div className="info-card clarify-card">
      <p className="clarify-question">{clarifyQuestion(language, label)}</p>
    </div>
  );
}

const UNAVAILABLE_TEXT: Record<LanguageCode, string> = {
  es: "No se pudo procesar tu solicitud. Por favor, intenta de nuevo.",
  pt: "Não foi possível processar sua solicitação. Por favor, tente novamente.",
};

const TECHNICAL_DETAIL_LABEL: Record<LanguageCode, string> = {
  es: "Detalle técnico:",
  pt: "Detalhe técnico:",
};

/** Renderiza una respuesta COMPLETA del backend (sin streaming: llega entera
 * de una sola vez, formateada según `status`/`intent`).
 *
 * `fallbackLanguage`: `ChatUnavailableResponse` no siempre trae `language`
 * en el contrato del backend (puede fallar antes de que conversation-agent
 * detecte el idioma del turno) -- para ese caso puntual se usa el último
 * idioma conocido de la conversación (estado `lang` de App.tsx), no un
 * español fijo, para no mezclar idiomas si la conversación ya venía en
 * portugués. */
export function BotResponse({
  response,
  fallbackLanguage,
}: {
  response: ChatResponse;
  fallbackLanguage: LanguageCode;
}) {
  if (response.status === "unavailable") {
    const language = response.language ?? fallbackLanguage;
    return (
      <div className="info-card error-card">
        <p className="bot-text">{UNAVAILABLE_TEXT[language]}</p>
        {response.reason && (
          <span className="source-tag">
            {TECHNICAL_DETAIL_LABEL[language]} {response.reason}
          </span>
        )}
      </div>
    );
  }

  if (response.status === "escalate") {
    return (
      <>
        <LanguageBadge language={response.language} />
        <EscalationCard escalation={response.escalation} />
      </>
    );
  }

  if (response.status === "clarify") {
    return (
      <>
        <LanguageBadge language={response.language} />
        <ClarifyQuestion response={response} language={response.language} />
      </>
    );
  }

  // status === "ok"
  const { result, intent, language } = response;
  return (
    <>
      <LanguageBadge language={language} />
      {isRetrievalResult(result) ? (
        intent === "faq" ? (
          <FaqList retrieval={result} language={language} />
        ) : (
          <ProductCard retrieval={result} language={language} />
        )
      ) : (
        <EligibilityCard eligibility={result} language={language} />
      )}
    </>
  );
}
