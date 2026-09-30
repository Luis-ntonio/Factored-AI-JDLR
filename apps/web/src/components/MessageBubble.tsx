import type { LanguageCode } from "@banking-agent/shared";
import type { ChatMessage } from "../types";
import type { LoginSession } from "../auth/api";
import { BotResponse } from "./BotResponse";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MessageBubble({
  message,
  currentLanguage,
  onLoginSuccess,
  onSelectDisputeCandidate,
}: {
  message: ChatMessage;
  currentLanguage: LanguageCode;
  onLoginSuccess: (session: LoginSession) => void;
  onSelectDisputeCandidate: (candidate: { transactionId: string; merchant: string | null }) => void;
}) {
  const isUser = message.role === "user";

  if (message.systemNotice) {
    return (
      <div className="message-row message-row-system">
        <div className="system-notice">{message.systemNotice}</div>
      </div>
    );
  }

  return (
    <div className={`message-row ${isUser ? "message-row-user" : "message-row-bot"}`}>
      <div className={`bubble ${isUser ? "bubble-user" : "bubble-bot"}`}>
        {isUser && <p className="bot-text">{message.text}</p>}
        {!isUser && message.response && (
          <BotResponse
            response={message.response}
            fallbackLanguage={currentLanguage}
            onLoginSuccess={onLoginSuccess}
            onSelectDisputeCandidate={onSelectDisputeCandidate}
          />
        )}
        {!isUser && message.clientError && (
          <div className="info-card error-card">
            <p className="bot-text">{message.clientError}</p>
          </div>
        )}
        <span className="timestamp">{formatTime(message.timestamp)}</span>
      </div>
    </div>
  );
}
