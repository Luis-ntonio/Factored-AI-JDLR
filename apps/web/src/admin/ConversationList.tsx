import type { ConversationSummary } from "./adminApi";

/** Panel izquierdo del dashboard de admin: lista de conversaciones reales
 * (`GET /admin/conversations`, Scan sobre `banking-agent-dev-case-store`).
 * Click selecciona -- `TraceViewer.tsx` carga la traza de esa selección. */
export function ConversationList({
  conversations,
  selectedCaseId,
  onSelect,
}: {
  conversations: ConversationSummary[];
  selectedCaseId: string | null;
  onSelect: (caseId: string) => void;
}) {
  if (conversations.length === 0) {
    return <p className="admin-empty-state">No hay conversaciones registradas todavía.</p>;
  }

  return (
    <ul className="admin-conversation-list">
      {conversations.map((c) => (
        <li key={c.caseId}>
          <button
            type="button"
            className={`admin-conversation-item${c.caseId === selectedCaseId ? " admin-conversation-item-selected" : ""}`}
            onClick={() => onSelect(c.caseId)}
          >
            <span className="admin-conversation-case-id">{c.caseId}</span>
            <span className="admin-conversation-meta">
              <span className="admin-badge">{c.lastIntent}</span>
              <span className="admin-badge admin-badge-muted">{c.lastLanguage.toUpperCase()}</span>
            </span>
            <span className="admin-conversation-meta">
              {c.customerId ?? "anónimo"} · {c.turnCount} turno(s)
            </span>
            <span className="admin-conversation-updated">{new Date(c.updatedAt).toLocaleString()}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
