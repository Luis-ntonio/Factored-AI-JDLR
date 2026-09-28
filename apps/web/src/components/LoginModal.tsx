import { useState } from "react";
import type { LanguageCode } from "@banking-agent/shared";
import { useAuth } from "../auth/AuthContext";

const TITLE: Record<LanguageCode, string> = {
  es: "Iniciar sesión",
  pt: "Entrar",
};

const SUBTITLE: Record<LanguageCode, string> = {
  es: "Un documento solo no prueba tu identidad -- completá también tu nombre y apellido, tal como figuran en tu cuenta.",
  pt: "Um documento sozinho não comprova sua identidade -- preencha também seu nome e sobrenome, como constam na sua conta.",
};

const DOCUMENT_LABEL: Record<LanguageCode, string> = { es: "Documento de identidad", pt: "Documento de identidade" };
const FIRST_NAME_LABEL: Record<LanguageCode, string> = { es: "Nombre", pt: "Nome" };
const LAST_NAME_LABEL: Record<LanguageCode, string> = { es: "Apellido", pt: "Sobrenome" };
const SUBMIT_LABEL: Record<LanguageCode, string> = { es: "Ingresar", pt: "Entrar" };
const CANCEL_LABEL: Record<LanguageCode, string> = { es: "Cancelar", pt: "Cancelar" };
const SUBMITTING_LABEL: Record<LanguageCode, string> = { es: "Verificando...", pt: "Verificando..." };

export function LoginModal({ language }: { language: LanguageCode }) {
  const { isModalOpen, closeModal, login } = useAuth();
  const [documentId, setDocumentId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isModalOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!documentId.trim() || !firstName.trim() || !lastName.trim()) return;

    setIsSubmitting(true);
    setError(null);
    const result = await login(documentId.trim(), firstName.trim(), lastName.trim(), language);
    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.error ?? null);
      return;
    }
    setDocumentId("");
    setFirstName("");
    setLastName("");
  }

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>{TITLE[language]}</h2>
        <p className="modal-subtitle">{SUBTITLE[language]}</p>
        <form onSubmit={handleSubmit}>
          <label>
            {DOCUMENT_LABEL[language]}
            <input value={documentId} onChange={(e) => setDocumentId(e.target.value)} disabled={isSubmitting} autoFocus />
          </label>
          <label>
            {FIRST_NAME_LABEL[language]}
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={isSubmitting} />
          </label>
          <label>
            {LAST_NAME_LABEL[language]}
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={isSubmitting} />
          </label>
          {error && <p className="modal-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" onClick={closeModal} disabled={isSubmitting} className="modal-cancel">
              {CANCEL_LABEL[language]}
            </button>
            <button type="submit" disabled={isSubmitting || !documentId.trim() || !firstName.trim() || !lastName.trim()}>
              {isSubmitting ? SUBMITTING_LABEL[language] : SUBMIT_LABEL[language]}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
