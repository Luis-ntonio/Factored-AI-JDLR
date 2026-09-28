/** Helpers mínimos de cookie (sin librería) -- usado SOLO para
 * `deviceSessionId` (ver `ChatWidget.tsx`), un identificador estable por
 * dispositivo para analítica futura, deliberadamente SEPARADO del ciclo de
 * vida de `caseId` (que vive en memoria de React, nunca en cookie/storage,
 * ver docstring de `ChatWidget.tsx`). */

export function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function setCookie(name: string, value: string, maxAgeDays: number): void {
  const maxAgeSeconds = maxAgeDays * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAgeSeconds}; path=/; SameSite=Lax`;
}

/** Devuelve el `deviceSessionId` existente, o genera y persiste uno nuevo
 * (1 año) si no había ninguno todavía. */
export function getOrCreateDeviceSessionId(): string {
  const existing = getCookie("banking-agent-device-session");
  if (existing) return existing;
  const created = crypto.randomUUID();
  setCookie("banking-agent-device-session", created, 365);
  return created;
}
