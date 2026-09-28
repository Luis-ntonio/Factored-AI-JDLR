import { AuthProvider } from "./auth/AuthContext";
import { ChatLaunchProvider } from "./chat/ChatLaunchContext";
import { AuthPanel } from "./components/AuthPanel";
import { LoginModal } from "./components/LoginModal";
import { ChatWidget } from "./components/ChatWidget";
import { ProductShowcase } from "./components/ProductShowcase";

/** Shell de nivel superior: login de PLATAFORMA (header, siempre visible,
 * independiente del chat) + vidriera de productos + widget de chat
 * minimizado. Ver `ChatWidget.tsx`/`ChatPanel.tsx` para el chat en sí,
 * `auth/AuthContext.tsx` para la sesión de identidad, `chat/
 * ChatLaunchContext.tsx` para cómo un botón "Lo quiero" de
 * `ProductShowcase.tsx` (hermano de `ChatWidget` en este árbol) abre el
 * chat con un mensaje ya definido.
 *
 * El idioma de este nivel (modal de login, vidriera) queda "es" fijo (no
 * hay conversación todavía acá para saber el idioma real) -- mismo default
 * que el resto del sistema antes del primer turno. */
function AppShell() {
  return (
    <div className="app-shell">
      <div className="app-shell-topbar">
        <AuthPanel language="es" />
      </div>
      <ProductShowcase />
      <LoginModal language="es" />
      <ChatWidget />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ChatLaunchProvider>
        <AppShell />
      </ChatLaunchProvider>
    </AuthProvider>
  );
}
