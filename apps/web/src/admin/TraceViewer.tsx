import { useState } from "react";
import type { TraceStep, TurnTrace } from "./adminApi";

/** Un paso individual del pipeline (Understand/Decide/RouteByDecision/
 * Act.../Verify/PostActionDecide/Respond.../Escalate...) -- colapsado por
 * default, expandible para ver el input/output JSON completo (el
 * "pensamiento interno": `modelProposal.reasoning` de Bedrock,
 * `matchedRules`/`winningRuleId`/`reason` de policy-agent, etc. ya vienen
 * tal cual en ese JSON, sin transformar). */
function StepRow({ step }: { step: TraceStep }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="admin-trace-step">
      <button type="button" className="admin-trace-step-header" onClick={() => setExpanded((v) => !v)}>
        <span className="admin-trace-step-name">{step.name}</span>
        <span className="admin-badge admin-badge-muted">{step.stateType}</span>
        <span className="admin-trace-step-duration">
          {step.durationMs !== null ? `${step.durationMs}ms` : "—"}
        </span>
        <span className="admin-trace-step-toggle">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <div className="admin-trace-step-detail">
          <div>
            <h4>Input</h4>
            <pre>{JSON.stringify(step.input, null, 2)}</pre>
          </div>
          <div>
            <h4>Output</h4>
            <pre>{JSON.stringify(step.output, null, 2)}</pre>
          </div>
        </div>
      )}
    </li>
  );
}

function TurnCard({ turn }: { turn: TurnTrace }) {
  return (
    <div className="admin-turn-card">
      <div className="admin-turn-header">
        <span className="admin-turn-message">{turn.userMessage ?? "(sin mensaje de usuario)"}</span>
        <span className="admin-turn-timestamp">{turn.startedAt ? new Date(turn.startedAt).toLocaleString() : ""}</span>
      </div>
      <ul className="admin-trace-steps">
        {turn.steps.map((step, idx) => (
          <StepRow key={`${step.name}-${idx}`} step={step} />
        ))}
      </ul>
    </div>
  );
}

/** Panel derecho del dashboard de admin: traza completa de la conversación
 * seleccionada, reconstruida de los logs REALES de CloudWatch de la Step
 * Function (ver `services/admin-agent/src/get-trace.ts`) -- un turno por
 * ejecución real, pasos en orden con duración calculada. */
export function TraceViewer({ turns, isLoading, error }: { turns: TurnTrace[]; isLoading: boolean; error: string | null }) {
  if (isLoading) return <p className="admin-empty-state">Cargando traza...</p>;
  if (error) return <p className="admin-empty-state admin-error">{error}</p>;
  if (turns.length === 0) return <p className="admin-empty-state">Elegí una conversación de la lista.</p>;

  return (
    <div className="admin-trace-viewer">
      {turns.map((turn) => (
        <TurnCard key={turn.executionArn} turn={turn} />
      ))}
    </div>
  );
}
