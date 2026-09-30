import { useCallback, useEffect, useRef, useState } from "react";
import type { LanguageCode } from "@banking-agent/shared";
import type { ChatMessage } from "../types";
import { sendChatMessage } from "../api";
import { useAuth } from "../auth/AuthContext";
import type { LoginSession } from "../auth/api";
import { getOrCreateDeviceSessionId } from "../utils/cookies";
import { useChatLaunch } from "../chat/ChatLaunchContext";
import { MessageBubble } from "./MessageBubble";
import { LanguageBadge } from "./LanguageBadge";

/** 5 minutos de inactividad (sin mensaje enviado NI recibido) cierran la
 * conversación -- NO es una expiración fija de sesión (eso es el
 * sessionToken de auth, 30 min, ver packages/shared/src/session-token.ts),
 * es específicamente inactividad del CHAT. Deliberadamente lógica de
 * frontend only -- el backend no necesita saber que una conversación "se
 * cerró", cada `caseId` ya es independiente en DynamoDB (ver docstring
 * completo del ciclo de vida de `caseId` más abajo). */
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;

const ESCALATED_BANNER_TEXT: Record<LanguageCode, string> = {
  es: "Esta conversación fue transferida a un asesor humano. Podés seguir escribiendo, pero un humano continuará el caso.",
  pt: "Esta conversa foi encaminhada para um atendente humano. Você pode continuar escrevendo, mas um atendente humano vai dar continuidade ao caso.",
};

const EMPTY_STATE_TEXT: Record<LanguageCode, string> = {
  es: "Escribí tu consulta sobre productos de crédito o una disputa de cargo para empezar.",
  pt: "Digite sua dúvida sobre produtos de crédito ou uma disputa de cobrança para começar.",
};

const PROCESSING_TEXT: Record<LanguageCode, string> = { es: "Procesando...", pt: "Processando..." };
const MESSAGE_PLACEHOLDER: Record<LanguageCode, string> = { es: "Escribe tu mensaje...", pt: "Digite sua mensagem..." };
const MESSAGE_ARIA_LABEL: Record<LanguageCode, string> = { es: "Mensaje", pt: "Mensagem" };
const SEND_BUTTON_TEXT: Record<LanguageCode, string> = { es: "Enviar", pt: "Enviar" };
const NEW_CONVERSATION_BUTTON: Record<LanguageCode, string> = { es: "Nueva conversación", pt: "Nova conversa" };
const INACTIVITY_NOTICE: Record<LanguageCode, string> = {
  es: "Tu sesión de chat se cerró por inactividad. Escribí un mensaje para empezar una conversación nueva.",
  pt: "Sua sessão de chat foi encerrada por inatividade. Escreva uma mensagem para começar uma conversa nova.",
};

/** Aviso distinto de "sesión (de IDENTIDAD) expirada" -- NO confundir con
 * INACTIVITY_NOTICE de arriba (esa es la sesión de CHAT, 5 min, nada que
 * ver con el login). Cierra el gap documentado en docs/
 * EVALUATION-CRITERIA.md (Security, punto 5): antes, un sessionToken
 * vencido en medio de una conversación activa se degradaba a anónimo en
 * silencio -- el usuario veía el mismo prompt de login genérico que si
 * nunca hubiera iniciado sesión, sin saber que hace un momento SÍ estaba
 * identificado. Ver chequeo en sendMessage() más abajo. */
const SESSION_EXPIRED_NOTICE: Record<LanguageCode, string> = {
  es: "Tu sesión expiró. Iniciá sesión de nuevo para continuar donde quedaste.",
  pt: "Sua sessão expirou. Faça login novamente para continuar de onde parou.",
};

/**
 * Panel de chat real -- montado UNA VEZ por apertura del widget
 * (`ChatWidget.tsx`, nunca desmontado al minimizar, solo ocultado por CSS,
 * para no perder el estado al pausar/resumir). Un reload de página
 * desmonta TODO el árbol de React, incluido este componente -- por eso el
 * ciclo de vida de `caseId` acá abajo (deliberadamente en memoria, nunca
 * persistido en localStorage/sessionStorage/cookie) ya resuelve solo "reload
 * + reabrir el chat = conversación nueva", sin lógica adicional.
 *
 * Tres formas de terminar la conversación ACTUAL (todas generan un
 * `caseId` nuevo para el próximo mensaje, nunca reintentan destruir nada
 * del lado del backend -- cada `caseId` es independiente en DynamoDB):
 *  1. Inactividad de 5 min (`INACTIVITY_TIMEOUT_MS`) -- agrega un aviso de
 *     sistema al historial visible, el usuario puede seguir viendo la
 *     conversación vieja, el PRÓXIMO mensaje ya usa un `caseId` nuevo.
 *  2. Botón explícito "Nueva conversación" -- mismo mecanismo, pero además
 *     limpia el historial visible (a diferencia de la inactividad).
 *  3. Reload de página (implícito, ver arriba).
 */
export function ChatPanel() {
  const { session, logout } = useAuth();
  const { request: launchRequest, clearRequest: clearLaunchRequest } = useChatLaunch();
  const [caseId, setCaseId] = useState<string>(() => crypto.randomUUID());
  const [chatOpenedAt, setChatOpenedAt] = useState<string>(() => new Date().toISOString());
  const deviceSessionIdRef = useRef<string>(getOrCreateDeviceSessionId());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState<LanguageCode | null>(null);
  const [isEscalated, setIsEscalated] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lang: LanguageCode = currentLanguage ?? "es";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const startNewConversation = useCallback((clearHistory: boolean) => {
    setCaseId(crypto.randomUUID());
    setChatOpenedAt(new Date().toISOString());
    setIsEscalated(false);
    if (clearHistory) setMessages([]);
  }, []);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { id: `system-${Date.now()}`, role: "bot", timestamp: Date.now(), systemNotice: INACTIVITY_NOTICE[lang] },
      ]);
      startNewConversation(false);
    }, INACTIVITY_TIMEOUT_MS);
  }, [lang, startNewConversation]);

  useEffect(() => {
    resetInactivityTimer();
    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Un botón "Lo quiero" de ProductShowcase.tsx pidió abrir el chat con un
  // mensaje ya definido (ver chat/ChatLaunchContext.tsx) -- se dispara tanto
  // en el primer montaje de este panel (primer click, ChatWidget recién lo
  // montó) como en cualquier click posterior mientras el panel ya está
  // montado (el usuario elige OTRO producto con el chat abierto). Se limpia
  // el pedido enseguida para no reenviarlo en un re-render no relacionado.
  useEffect(() => {
    if (launchRequest) {
      void sendMessage(launchRequest.message);
      clearLaunchRequest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchRequest]);

  // `sessionTokenOverride`: usado exclusivamente por `handleLoginSuccess`
  // (reenvío automático post-login) -- ese callback recibe la sesión recién
  // obtenida como ARGUMENTO en vez de leer `session` del closure, que en ese
  // momento todavía sería el valor viejo (null). Ver docstring en
  // `AuthContext.tsx`/`login()`.
  async function sendMessage(text: string, sessionTokenOverride?: string) {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    resetInactivityTimer();

    // Sesión de IDENTIDAD vencida en memoria (sin override explícito de un
    // login recién hecho) -- `session` puede seguir siendo un objeto
    // "verdadero" en React aunque su `expiresAt` ya haya pasado, porque
    // nada lo invalida durante una conversación activa sin reload (a
    // diferencia de `loadPersistedSession()` en AuthContext.tsx, que solo
    // corre al montar). Se detecta y avisa ACÁ, el único lugar donde
    // `session?.token` se usa para construir el request -- ver docstring
    // de SESSION_EXPIRED_NOTICE arriba.
    let effectiveSessionToken = sessionTokenOverride ?? session?.token;
    if (!sessionTokenOverride && session && new Date(session.expiresAt).getTime() <= Date.now()) {
      effectiveSessionToken = undefined;
      logout();
      setMessages((prev) => [
        ...prev,
        { id: `system-${Date.now()}`, role: "bot", timestamp: Date.now(), systemNotice: SESSION_EXPIRED_NOTICE[lang] },
      ]);
    }

    const turnId = crypto.randomUUID();
    const userMessage: ChatMessage = { id: turnId, role: "user", timestamp: Date.now(), text: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setIsSending(true);

    const result = await sendChatMessage(caseId, turnId, trimmed, lang, {
      sessionToken: effectiveSessionToken,
      deviceSessionId: deviceSessionIdRef.current,
      chatOpenedAt,
    });
    resetInactivityTimer();

    if (result.ok) {
      if (result.data.status !== "unavailable" && result.data.language) setCurrentLanguage(result.data.language);
      if (result.data.status === "escalate") setIsEscalated(true);
      setMessages((prev) => [...prev, { id: `${turnId}-response`, role: "bot", timestamp: Date.now(), response: result.data }]);
    } else {
      setMessages((prev) => [...prev, { id: `${turnId}-error`, role: "bot", timestamp: Date.now(), clientError: result.error }]);
    }

    setIsSending(false);
  }

  async function handleSend() {
    const text = input;
    setInput("");
    await sendMessage(text);
  }

  // Reenvía el último mensaje del usuario automáticamente tras un login
  // exitoso (ver LoginPrompt.tsx) -- mejor UX que pedirle que lo retipee.
  // Recibe la sesión nueva como argumento (no lee `session` del closure) y
  // se la pasa a `sendMessage` explícitamente -- ver docstring en
  // `AuthContext.tsx`/`login()`.
  function handleLoginSuccess(newSession: LoginSession) {
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")?.text;
    if (lastUserMessage) void sendMessage(lastUserMessage, newSession.token);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <div className="chat-app">
      <header className="chat-header">
        <div>
          <h1>AI-First Banking Agent</h1>
          <span className="case-id">Caso: {caseId}</span>
        </div>
        <div className="header-right">
          {currentLanguage && <LanguageBadge language={currentLanguage} />}
          <button className="new-conversation-button" onClick={() => startNewConversation(true)} title={NEW_CONVERSATION_BUTTON[lang]}>
            {NEW_CONVERSATION_BUTTON[lang]}
          </button>
        </div>
      </header>

      {isEscalated && <div className="escalated-banner">{ESCALATED_BANNER_TEXT[lang]}</div>}

      <main className="chat-history">
        {messages.length === 0 && <p className="empty-state">{EMPTY_STATE_TEXT[lang]}</p>}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} currentLanguage={lang} onLoginSuccess={handleLoginSuccess} />
        ))}
        {isSending && (
          <div className="message-row message-row-bot">
            <div className="bubble bubble-bot bubble-loading">{PROCESSING_TEXT[lang]}</div>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <footer className="chat-input-bar">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={MESSAGE_PLACEHOLDER[lang]}
          disabled={isSending}
          aria-label={MESSAGE_ARIA_LABEL[lang]}
        />
        <button onClick={() => void handleSend()} disabled={isSending || !input.trim()}>
          {SEND_BUTTON_TEXT[lang]}
        </button>
      </footer>
    </div>
  );
}
