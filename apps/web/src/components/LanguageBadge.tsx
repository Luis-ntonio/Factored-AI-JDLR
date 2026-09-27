import type { LanguageCode } from "@banking-agent/shared";

const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  es: "Español",
  pt: "Português",
};

const LANGUAGE_FLAGS: Record<LanguageCode, string> = {
  es: "ES",
  pt: "PT",
};

export function LanguageBadge({ language }: { language: LanguageCode }) {
  return (
    <span className="badge badge-language" title={`Idioma detectado: ${LANGUAGE_LABELS[language]}`}>
      {LANGUAGE_FLAGS[language]} · {LANGUAGE_LABELS[language]}
    </span>
  );
}
