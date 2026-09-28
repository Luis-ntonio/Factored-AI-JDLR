import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { LanguageCode } from "@banking-agent/shared";
import type { LoginSession } from "./api";
import { loginSession } from "./api";

const SESSION_STORAGE_KEY = "banking-agent-session";

/**
 * Sesión de IDENTIDAD (login de plataforma) -- deliberadamente SEPARADA del
 * `caseId` de la conversación (ver `ChatWidget.tsx`). Persiste en
 * localStorage a través de reloads (un login deliberado no se deshace solo
 * por refrescar la página), hasta logout explícito o que el propio token
 * expire (`expiresAt`, 30 min desde el login -- ver `packages/shared/src/
 * session-token.ts`).
 *
 * `requestLogin(onSuccess?)` abre el modal de login (reusado desde el
 * header, `AuthPanel`, Y desde el prompt inline dentro del chat cuando
 * policy-agent devuelve `askField: "session_login"`, ver `LoginPrompt.tsx`)
 * -- `onSuccess` corre DESPUÉS de un login exitoso (usado para reenviar
 * automáticamente el último mensaje pendiente).
 */
interface AuthContextValue {
  session: LoginSession | null;
  isModalOpen: boolean;
  requestLogin: (onSuccess?: (session: LoginSession) => void) => void;
  closeModal: () => void;
  login: (documentId: string, firstName: string, lastName: string, language: LanguageCode) => Promise<{ ok: boolean; error?: string }>;
  /** Aplica una sesión YA resuelta (ej. por el flujo de código OTP,
   * `verifyOtp()` en `LoginModal.tsx`) -- mismo efecto que el camino feliz
   * de `login()` (cierra el modal, dispara `pendingSuccessCallback` con la
   * sesión nueva) pero sin volver a pegarle a `/auth/login`. Dos métodos de
   * login (documento+nombre, documento+código) convergen acá en un solo
   * punto de "sesión establecida". */
  applySession: (session: LoginSession) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadPersistedSession(): LoginSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LoginSession;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) return null; // expirado -- tratado como sin sesión
    return parsed;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<LoginSession | null>(loadPersistedSession);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingSuccessCallback, setPendingSuccessCallback] = useState<((session: LoginSession) => void) | null>(null);

  useEffect(() => {
    if (session) window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(SESSION_STORAGE_KEY);
  }, [session]);

  const requestLogin = useCallback((onSuccess?: (session: LoginSession) => void) => {
    setPendingSuccessCallback(() => onSuccess ?? null);
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setPendingSuccessCallback(null);
  }, []);

  const applySession = useCallback(
    (newSession: LoginSession) => {
      setSession(newSession);
      setIsModalOpen(false);
      // Se pasa la sesión recién obtenida COMO ARGUMENTO en vez de dejar que
      // el callback lea `session` del contexto -- si leyera del contexto,
      // vería el valor viejo (null): `setSession` recién programa el
      // re-render, no lo aplica sincrónicamente, así que cualquier closure
      // creado antes de este punto (ej. `handleLoginSuccess` en
      // ChatPanel.tsx, capturado por LoginPrompt al momento del click) seguía
      // viendo la sesión anterior. Bug real encontrado en QA manual contra
      // AWS real: el mensaje se reenviaba tras el login pero sin
      // `sessionToken`, así que volvía a caer en el gate de anónimo.
      pendingSuccessCallback?.(newSession);
      setPendingSuccessCallback(null);
    },
    [pendingSuccessCallback]
  );

  const login = useCallback(
    async (documentId: string, firstName: string, lastName: string, language: LanguageCode) => {
      const result = await loginSession(documentId, firstName, lastName, language);
      if (!result.ok) return { ok: false, error: result.error };
      applySession(result.session);
      return { ok: true };
    },
    [applySession]
  );

  const logout = useCallback(() => setSession(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({ session, isModalOpen, requestLogin, closeModal, login, applySession, logout }),
    [session, isModalOpen, requestLogin, closeModal, login, applySession, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
