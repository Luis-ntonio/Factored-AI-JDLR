import type { EscalationSummary, LanguageCode } from "@banking-agent/shared";
import { ENTITY_LABELS, formatEntityValue } from "../labels";

const HEADER_TITLE: Record<LanguageCode, string> = {
  es: "Tu caso fue transferido a un asesor humano",
  pt: "Seu caso foi encaminhado para um atendente humano",
};

const SUBTITLE: Record<LanguageCode, string> = {
  es: "Un humano va a continuar esta conversación. No sigas esperando una respuesta automática para este pedido.",
  pt: "Um atendente humano vai continuar esta conversa. Não espere mais por uma resposta automática para este pedido.",
};

const USER_REQUEST_TITLE: Record<LanguageCode, string> = {
  es: "Lo que pediste",
  pt: "O que você pediu",
};

const KNOWN_DATA_TITLE: Record<LanguageCode, string> = {
  es: "Datos que ya registramos",
  pt: "Dados que já registramos",
};

const DOCUMENT_TITLE: Record<LanguageCode, string> = {
  es: "Documento",
  pt: "Documento",
};

const UNRESOLVED_REASON_TITLE: Record<LanguageCode, string> = {
  es: "Por qué no se resolvió automáticamente",
  pt: "Por que não foi resolvido automaticamente",
};

const UNRESOLVED_REASON_TEXT: Record<LanguageCode, string> = {
  es: "Este tipo de solicitud requiere validación adicional de nuestro equipo antes de continuar.",
  pt: "Este tipo de solicitação exige validação adicional da nossa equipe antes de prosseguir.",
};

const NEXT_STEPS_TITLE: Record<LanguageCode, string> = {
  es: "Qué sigue",
  pt: "Próximos passos",
};

const CASE_LABEL: Record<LanguageCode, string> = {
  es: "Caso:",
  pt: "Caso:",
};

/**
 * Tarjeta de escalación — NUNCA renderiza `EscalationSummary` como JSON
 * crudo. Encabezado inequívoco de "transferido a un humano" seguido del
 * resumen legible: qué quería el usuario, datos ya conocidos (con labels
 * legibles, no keys crudas), documento enmascarado si existe, motivo por el
 * que no se resolvió automáticamente, y qué queda pendiente para el humano.
 */
export function EscalationCard({ escalation }: { escalation: EscalationSummary }) {
  const language = escalation.language;
  const knownEntries = Object.entries(escalation.knownEntities).filter(([, v]) => v !== null && v !== undefined);

  return (
    <div className="escalation-card">
      <div className="escalation-header">
        <span className="escalation-icon" aria-hidden="true">
          ⚠
        </span>
        <strong>{HEADER_TITLE[language]}</strong>
      </div>
      <p className="escalation-subtitle">{SUBTITLE[language]}</p>

      <div className="escalation-section">
        <span className="escalation-section-title">{USER_REQUEST_TITLE[language]}</span>
        {/* `userRequestSummary` ya llega traducido al idioma correcto desde el backend. */}
        <p>{escalation.userRequestSummary}</p>
      </div>

      {knownEntries.length > 0 && (
        <div className="escalation-section">
          <span className="escalation-section-title">{KNOWN_DATA_TITLE[language]}</span>
          <ul className="escalation-entities">
            {knownEntries.map(([key, value]) => (
              <li key={key}>
                <strong>{ENTITY_LABELS[language][key] ?? key}:</strong> {formatEntityValue(key, value, language)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {escalation.maskedDocumentId && (
        <div className="escalation-section">
          <span className="escalation-section-title">{DOCUMENT_TITLE[language]}</span>
          <p>{escalation.maskedDocumentId}</p>
        </div>
      )}

      <div className="escalation-section">
        <span className="escalation-section-title">{UNRESOLVED_REASON_TITLE[language]}</span>
        {/* `unresolvedReason` es la razón de auditoría interna (cita reglas
            de policies.yaml y archivos de código, pensada para quien revisa
            el caso, no para el cliente) — NUNCA se muestra tal cual acá. Se
            reemplaza por un mensaje genérico seguro para el cliente final. */}
        <p>{UNRESOLVED_REASON_TEXT[language]}</p>
      </div>

      {escalation.pendingQuestion && (
        <div className="escalation-section">
          <span className="escalation-section-title">{NEXT_STEPS_TITLE[language]}</span>
          {/* `pendingQuestion` ya llega traducido al idioma correcto desde el backend. */}
          <p>{escalation.pendingQuestion}</p>
        </div>
      )}

      <p className="escalation-caseid">
        {CASE_LABEL[language]} {escalation.caseId}
      </p>
    </div>
  );
}
