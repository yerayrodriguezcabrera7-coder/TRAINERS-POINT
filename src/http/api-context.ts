import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import type { Access } from '../calendar/access';
export type ApiContext = {
  port: number;
  calendarAccess?: Access;
  calendarHandler?: (request: IncomingMessage, response: ServerResponse) => unknown;
  calendarBootstrapToken: string;
  currentConfiguredGym: string;
  calendarPool?: Pool;
  hasTrustedOrigin: (request: IncomingMessage, port: number) => boolean;
};
