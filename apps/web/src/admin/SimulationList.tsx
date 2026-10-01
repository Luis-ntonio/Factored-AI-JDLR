import {
  SIMULATION_OBJECTIVE_OPTIONS,
  SIMULATION_PROFILE_OPTIONS,
  type SimulationRunItem,
} from "./adminApi";

function labelFor(options: ReadonlyArray<{ id: string; label: string }>, id: string): string {
  return options.find((o) => o.id === id)?.label ?? id;
}

function statusBadge(run: SimulationRunItem) {
  if (run.status === "pending" || run.status === "running") {
    return <span className="admin-badge admin-badge-pending">{run.status === "pending" ? "pendiente" : "corriendo"}</span>;
  }
  if (run.status === "failed") {
    return <span className="admin-badge admin-badge-fail">error</span>;
  }
  if (run.passed) {
    return <span className="admin-badge admin-badge-pass">aprobado</span>;
  }
  return <span className="admin-badge admin-badge-fail">rechazado</span>;
}

/** Lista de corridas de simulación pasadas (`GET /admin/simulations`) --
 * click selecciona, `SimulationDetail.tsx` muestra el transcript completo.
 * Mismo criterio visual que `ConversationList.tsx` (lista con badges,
 * nunca una tabla densa -- "herramienta interna, claridad sobre
 * pulido"). */
export function SimulationList({
  runs,
  selectedRunId,
  onSelect,
}: {
  runs: SimulationRunItem[];
  selectedRunId: string | null;
  onSelect: (runId: string) => void;
}) {
  if (runs.length === 0) {
    return <p className="admin-empty-state">Todavía no se corrió ninguna simulación.</p>;
  }

  return (
    <ul className="admin-conversation-list">
      {runs.map((run) => (
        <li key={run.runId}>
          <button
            type="button"
            className={`admin-conversation-item${run.runId === selectedRunId ? " admin-conversation-item-selected" : ""}`}
            onClick={() => onSelect(run.runId)}
          >
            <span className="admin-conversation-case-id">{labelFor(SIMULATION_OBJECTIVE_OPTIONS, run.objectiveId)}</span>
            <span className="admin-conversation-meta">
              {statusBadge(run)}
              <span className="admin-badge admin-badge-muted">{labelFor(SIMULATION_PROFILE_OPTIONS, run.profileId)}</span>
            </span>
            <span className="admin-conversation-meta">{run.turns.length} turno(s)</span>
            <span className="admin-conversation-updated">{new Date(run.createdAt).toLocaleString()}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
