import { useEffect, useState } from "react";
import { fetchConversations, fetchTrace, type ConversationSummary, type TurnTrace } from "./adminApi";
import { ConversationList } from "./ConversationList";
import { TraceViewer } from "./TraceViewer";

/** Gate simple de entrada -- `adminKey` SOLO en memoria (`useState`), NUNCA
 * `localStorage`: superficie interna sensible, se re-ingresa por sesión de
 * navegador a propósito (mismo criterio de higiene que nunca persistir un
 * `sessionToken` de cliente fuera de lo estrictamente necesario). Sin
 * `react-router` (no está instalado, una sola página admin no lo
 * justifica) -- montada directo por `main.tsx` cuando la URL es `/admin`. */
export function AdminApp() {
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [isListLoading, setIsListLoading] = useState(false);

  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [turns, setTurns] = useState<TurnTrace[]>([]);
  const [traceError, setTraceError] = useState<string | null>(null);
  const [isTraceLoading, setIsTraceLoading] = useState(false);

  useEffect(() => {
    if (!adminKey) return;
    setIsListLoading(true);
    void fetchConversations(adminKey).then((result) => {
      setIsListLoading(false);
      if (result.ok) {
        setConversations(result.value.conversations);
        setListError(null);
      } else {
        setListError(result.error);
      }
    });
  }, [adminKey]);

  function handleSelectCase(caseId: string) {
    if (!adminKey) return;
    setSelectedCaseId(caseId);
    setIsTraceLoading(true);
    setTraceError(null);
    void fetchTrace(adminKey, caseId).then((result) => {
      setIsTraceLoading(false);
      if (result.ok) {
        setTurns(result.value.turns);
      } else {
        setTraceError(result.error);
        setTurns([]);
      }
    });
  }

  async function handleSubmitKey(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = keyInput.trim();
    if (!trimmed) return;

    // Valida la key contra el endpoint real antes de "entrar" -- evita
    // mostrar el layout vacío con una key equivocada sin ningún feedback.
    const result = await fetchConversations(trimmed);
    if (!result.ok) {
      setAuthError(result.error);
      return;
    }
    setAuthError(null);
    setAdminKey(trimmed);
    setConversations(result.value.conversations);
  }

  if (!adminKey) {
    return (
      <div className="admin-gate">
        <form className="admin-gate-form" onSubmit={handleSubmitKey}>
          <h1>Dashboard de admin</h1>
          <p>Ingresá la API key (ver `terraform output -raw admin_api_key`).</p>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="API key"
            autoFocus
          />
          <button type="submit">Entrar</button>
          {authError && <p className="admin-error">{authError}</p>}
        </form>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <h1>Dashboard de admin</h1>
        <span className="admin-header-subtitle">Conversaciones reales + traza completa del pipeline</span>
      </header>
      <main className="admin-main">
        <aside className="admin-sidebar">
          {isListLoading ? (
            <p className="admin-empty-state">Cargando conversaciones...</p>
          ) : listError ? (
            <p className="admin-empty-state admin-error">{listError}</p>
          ) : (
            <ConversationList conversations={conversations} selectedCaseId={selectedCaseId} onSelect={handleSelectCase} />
          )}
        </aside>
        <section className="admin-content">
          <TraceViewer turns={turns} isLoading={isTraceLoading} error={traceError} />
        </section>
      </main>
    </div>
  );
}
