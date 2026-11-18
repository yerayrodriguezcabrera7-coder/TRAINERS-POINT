export type ReminderMessage = {
  channel: 'WHATSAPP' | 'SMS' | 'EMAIL'; phone?: string; email?: string; client: string; date: string; time: string; service: string; trainer: string; body?: string; templateSid?: string; templateVariables?: Record<string, string>;
};
export interface ReminderProvider { send(message: ReminderMessage): Promise<string>; }
export class DeliveryError extends Error {
  constructor(public outcome: 'RETRY' | 'FAILED' | 'UNKNOWN', message: string) { super(message); }
}
export const reminderText = (m: ReminderMessage) => `Hola ${m.client}. Te recordamos tu cita del ${m.date} a las ${m.time}: ${m.service}, con ${m.trainer}. Trainers Point.`;
export function configuredProvider(env: NodeJS.ProcessEnv = process.env, request: typeof fetch = fetch): ReminderProvider | null {
  if (env.REMINDERS_ENABLED !== 'true' || env.REMINDERS_ALLOW_SEND !== 'true') return null;
  const sid = env.TWILIO_ACCOUNT_SID, token = env.TWILIO_AUTH_TOKEN;
  const sms = env.TWILIO_SMS_FROM, whatsapp = env.TWILIO_WHATSAPP_FROM, template = env.TWILIO_WHATSAPP_CONTENT_SID;
  const validTwilio = Boolean(sid && /^AC[a-f0-9]{32}$/i.test(sid) && token);
  const sendGridKey = env.SENDGRID_API_KEY, emailFrom = env.REMINDER_EMAIL_FROM;
  const validEmail = Boolean(sendGridKey && emailFrom);
  if (!validTwilio && !validEmail) return null;
  return { async send(message) {
    if (message.channel === 'EMAIL') {
      if (!validEmail || !message.email) throw new DeliveryError('FAILED', 'El email del cliente o el proveedor de correo no están configurados.');
      let response: Response;
      try {
        response = await request('https://api.sendgrid.com/v3/mail/send', { method: 'POST', headers: { Authorization: `Bearer ${sendGridKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ personalizations: [{ to: [{ email: message.email }] }], from: { email: emailFrom }, subject: `Recordatorio de cita · ${message.date}`, content: [{ type: 'text/plain', value: message.body || reminderText(message) }] }), signal: AbortSignal.timeout(10000) });
      } catch { throw new DeliveryError('UNKNOWN', 'Sin confirmación del proveedor de correo. Revisar antes de reenviar.'); }
      if (response.status === 429) throw new DeliveryError('RETRY', 'Límite temporal del proveedor de correo.');
      if (!response.ok) throw new DeliveryError(response.status < 500 ? 'FAILED' : 'UNKNOWN', 'El proveedor de correo no confirmó el envío.');
      return response.headers.get('x-message-id') || `sendgrid-${Date.now()}`;
    }
    if (!validTwilio || !message.phone) throw new DeliveryError('FAILED', 'El canal telefónico seleccionado no está configurado o falta un teléfono válido.');
    const wa = message.channel === 'WHATSAPP';
    const contentSid = message.templateSid || (message.templateVariables ? undefined : template);
    if (wa && (!whatsapp || !/^HX[a-f0-9]{32}$/i.test(contentSid || ''))) throw new DeliveryError('FAILED', 'WhatsApp no está configurado con una plantilla aprobada para este mensaje.');
    if (!wa && !sms) throw new DeliveryError('FAILED', 'SMS no está configurado.');
    const body = new URLSearchParams({ To: (wa ? 'whatsapp:' : '') + message.phone, From: wa ? 'whatsapp:' + whatsapp!.replace(/^whatsapp:/,'') : sms! });
    if (wa) {
      body.set('ContentSid', contentSid!);
      body.set('ContentVariables', JSON.stringify(message.templateVariables || { '1': message.client, '2': message.date, '3': message.time, '4': message.service, '5': message.trainer }));
    } else body.set('Body', message.body || reminderText(message));
    let response: Response;
    try {
      response = await request(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(sid + ':' + token).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(10000) });
    } catch { throw new DeliveryError('UNKNOWN', 'Sin confirmación del proveedor. Revisar antes de reenviar.'); }
    if (response.status === 429) throw new DeliveryError('RETRY', 'Límite temporal del proveedor.');
    if (response.status >= 400 && response.status < 500) throw new DeliveryError('FAILED', 'El proveedor rechazó el mensaje. Revisar su configuración.');
    if (!response.ok) throw new DeliveryError('UNKNOWN', 'Resultado del proveedor no confirmado.');
    const result = await response.json().catch(() => ({})) as { sid?: string };
    if (!result.sid) throw new DeliveryError('UNKNOWN', 'Respuesta sin identificador del mensaje.');
    return result.sid;
  } };
}
