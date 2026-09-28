import { useEffect, useRef, useState } from "react";
import type { LanguageCode } from "@banking-agent/shared";
import { useAuth } from "../auth/AuthContext";
import { requestOtp, verifyOtp } from "../auth/api";

const TITLE: Record<LanguageCode, string> = {
  es: "Iniciar sesión",
  pt: "Entrar",
};

const SUBTITLE: Record<LanguageCode, string> = {
  es: "Un documento solo no prueba tu identidad -- completá también tu nombre y apellido, tal como figuran en tu cuenta.",
  pt: "Um documento sozinho não comprova sua identidade -- preencha também seu nome e sobrenome, como constam na sua conta.",
};

const OTP_SUBTITLE_STEP1: Record<LanguageCode, string> = {
  es: "Te enviamos un código de un solo uso al email registrado con tu documento.",
  pt: "Enviamos um código de uso único para o email cadastrado com seu documento.",
};

const OTP_SUBTITLE_STEP2: Record<LanguageCode, string> = {
  es: "Ingresá el código de 6 dígitos que te llegó por email.",
  pt: "Digite o código de 6 dígitos que você recebeu por email.",
};

const MODE_NAME_LABEL: Record<LanguageCode, string> = { es: "Documento y nombre", pt: "Documento e nome" };
const MODE_OTP_LABEL: Record<LanguageCode, string> = { es: "Código por email", pt: "Código por email" };

const DOCUMENT_LABEL: Record<LanguageCode, string> = { es: "Documento de identidad", pt: "Documento de identidade" };
const FIRST_NAME_LABEL: Record<LanguageCode, string> = { es: "Nombre", pt: "Nome" };
const LAST_NAME_LABEL: Record<LanguageCode, string> = { es: "Apellido", pt: "Sobrenome" };
const CODE_LABEL: Record<LanguageCode, string> = { es: "Código de verificación", pt: "Código de verificação" };

const SUBMIT_LABEL: Record<LanguageCode, string> = { es: "Ingresar", pt: "Entrar" };
const SEND_CODE_LABEL: Record<LanguageCode, string> = { es: "Enviar código", pt: "Enviar código" };
const VERIFY_LABEL: Record<LanguageCode, string> = { es: "Verificar", pt: "Verificar" };
const CANCEL_LABEL: Record<LanguageCode, string> = { es: "Cancelar", pt: "Cancelar" };
const SUBMITTING_LABEL: Record<LanguageCode, string> = { es: "Verificando...", pt: "Verificando..." };
const SENDING_LABEL: Record<LanguageCode, string> = { es: "Enviando...", pt: "Enviando..." };

const RESEND_LABEL: Record<LanguageCode, string> = { es: "Reenviar código", pt: "Reenviar código" };
const RESEND_COOLDOWN_LABEL: Record<LanguageCode, (s: number) => string> = {
  es: (s) => `Reenviar código (disponible en ${s}s)`,
  pt: (s) => `Reenviar código (disponível em ${s}s)`,
};

const RESEND_COOLDOWN_SECONDS = 60;

type LoginMode = "name" | "otp";
type OtpStep = "request" | "verify";

export function LoginModal({ language }: { language: LanguageCode }) {
  const { isModalOpen, closeModal, login, applySession } = useAuth();
  const [mode, setMode] = useState<LoginMode>("name");

  // Modo documento + nombre (existente)
  const [documentId, setDocumentId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  // Modo código por email
  const [otpStep, setOtpStep] = useState<OtpStep>("request");
  const [otpDocumentId, setOtpDocumentId] = useState("");
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
    setOtpDocumentId("");
    setCode("");
    setOtpStep("request");
    setError(null);
  }

  function handleClose() {
    resetAll();
    closeModal();
  }

  function switchMode(next: LoginMode) {
    setMode(next);
    setError(null);
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

  async function handleNameSubmit(e: React.FormEvent) {
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
    resetAll();
  }

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    if (!otpDocumentId.trim()) return;

    setIsSubmitting(true);
    setError(null);
    const result = await requestOtp(otpDocumentId.trim(), language);
    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOtpStep("verify");
    startCooldown();
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;

    setIsSubmitting(true);
    setError(null);
    const result = await verifyOtp(otpDocumentId.trim(), code.trim(), language);
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
    const result = await requestOtp(otpDocumentId.trim(), language);
    setIsSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    startCooldown();
  }

  const subtitle = mode === "name" ? SUBTITLE[language] : otpStep === "request" ? OTP_SUBTITLE_STEP1[language] : OTP_SUBTITLE_STEP2[language];

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>{TITLE[language]}</h2>

        <div className="login-mode-toggle">
          <button type="button" className={mode === "name" ? "active" : ""} onClick={() => switchMode("name")} disabled={isSubmitting}>
            {MODE_NAME_LABEL[language]}
          </button>
          <button type="button" className={mode === "otp" ? "active" : ""} onClick={() => switchMode("otp")} disabled={isSubmitting}>
            {MODE_OTP_LABEL[language]}
          </button>
        </div>

        <p className="modal-subtitle">{subtitle}</p>

        {mode === "name" && (
          <form onSubmit={handleNameSubmit}>
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
                {isSubmitting ? SUBMITTING_LABEL[language] : SUBMIT_LABEL[language]}
              </button>
            </div>
          </form>
        )}

        {mode === "otp" && otpStep === "request" && (
          <form onSubmit={handleRequestCode}>
            <label>
              {DOCUMENT_LABEL[language]}
              <input value={otpDocumentId} onChange={(e) => setOtpDocumentId(e.target.value)} disabled={isSubmitting} autoFocus />
            </label>
            {error && <p className="modal-error">{error}</p>}
            <div className="modal-actions">
              <button type="button" onClick={handleClose} disabled={isSubmitting} className="modal-cancel">
                {CANCEL_LABEL[language]}
              </button>
              <button type="submit" disabled={isSubmitting || !otpDocumentId.trim()}>
                {isSubmitting ? SENDING_LABEL[language] : SEND_CODE_LABEL[language]}
              </button>
            </div>
          </form>
        )}

        {mode === "otp" && otpStep === "verify" && (
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
              <button type="button" onClick={handleClose} disabled={isSubmitting} className="modal-cancel">
                {CANCEL_LABEL[language]}
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
