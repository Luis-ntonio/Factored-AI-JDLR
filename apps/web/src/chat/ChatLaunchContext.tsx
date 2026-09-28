import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

/**
 * Señal de "abrir el chat y mandar este mensaje ya" -- puente entre la
 * vidriera de productos (`ProductShowcase.tsx`, vive en el árbol de
 * `AppShell`, hermano de `ChatWidget`) y `ChatPanel.tsx` (nieto de
 * `ChatWidget`, mantiene su propio estado de mensajes/caseId). Un Context
 * es la forma más simple de cruzar esa distancia sin prop-drilling a través
 * de `ChatWidget`, que no necesita saber nada sobre el contenido del
 * mensaje.
 *
 * `token` (no solo el texto) existe para que un segundo click en OTRO
 * botón "Lo quiero" con el MISMO texto (poco probable pero posible) todavía
 * dispare un nuevo efecto en los consumidores -- React no re-ejecuta un
 * efecto si la dependencia es un string idéntico al anterior.
 */
export interface ChatLaunchRequest {
  message: string;
  token: number;
}

interface ChatLaunchContextValue {
  request: ChatLaunchRequest | null;
  requestOpenWithMessage: (message: string) => void;
  clearRequest: () => void;
}

const ChatLaunchContext = createContext<ChatLaunchContextValue | null>(null);

export function ChatLaunchProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ChatLaunchRequest | null>(null);

  const requestOpenWithMessage = useCallback((message: string) => {
    setRequest({ message, token: Date.now() });
  }, []);

  const clearRequest = useCallback(() => setRequest(null), []);

  const value = useMemo<ChatLaunchContextValue>(
    () => ({ request, requestOpenWithMessage, clearRequest }),
    [request, requestOpenWithMessage, clearRequest]
  );

  return <ChatLaunchContext.Provider value={value}>{children}</ChatLaunchContext.Provider>;
}

export function useChatLaunch(): ChatLaunchContextValue {
  const ctx = useContext(ChatLaunchContext);
  if (!ctx) throw new Error("useChatLaunch debe usarse dentro de <ChatLaunchProvider>");
  return ctx;
}
