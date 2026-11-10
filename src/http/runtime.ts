import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { staticFiles } from './asset-catalog';
/** Runtime contains the development bootstrap token and must never enter the asset cache. */
export async function serveRuntime(req: IncomingMessage, res: ServerResponse, token: string) {
  const source = await readFile(staticFiles['/runtime.js'].file, 'utf8');
  res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(req.method === 'HEAD' ? undefined : source + '\nwindow.CALENDAR_DEV_TOKEN=' + JSON.stringify(token) + ';');
}
