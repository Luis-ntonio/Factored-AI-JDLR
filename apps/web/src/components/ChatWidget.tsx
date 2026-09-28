import { useEffect, useState } from "react";
import { ChatPanel } from "./ChatPanel";
import { useChatLaunch } from "../chat/ChatLaunchContext";

/**
 * Arranca MINIMIZADO (burbuja flotante) -- pedido explícito del usuario.
 * `ChatPanel` se monta recién en el primer "maximizar" (`hasOpenedOnce`) y
 * nunca se desmonta después -- minimizar/maximizar es solo CSS
 * (`chat-widget-hidden`), para no perder el `caseId`/historial al
 * pausar/resumir. Un reload de página sí desmonta todo (incluido esto),
 * que es exactamente el mecanismo que hace que "reload + reabrir" arranque
 * una conversación nueva -- ver docstring completo en `ChatPanel.tsx`.
 *
 * También reacciona a `useChatLaunch()` (ver `chat/ChatLaunchContext.tsx`):
 * un botón "Lo quiero" de `ProductShowcase.tsx` pide abrir el chat con un
 * mensaje ya definido -- este componente solo se encarga de la apertura
 * (montar/mostrar el panel); `ChatPanel.tsx` es quien realmente envía el
 * mensaje una vez montado.
 */
export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasOpenedOnce, setHasOpenedOnce] = useState(false);
  const { request } = useChatLaunch();

  useEffect(() => {
    if (request) {
      setHasOpenedOnce(true);
      setIsOpen(true);
    }
  }, [request]);

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
