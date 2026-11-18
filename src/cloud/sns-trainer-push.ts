import { createHash } from "node:crypto";
import { DateTime } from "luxon";
import { Pool } from "pg";
import {
  CreatePlatformEndpointCommand, PublishCommand,
  SetSubscriptionAttributesCommand, SNSClient, SubscribeCommand, UnsubscribeCommand,
} from "@aws-sdk/client-sns";
import type { Booking } from "../calendar/model";

type Platform = "ios" | "android";
type PushConfig = { topicArn: string; iosArn?: string; androidArn?: string };
type Sender = Pick<SNSClient, "send">;

export const pushMigration = `CREATE TABLE IF NOT EXISTS calendar.push_devices (
  token_hash text PRIMARY KEY,
  gym_id text NOT NULL REFERENCES calendar.gyms(id),
  employee_id text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ios','android')),
  endpoint_arn text NOT NULL,
  subscription_arn text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_devices_employee ON calendar.push_devices(gym_id,employee_id);`;

export function agendaPushEvent(old: Booking | undefined, current: Booking, timezone: string, now = DateTime.now()) {
  const local = now.setZone(timezone);
  const starts = DateTime.fromISO(`${current.date}T${current.start}`, { zone: timezone });
  if (old?.status !== "CANCELLED" && current.status === "CANCELLED" &&
      starts.toMillis() >= local.toMillis() && starts.toMillis() <= local.plus({ hours: 3 }).toMillis()) {
    return old?.employeeId ? { kind: "CANCELLED_SOON" as const, employeeId: old.employeeId, bookingId: current.id } : null;
  }
  if (current.employeeId && current.date === local.toISODate() &&
      (current.status === "PENDING" || current.status === "CONFIRMED") &&
      (!old || old.employeeId !== current.employeeId || old.date !== current.date || old.start !== current.start || old.status === "CANCELLED")) {
    return { kind: "NEW_TODAY" as const, employeeId: current.employeeId, bookingId: current.id };
  }
  return null;
}

export class SnsTrainerPush {
  readonly enabled: boolean;
  private client: Sender;
  constructor(private pool: Pool, private config: PushConfig, client?: Sender) {
    if (!/^arn:aws:sns:([a-z0-9-]+):\d{12}:[\w-]+$/.test(config.topicArn)) throw new Error("SNS_TRAINER_TOPIC_ARN no es válido.");
    const region = config.topicArn.split(":")[3];
    for (const arn of [config.iosArn, config.androidArn].filter(Boolean)) {
      if (!arn!.startsWith(`arn:aws:sns:${region}:`) || !arn!.includes(":app/")) throw new Error("El ARN de la aplicación SNS debe pertenecer a la región del tema.");
    }
    this.enabled = Boolean(config.iosArn || config.androidArn);
    this.client = client || new SNSClient({ region, maxAttempts: 2 });
  }
  supports(platform: Platform) { return Boolean(platform === "ios" ? this.config.iosArn : this.config.androidArn); }
  private application(platform: Platform) { return platform === "ios" ? this.config.iosArn : this.config.androidArn; }
  private hash(platform: Platform, token: string) { return createHash("sha256").update(`${platform}:${token}`).digest("hex"); }

  async register(gym: string, employeeId: string, platform: Platform, token: string) {
    const applicationArn = this.application(platform);
    if (!applicationArn) throw new Error("No hay una aplicación SNS configurada para este dispositivo.");
    const hash = this.hash(platform, token);
    const old = (await this.pool.query("SELECT * FROM calendar.push_devices WHERE token_hash=$1", [hash])).rows[0];
    if (old?.gym_id === gym && old?.employee_id === employeeId) return;
    if (old) {
      await this.client.send(new UnsubscribeCommand({ SubscriptionArn: old.subscription_arn }));
      await this.pool.query("DELETE FROM calendar.push_devices WHERE token_hash=$1", [hash]);
    }
    const endpoint = await this.client.send(new CreatePlatformEndpointCommand({ PlatformApplicationArn: applicationArn, Token: token }));
    if (!endpoint.EndpointArn) throw new Error("SNS no devolvió el endpoint del dispositivo.");
    const policy = JSON.stringify({ gymId: [gym], employeeId: [employeeId] });
    const subscription = await this.client.send(new SubscribeCommand({ TopicArn: this.config.topicArn, Protocol: "application", Endpoint: endpoint.EndpointArn, ReturnSubscriptionArn: true, Attributes: { FilterPolicy: policy } }));
    if (!subscription.SubscriptionArn || subscription.SubscriptionArn === "pending confirmation") throw new Error("SNS no confirmó la suscripción del dispositivo.");
    try {
      // Refresh policies on an existing SNS subscription as well as a new one.
      await this.client.send(new SetSubscriptionAttributesCommand({ SubscriptionArn: subscription.SubscriptionArn, AttributeName: "FilterPolicy", AttributeValue: policy }));
      await this.pool.query(`INSERT INTO calendar.push_devices(token_hash,gym_id,employee_id,platform,endpoint_arn,subscription_arn)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(token_hash) DO UPDATE SET gym_id=$2,employee_id=$3,endpoint_arn=$5,subscription_arn=$6,updated_at=now()`,
        [hash,gym,employeeId,platform,endpoint.EndpointArn,subscription.SubscriptionArn]);
    } catch (error) {
      await this.client.send(new UnsubscribeCommand({ SubscriptionArn: subscription.SubscriptionArn })).catch(() => {});
      throw error;
    }
  }

  async unregister(gym: string, employeeId: string, platform: Platform, token: string) {
    const hash = this.hash(platform, token);
    const row = (await this.pool.query("SELECT subscription_arn FROM calendar.push_devices WHERE token_hash=$1 AND gym_id=$2 AND employee_id=$3", [hash,gym,employeeId])).rows[0];
    if (!row) return;
    await this.client.send(new UnsubscribeCommand({ SubscriptionArn: row.subscription_arn }));
    await this.pool.query("DELETE FROM calendar.push_devices WHERE token_hash=$1 AND gym_id=$2 AND employee_id=$3", [hash,gym,employeeId]);
  }

  async publish(gym: string, event: NonNullable<ReturnType<typeof agendaPushEvent>>) {
    const title = event.kind === "NEW_TODAY" ? "Nueva cita hoy" : "Cita cancelada próximamente";
    const body = "Abre la agenda para consultar el cambio.";
    const payload = JSON.stringify({
      default: `${title}. ${body}`,
      GCM: JSON.stringify({ fcmV1Message: { message: { notification: { title, body }, data: { bookingId: event.bookingId, kind: event.kind } } } }),
      APNS: JSON.stringify({ aps: { alert: { title, body }, sound: "default" }, bookingId: event.bookingId, kind: event.kind }),
      APNS_SANDBOX: JSON.stringify({ aps: { alert: { title, body }, sound: "default" }, bookingId: event.bookingId, kind: event.kind }),
    });
    await this.client.send(new PublishCommand({ TopicArn: this.config.topicArn, MessageStructure: "json", Message: payload,
      MessageAttributes: { gymId: { DataType: "String", StringValue: gym }, employeeId: { DataType: "String", StringValue: event.employeeId } } }));
  }
}
