import { useState } from "react";
import { ChatPanel } from "./ChatPanel";

/**
 * Arranca MINIMIZADO (burbuja flotante) -- pedido explícito del usuario.
 * `ChatPanel` se monta recién en el primer "maximizar" (`hasOpenedOnce`) y
 * nunca se desmonta después -- minimizar/maximizar es solo CSS
 * (`chat-widget-hidden`), para no perder el `caseId`/historial al
 * pausar/resumir. Un reload de página sí desmonta todo (incluido esto),
 * que es exactamente el mecanismo que hace que "reload + reabrir" arranque
 * una conversación nueva -- ver docstring completo en `ChatPanel.tsx`.
 */
export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasOpenedOnce, setHasOpenedOnce] = useState(false);

  function handleToggle() {
    if (!isOpen) setHasOpenedOnce(true);
    setIsOpen((prev) => !prev);
  }

  return (
    <>
      {hasOpenedOnce && (
        <div className={`chat-widget-panel ${isOpen ? "" : "chat-widget-hidden"}`}>
          <ChatPanel />
        </div>
      )}
      <button className="chat-widget-bubble" onClick={handleToggle} aria-label={isOpen ? "Minimizar chat" : "Abrir chat"}>
        {isOpen ? "✕" : "💬"}
      </button>
    </>
  );
}
