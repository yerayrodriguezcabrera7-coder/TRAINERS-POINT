import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import type { Identity } from '../calendar/access';
import { ApiError } from '../calendar/model';
import type { ApiContext } from '../http/api-context';
import { sendError, sendJson } from '../http/json';
import { prisma } from '../lib/prisma';

const templateInput = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).default(''),
  pages: z.array(z.string()).min(1),
  isBuiltIn: z.boolean().default(false),
});

async function ensureAdmin(actor: Identity | undefined) {
  if (!actor || actor.role !== 'ADMIN') throw new ApiError(403, 'Solo administración puede gestionar plantillas.');
}

async function findTemplate(gym: string, id: string, adminOnly = true) {
  return prisma.permissionTemplate.findFirst({
    where: { id, gymKey: gym, isBuiltIn: false },
  });
}

export async function permissionsTemplatesRoutes(request: IncomingMessage, response: ServerResponse, url: URL, _context: ApiContext): Promise<boolean> {
  if (!url.pathname.startsWith('/api/manage/templates')) return false;

  try {
    const actor = (request as any).identity as Identity | undefined;
    const gym = (request as any).selectedGym as string;

    // GET /api/manage/templates → list templates
    if (url.pathname === '/api/manage/templates' && request.method === 'GET') {
      if (!actor) throw new ApiError(401, 'Inicia sesión.');
      if (actor.role !== 'ADMIN' && actor.role !== 'RECEPTION') throw new ApiError(403, 'No tienes permiso.');
      const templates = await prisma.permissionTemplate.findMany({
        where: { gymKey: gym, isBuiltIn: false },
        orderBy: { name: 'asc' },
      });
      sendJson(response, 200, templates);
      return true;
    }

    // POST /api/manage/templates → create template
    if (url.pathname === '/api/manage/templates' && request.method === 'POST') {
      if (!actor) throw new ApiError(401, 'Inicia sesión.');
      await ensureAdmin(actor);
      const raw = await readJsonBody(request);
      const v = templateInput.parse(raw);
      const template = await prisma.permissionTemplate.create({
        data: { gymKey: gym, name: v.name, description: v.description, pages: v.pages, createdBy: actor.id },
      });
      sendJson(response, 201, template);
      return true;
    }

    // Match /api/manage/templates/:id
    const match = url.pathname.match(/^\/api\/manage\/templates\/([^/]+)$/);
    if (match) {
      const id = decodeURIComponent(match[1]);

      // GET /api/manage/templates/:id → get template details (for applying)
      if (request.method === 'GET') {
        if (!actor) throw new ApiError(401, 'Inicia sesión.');
        const template = await prisma.permissionTemplate.findFirst({
          where: { id, gymKey: gym },
        });
        if (!template) throw new ApiError(404, 'Plantilla no encontrada.');
        sendJson(response, 200, { pages: template.pages, name: template.name, id: template.id });
        return true;
      }

      // PUT /api/manage/templates/:id → update template
      if (request.method === 'PUT') {
        if (!actor) throw new ApiError(401, 'Inicia sesión.');
        await ensureAdmin(actor);
        const raw = await readJsonBody(request);
        const v = templateInput.parse(raw);
        const existing = await prisma.permissionTemplate.findFirst({ where: { id, gymKey: gym, isBuiltIn: false } });
        if (!existing) throw new ApiError(404, 'Plantilla no encontrada.');
        const updated = await prisma.permissionTemplate.update({
          where: { id },
          data: { name: v.name, description: v.description, pages: v.pages },
        });
        sendJson(response, 200, updated);
        return true;
      }

      // DELETE /api/manage/templates/:id → delete template
      if (request.method === 'DELETE') {
        if (!actor) throw new ApiError(401, 'Inicia sesión.');
        await ensureAdmin(actor);
        const existing = await findTemplate(gym, id);
        if (!existing) throw new ApiError(404, 'Plantilla no encontrada.');
        await prisma.permissionTemplate.delete({ where: { id } });
        sendJson(response, 200, { success: true });
        return true;
      }
    }

    sendError(response, 404, 'Operación desconocida en plantillas de permisos.');
    return true;
  } catch (error) {
    if (error instanceof ApiError) {
      sendError(response, error.status, error.message);
    } else if (error instanceof z.ZodError) {
      sendError(response, 400, 'Revisa los campos del formulario.');
    } else {
      throw error;
    }
    return true;
  }
}

// Minimal readJsonBody inline to avoid circular imports
function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(new SyntaxError('Invalid JSON'));
      }
    });
    request.on('error', reject);
  });
}