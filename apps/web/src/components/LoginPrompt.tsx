import type { LanguageCode } from "@banking-agent/shared";
import { useAuth } from "../auth/AuthContext";
import type { LoginSession } from "../auth/api";

const MESSAGE: Record<LanguageCode, string> = {
  es: "Para continuar con esto necesitamos verificar tu identidad.",
  pt: "Para continuar com isso precisamos verificar sua identidade.",
};

const BUTTON: Record<LanguageCode, string> = {
  es: "Iniciar sesión",
  pt: "Entrar",
};

/** Se muestra cuando `policyDecision.askField === "session_login"` (ver
 * `policies.yaml`, `clarify-anonymous-requires-login`) -- reusa el MISMO
 * modal de login del header (`AuthPanel`/`LoginModal`), nunca un form
 * duplicado. `onLoginSuccess` reenvía automáticamente el último mensaje del
 * usuario tras un login exitoso (mejor UX que pedirle que lo retipee) --
 * pasado desde `App.tsx`, que es quien tiene el mensaje pendiente. */
export function LoginPrompt({
  language,
  onLoginSuccess,
}: {
  language: LanguageCode;
  onLoginSuccess: (session: LoginSession) => void;
}) {
  const { requestLogin } = useAuth();
  return (
    <div className="info-card login-prompt-card">
      <p className="bot-text">{MESSAGE[language]}</p>
      <button onClick={() => requestLogin(onLoginSuccess)}>{BUTTON[language]}</button>
    </div>
  );
}
