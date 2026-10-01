import { useEffect, useState } from "react";
import {
  createSimulation,
  fetchConversations,
  fetchSimulationRun,
  fetchSimulations,
  fetchTrace,
  type ConversationSummary,
  type SimulationRunItem,
  type TurnTrace,
} from "./adminApi";
import { ConversationList } from "./ConversationList";
import { TraceViewer } from "./TraceViewer";
import { SimulationForm } from "./SimulationForm";
import { SimulationList } from "./SimulationList";
import { SimulationDetail } from "./SimulationDetail";

/** Mientras una corrida está pending/running, se refresca sola cada 3s
 * (la simulación real corre async en el worker, hasta 6 turnos reales
 * contra el pipeline desplegado -- ver `services/admin-agent/src/
 * simulation/run-simulation.ts`). Se corta solo al llegar a un estado
 * terminal (completed/failed), nunca un polling indefinido. */
const SIMULATION_POLL_MS = 3000;

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

  const [tab, setTab] = useState<"conversations" | "simulations">("conversations");
  const [simulations, setSimulations] = useState<SimulationRunItem[]>([]);
  const [simulationsError, setSimulationsError] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<SimulationRunItem | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [isRunLoading, setIsRunLoading] = useState(false);
  const [isCreatingRun, setIsCreatingRun] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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

  function loadSimulations() {
    if (!adminKey) return;
    void fetchSimulations(adminKey).then((result) => {
      if (result.ok) {
        setSimulations(result.value.runs);
        setSimulationsError(null);
      } else {
        setSimulationsError(result.error);
      }
    });
  }

  useEffect(() => {
    if (!adminKey || tab !== "simulations") return;
    loadSimulations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey, tab]);

  function handleSelectRun(runId: string) {
    if (!adminKey) return;
    setSelectedRunId(runId);
    setIsRunLoading(true);
    setRunError(null);
    void fetchSimulationRun(adminKey, runId).then((result) => {
      setIsRunLoading(false);
      if (result.ok) {
        setSelectedRun(result.value.run);
      } else {
        setRunError(result.error);
        setSelectedRun(null);
      }
    });
  }

  // Mientras la corrida seleccionada está pending/running, refresca sola
  // (ver SIMULATION_POLL_MS) -- corta al llegar a un estado terminal.
  useEffect(() => {
    if (!adminKey || !selectedRunId) return;
    if (selectedRun && (selectedRun.status === "completed" || selectedRun.status === "failed")) return;

    const timer = setTimeout(() => {
      void fetchSimulationRun(adminKey, selectedRunId).then((result) => {
        if (result.ok) {
          setSelectedRun(result.value.run);
          if (result.value.run.status === "completed" || result.value.run.status === "failed") loadSimulations();
        }
      });
    }, SIMULATION_POLL_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey, selectedRunId, selectedRun]);

  function handleCreateSimulation(profileId: string, objectiveId: string) {
    if (!adminKey) return;
    setIsCreatingRun(true);
    setCreateError(null);
    void createSimulation(adminKey, profileId, objectiveId).then((result) => {
      setIsCreatingRun(false);
      if (result.ok) {
        loadSimulations();
        handleSelectRun(result.value.runId);
      } else {
        setCreateError(result.error);
      }
    });
  }

  function handleViewTrace(caseId: string) {
    setTab("conversations");
    handleSelectCase(caseId);
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
        <nav className="admin-tabs">
          <button
            type="button"
            className={`admin-tab${tab === "conversations" ? " admin-tab-active" : ""}`}
            onClick={() => setTab("conversations")}
          >
            Conversaciones
          </button>
          <button
            type="button"
            className={`admin-tab${tab === "simulations" ? " admin-tab-active" : ""}`}
            onClick={() => setTab("simulations")}
          >
            Simulaciones
          </button>
        </nav>
      </header>
      {tab === "conversations" ? (
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
      ) : (
        <main className="admin-main">
          <aside className="admin-sidebar">
            <SimulationForm onSubmit={handleCreateSimulation} isSubmitting={isCreatingRun} error={createError} />
            {simulationsError ? (
              <p className="admin-empty-state admin-error">{simulationsError}</p>
            ) : (
              <SimulationList runs={simulations} selectedRunId={selectedRunId} onSelect={handleSelectRun} />
            )}
          </aside>
          <section className="admin-content">
            <SimulationDetail run={selectedRun} isLoading={isRunLoading} error={runError} onViewTrace={handleViewTrace} />
          </section>
        </main>
      )}
    </div>
  );
}
