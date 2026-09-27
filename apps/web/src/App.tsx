import { useEffect, useRef, useState } from "react";
import type { LanguageCode } from "@banking-agent/shared";
import type { ChatMessage } from "./types";
import { sendChatMessage } from "./api";
import { MessageBubble } from "./components/MessageBubble";
import { LanguageBadge } from "./components/LanguageBadge";

const CASE_ID_STORAGE_KEY = "banking-agent-case-id";

const ESCALATED_BANNER_TEXT: Record<LanguageCode, string> = {
  es: "Esta conversación fue transferida a un asesor humano. Podés seguir escribiendo, pero un humano continuará el caso.",
  pt: "Esta conversa foi encaminhada para um atendente humano. Você pode continuar escrevendo, mas um atendente humano vai dar continuidade ao caso.",
};

const EMPTY_STATE_TEXT: Record<LanguageCode, string> = {
  es: "Escribí tu consulta sobre productos de crédito (tarjetas, préstamos, hipotecas) para empezar.",
  pt: "Digite sua dúvida sobre produtos de crédito (cartões, empréstimos, financiamentos) para começar.",
};

const PROCESSING_TEXT: Record<LanguageCode, string> = {
  es: "Procesando...",
  pt: "Processando...",
};

const MESSAGE_PLACEHOLDER: Record<LanguageCode, string> = {
  es: "Escribe tu mensaje...",
  pt: "Digite sua mensagem...",
};

const MESSAGE_ARIA_LABEL: Record<LanguageCode, string> = {
  es: "Mensaje",
  pt: "Mensagem",
};

const SEND_BUTTON_TEXT: Record<LanguageCode, string> = {
  es: "Enviar",
  pt: "Enviar",
};

/** `caseId` generado UNA VEZ por sesión de navegador y reusado en todos los
 * turnos (identifica el estado conversacional en DynamoDB del backend). */
function getOrCreateCaseId(): string {
  const existing = window.localStorage.getItem(CASE_ID_STORAGE_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(CASE_ID_STORAGE_KEY, created);
  return created;
}

export default function App() {
  const [caseId] = useState<string>(getOrCreateCaseId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState<LanguageCode | null>(null);
  const [isEscalated, setIsEscalated] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  // Antes del primer turno no se sabe el idioma real (lo detecta el
  // backend) -- se usa español como default de la UI, consistente con el
  // resto del sistema (policies.yaml, catálogo, etc. también asumen ES
  // como idioma base). Apenas llega la primera respuesta, la UI entera
  // (banner, placeholder, empty-state, botón) sigue a `currentLanguage`.
  const lang: LanguageCode = currentLanguage ?? "es";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    const turnId = crypto.randomUUID();
    const userMessage: ChatMessage = {
      id: turnId,
      role: "user",
      timestamp: Date.now(),
      text: trimmed,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsSending(true);

    const result = await sendChatMessage(caseId, turnId, trimmed, lang);

    if (result.ok) {
      if (result.data.status !== "unavailable" && result.data.language) {
        setCurrentLanguage(result.data.language);
      }
      if (result.data.status === "escalate") {
        setIsEscalated(true);
      }
      const botMessage: ChatMessage = {
        id: `${turnId}-response`,
        role: "bot",
        timestamp: Date.now(),
        response: result.data,
      };
      setMessages((prev) => [...prev, botMessage]);
    } else {
      const errorMessage: ChatMessage = {
        id: `${turnId}-error`,
        role: "bot",
        timestamp: Date.now(),
        clientError: result.error,
      };
      setMessages((prev) => [...prev, errorMessage]);
    }

    setIsSending(false);
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
        </div>
      </header>

      {isEscalated && <div className="escalated-banner">{ESCALATED_BANNER_TEXT[lang]}</div>}

      <main className="chat-history">
        {messages.length === 0 && <p className="empty-state">{EMPTY_STATE_TEXT[lang]}</p>}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} currentLanguage={lang} />
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
