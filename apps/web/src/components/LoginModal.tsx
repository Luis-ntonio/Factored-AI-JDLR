import { useEffect, useRef, useState } from "react";
import type { LanguageCode } from "@banking-agent/shared";
import { useAuth } from "../auth/AuthContext";
import { verifyOtp } from "../auth/api";

const TITLE: Record<LanguageCode, string> = {
  es: "Iniciar sesión",
  pt: "Entrar",
};

const SUBTITLE_STEP1: Record<LanguageCode, string> = {
  es: "Un documento solo no prueba tu identidad -- completá también tu nombre y apellido, tal como figuran en tu cuenta. Te vamos a mandar un código de un solo uso por email para confirmar.",
  pt: "Um documento sozinho não comprova sua identidade -- preencha também seu nome e sobrenome, como constam na sua conta. Vamos te enviar um código de uso único por email para confirmar.",
};

const SUBTITLE_STEP2: Record<LanguageCode, string> = {
  es: "Te enviamos un código de 6 dígitos al email registrado con tu documento. Ingresalo para terminar de iniciar sesión.",
  pt: "Enviamos um código de 6 dígitos para o email cadastrado com seu documento. Digite-o para terminar de entrar.",
};

const DOCUMENT_LABEL: Record<LanguageCode, string> = { es: "Documento de identidad", pt: "Documento de identidade" };
const FIRST_NAME_LABEL: Record<LanguageCode, string> = { es: "Nombre", pt: "Nome" };
const LAST_NAME_LABEL: Record<LanguageCode, string> = { es: "Apellido", pt: "Sobrenome" };
const CODE_LABEL: Record<LanguageCode, string> = { es: "Código de verificación", pt: "Código de verificação" };

const CONTINUE_LABEL: Record<LanguageCode, string> = { es: "Continuar", pt: "Continuar" };
const VERIFY_LABEL: Record<LanguageCode, string> = { es: "Verificar", pt: "Verificar" };
const CANCEL_LABEL: Record<LanguageCode, string> = { es: "Cancelar", pt: "Cancelar" };
const BACK_LABEL: Record<LanguageCode, string> = { es: "Volver", pt: "Voltar" };
const SUBMITTING_LABEL: Record<LanguageCode, string> = { es: "Verificando...", pt: "Verificando..." };
const SENDING_LABEL: Record<LanguageCode, string> = { es: "Enviando...", pt: "Enviando..." };

const RESEND_LABEL: Record<LanguageCode, string> = { es: "Reenviar código", pt: "Reenviar código" };
const RESEND_COOLDOWN_LABEL: Record<LanguageCode, (s: number) => string> = {
  es: (s) => `Reenviar código (disponible en ${s}s)`,
  pt: (s) => `Reenviar código (disponível em ${s}s)`,
};

const RESEND_COOLDOWN_SECONDS = 60;

type Step = "identity" | "code";

/** Login SIEMPRE de 2 pasos desde la decisión de seguridad del usuario
 * (ver docs/STATUS.md, "Login con código por email obligatorio") --
 * documento+nombre ya NO alcanzan por sí solos, SIEMPRE hace falta además
 * el código de un solo uso. Antes este modal tenía 2 MODOS alternativos
 * (documento+nombre de un paso, o código por email de 2 pasos); ahora es
 * un único flujo secuencial de 2 pasos, sin alternativa. */
export function LoginModal({ language }: { language: LanguageCode }) {
  const { isModalOpen, closeModal, requestLoginCode, applySession } = useAuth();
  const [step, setStep] = useState<Step>("identity");

  const [documentId, setDocumentId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, []);

  function resetAll() {
    setDocumentId("");
    setFirstName("");
    setLastName("");
    setCode("");
    setStep("identity");
    setError(null);
  }

  function handleClose() {
    resetAll();
    closeModal();
  }

  function startCooldown() {
    setCooldown(RESEND_COOLDOWN_SECONDS);
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    cooldownTimerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  if (!isModalOpen) return null;

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    if (!documentId.trim() || !firstName.trim() || !lastName.trim()) return;

    setIsSubmitting(true);
    setError(null);
    const result = await requestLoginCode(documentId.trim(), firstName.trim(), lastName.trim(), language);
    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.error ?? null);
      return;
    }
    setStep("code");
    startCooldown();
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;

    setIsSubmitting(true);
    setError(null);
    const result = await verifyOtp(documentId.trim(), code.trim(), language);
    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.error ?? null);
      return;
    }
    applySession(result.session);
    resetAll();
  }

  async function handleResend() {
    if (cooldown > 0 || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    const result = await requestLoginCode(documentId.trim(), firstName.trim(), lastName.trim(), language);
    setIsSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? null);
      return;
    }
    startCooldown();
  }

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>{TITLE[language]}</h2>
        <p className="modal-subtitle">{step === "identity" ? SUBTITLE_STEP1[language] : SUBTITLE_STEP2[language]}</p>

        {step === "identity" && (
          <form onSubmit={handleRequestCode}>
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
              <button type="button" onClick={handleClose} disabled={isSubmitting} className="modal-cancel">
                {CANCEL_LABEL[language]}
              </button>
              <button type="submit" disabled={isSubmitting || !documentId.trim() || !firstName.trim() || !lastName.trim()}>
                {isSubmitting ? SENDING_LABEL[language] : CONTINUE_LABEL[language]}
              </button>
            </div>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={handleVerifyCode}>
            <label>
              {CODE_LABEL[language]}
              <input
                className="otp-code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                disabled={isSubmitting}
                inputMode="numeric"
                autoFocus
              />
            </label>
            <div className="otp-resend-row">
              <button type="button" className="otp-resend-button" onClick={handleResend} disabled={cooldown > 0 || isSubmitting}>
                {cooldown > 0 ? RESEND_COOLDOWN_LABEL[language](cooldown) : RESEND_LABEL[language]}
              </button>
            </div>
            {error && <p className="modal-error">{error}</p>}
            <div className="modal-actions">
              <button type="button" onClick={() => setStep("identity")} disabled={isSubmitting} className="modal-cancel">
                {BACK_LABEL[language]}
              </button>
              <button type="submit" disabled={isSubmitting || code.trim().length !== 6}>
                {isSubmitting ? SUBMITTING_LABEL[language] : VERIFY_LABEL[language]}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
