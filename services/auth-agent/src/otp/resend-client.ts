import type { LanguageCode } from "@banking-agent/shared";

/**
 * Envío del email de código OTP vía la API REST de Resend
 * (https://api.resend.com/emails), usando `fetch` nativo de Node 20.x --
 * deliberadamente sin el SDK `resend` como dependencia nueva, un POST simple
 * no lo justifica.
 *
 * NUNCA lanza -- cualquier fallo (red, 4xx/5xx de Resend) devuelve
 * `{ok:false}` y el caller (`otp/request.ts`) sigue respondiendo genérico al
 * usuario de todas formas (nunca revela si el email se pudo enviar o no).
 */

export interface SendOtpEmailInput {
  toEmail: string;
  code: string;
  language: LanguageCode;
  apiKey: string;
  fromEmail: string;
}

const SUBJECT: Record<LanguageCode, string> = {
  es: "Tu código de verificación",
  pt: "Seu código de verificação",
};

function buildBody(code: string, language: LanguageCode): string {
  return language === "pt"
    ? `Seu código de verificação é ${code}. Ele expira em 10 minutos. Se você não pediu isso, pode ignorar este email.`
    : `Tu código de verificación es ${code}. Vence en 10 minutos. Si no lo pediste vos, podés ignorar este email.`;
}

export async function sendOtpEmail(input: SendOtpEmailInput): Promise<{ ok: boolean }> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: input.fromEmail,
        to: [input.toEmail],
        subject: SUBJECT[input.language],
        text: buildBody(input.code, input.language),
      }),
    });
    return { ok: response.ok };
  } catch {
    return { ok: false };
  }
}
