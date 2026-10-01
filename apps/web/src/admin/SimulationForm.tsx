import { useState } from "react";
import { SIMULATION_OBJECTIVE_OPTIONS, SIMULATION_PROFILE_OPTIONS } from "./adminApi";

/** Formulario para disparar una simulación nueva -- perfil + objetivo del
 * catálogo FIJO (mismo catálogo que `services/admin-agent/src/simulation/
 * {profiles,objectives}.ts`, ver comentario en `adminApi.ts`). El backend
 * responde de inmediato con un `runId` (el trabajo real corre async, ver
 * `services/admin-agent/src/simulation/run-simulation.ts`) -- `onCreated`
 * deja que `AdminApp.tsx` empiece a hacer polling de esa corrida. */
export function SimulationForm({
  onSubmit,
  isSubmitting,
  error,
}: {
  onSubmit: (profileId: string, objectiveId: string) => void;
  isSubmitting: boolean;
  error: string | null;
}) {
  const [profileId, setProfileId] = useState<string>(SIMULATION_PROFILE_OPTIONS[0].id);
  const [objectiveId, setObjectiveId] = useState<string>(SIMULATION_OBJECTIVE_OPTIONS[0].id);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(profileId, objectiveId);
  }

  return (
    <form className="admin-sim-form" onSubmit={handleSubmit}>
      <h2>Nueva simulación</h2>
      <label className="admin-sim-field">
        <span>Perfil</span>
        <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
          {SIMULATION_PROFILE_OPTIONS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="admin-sim-field">
        <span>Objetivo</span>
        <select value={objectiveId} onChange={(e) => setObjectiveId(e.target.value)}>
          {SIMULATION_OBJECTIVE_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Ejecutando..." : "Ejecutar simulación"}
      </button>
      {error && <p className="admin-error">{error}</p>}
    </form>
  );
}
