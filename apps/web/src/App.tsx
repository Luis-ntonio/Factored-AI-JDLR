import { AuthProvider } from "./auth/AuthContext";
import { AuthPanel } from "./components/AuthPanel";
import { LoginModal } from "./components/LoginModal";
import { ChatWidget } from "./components/ChatWidget";

/** Shell de nivel superior: login de PLATAFORMA (header, siempre visible,
 * independiente del chat) + widget de chat minimizado. Ver
 * `ChatWidget.tsx`/`ChatPanel.tsx` para el chat en sí, `auth/AuthContext.tsx`
 * para la sesión de identidad.
 *
 * El idioma del modal de login queda "es" fijo (no hay conversación
 * todavía en este nivel para saber el idioma real) -- mismo default que el
 * resto del sistema antes del primer turno. */
function AppShell() {
  return (
    <div className="app-shell">
      <div className="app-shell-topbar">
        <AuthPanel language="es" />
      </div>
      <LoginModal language="es" />
      <ChatWidget />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
