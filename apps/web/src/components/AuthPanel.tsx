import type { LanguageCode } from "@banking-agent/shared";
import { useAuth } from "../auth/AuthContext";

const LOGIN_BUTTON: Record<LanguageCode, string> = { es: "Iniciar sesión", pt: "Entrar" };
const LOGOUT_BUTTON: Record<LanguageCode, string> = { es: "Cerrar sesión", pt: "Sair" };
const GREETING: Record<LanguageCode, (name: string) => string> = {
  es: (name) => `Hola, ${name}`,
  pt: (name) => `Olá, ${name}`,
};
const ROLE_LABEL: Record<LanguageCode, Record<"cliente" | "cliente_estrella", string>> = {
  es: { cliente: "Cliente", cliente_estrella: "Cliente estrella" },
  pt: { cliente: "Cliente", cliente_estrella: "Cliente estrela" },
};

/** Login de PLATAFORMA -- siempre visible en el header, independiente de si
 * el chat (`ChatWidget`) está abierto o minimizado. Identifica el rol de
 * sesión que se usa en cada turno del chat (ver `apps/web/src/api.ts`,
 * `sendChatMessage`). */
export function AuthPanel({ language }: { language: LanguageCode }) {
  const { session, requestLogin, logout } = useAuth();

  if (!session) {
    return (
      <button className="auth-panel-login" onClick={() => requestLogin()}>
        {LOGIN_BUTTON[language]}
      </button>
    );
  }

  return (
    <div className="auth-panel-session">
      <span className="auth-panel-greeting">
        {GREETING[language](session.customerName)}
        <span className={`role-badge role-badge-${session.role}`}>{ROLE_LABEL[language][session.role]}</span>
      </span>
      <button className="auth-panel-logout" onClick={logout}>
        {LOGOUT_BUTTON[language]}
      </button>
    </div>
  );
}
