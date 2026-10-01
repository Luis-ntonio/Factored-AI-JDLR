import {
  SIMULATION_OBJECTIVE_OPTIONS,
  SIMULATION_PROFILE_OPTIONS,
  type SimulationRunItem,
  type SimulationTurnRecord,
} from "./adminApi";

function labelFor(options: ReadonlyArray<{ id: string; label: string }>, id: string): string {
  return options.find((o) => o.id === id)?.label ?? id;
}

function TurnRow({ turn, index }: { turn: SimulationTurnRecord; index: number }) {
  return (
    <li className="admin-sim-turn">
      <span className="admin-sim-turn-index">#{index + 1}</span>
      <span className="admin-sim-turn-message">{turn.userMessage}</span>
      <span className={`admin-badge admin-sim-status-${turn.status}`}>{turn.status}</span>
    </li>
  );
}

/** Panel de detalle de una corrida de simulación: transcript turno a turno
 * (mensaje del cliente SINTÉTICO + status real devuelto por el bot) + el
 * veredicto final (estructural: `finalStatus === expectedStatus`, NUNCA
 * otro LLM opinando -- ver `services/admin-agent/src/simulation/
 * run-simulation.ts`). Todos los turnos de una corrida comparten el MISMO
 * `caseId` (`sim-<runId>`) -- un único link navega a la traza real
 * completa en la vista de Conversaciones (`TraceViewer.tsx`), reusada tal
 * cual, nunca duplicada acá. */
export function SimulationDetail({
  run,
  isLoading,
  error,
  onViewTrace,
}: {
  run: SimulationRunItem | null;
  isLoading: boolean;
  error: string | null;
  onViewTrace: (caseId: string) => void;
}) {
  if (isLoading) return <p className="admin-empty-state">Cargando corrida...</p>;
  if (error) return <p className="admin-empty-state admin-error">{error}</p>;
  if (!run) return <p className="admin-empty-state">Elegí una corrida de la lista, o lanzá una nueva arriba.</p>;

  const caseId = run.turns[0]?.caseId;
  const isTerminal = run.status === "completed" || run.status === "failed";

  return (
    <div className="admin-sim-detail">
      <div className="admin-turn-header">
        <span className="admin-turn-message">
          {labelFor(SIMULATION_PROFILE_OPTIONS, run.profileId)} -- {labelFor(SIMULATION_OBJECTIVE_OPTIONS, run.objectiveId)}
        </span>
        {isTerminal && run.status === "completed" && (
          <span className={`admin-badge ${run.passed ? "admin-badge-pass" : "admin-badge-fail"}`}>
            {run.passed ? "aprobado" : "rechazado"}
          </span>
        )}
        {run.status === "failed" && <span className="admin-badge admin-badge-fail">error</span>}
        {!isTerminal && (
          <span className="admin-badge admin-badge-pending">{run.status === "pending" ? "pendiente" : "corriendo"}</span>
        )}
      </div>

      {run.status === "failed" && run.error && <p className="admin-error">{run.error}</p>}

      {isTerminal && (
        <p className="admin-sim-expected">
          Esperado: <strong>{run.expectedStatus}</strong> -- Final: <strong>{run.finalStatus ?? "—"}</strong>
        </p>
      )}

      <ul className="admin-sim-turns">
        {run.turns.map((turn, idx) => (
          <TurnRow key={turn.turnId} turn={turn} index={idx} />
        ))}
      </ul>

      {!isTerminal && <p className="admin-empty-state">Corriendo... esta vista se actualiza sola.</p>}

      {caseId && (
        <button type="button" className="admin-sim-view-trace" onClick={() => onViewTrace(caseId)}>
          Ver traza real completa ({caseId})
        </button>
      )}
    </div>
  );
}
