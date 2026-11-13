import { type IncomingMessage, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { type Identity } from "../calendar/access";
import { ApiError } from "../calendar/model";
import { CashRegister, cashPermission } from "../finance/cash";
import { Inventory, inventoryPermission } from "../finance/inventory";
import type { ApiContext } from '../http/api-context';
import { readJsonBody, sendError, sendJson } from "../http/json";
import { prisma } from "../lib/prisma";
export async function financeRoutes(request: IncomingMessage, response: ServerResponse, url: URL, context: ApiContext): Promise<boolean> {
  if (url.pathname.startsWith("/api/cash/")) {
    try {
      const actor = (request as any).identity as Identity | undefined;
      cashPermission(actor);
      const gym = (request as any).selectedGym as string, cash = new CashRegister(prisma);
      const session = url.pathname.match(/^\/api\/cash\/sessions\/([0-9a-f-]+)(?:\/(movements|close))?$/i);
      if (url.pathname === '/api/cash/current' && request.method === 'GET')
        sendJson(response, 200, await cash.current(gym));
      else if (url.pathname === '/api/cash/sessions' && request.method === 'GET')
        sendJson(response, 200, await cash.history(gym, url.searchParams));
      else if (url.pathname === '/api/cash/sessions' && request.method === 'POST')
        sendJson(response, 201, await cash.open(gym, actor!, await readJsonBody(request)));
      else if (session && request.method === 'GET' && !session[2])
        sendJson(response, 200, await cash.detail(gym, session[1]));
      else if (session && request.method === 'POST' && session[2] === 'movements')
        sendJson(response, 201, await cash.movement(gym, actor!, session[1], await readJsonBody(request)));
      else if (session && request.method === 'POST' && session[2] === 'close')
        sendJson(response, 200, await cash.close(gym, actor!, session[1], await readJsonBody(request)));
      else
        sendError(response, 404, 'Operación de caja desconocida.');
    }
    catch (error) {
      if (error instanceof ApiError)
        sendError(response, error.status, error.message);
      else if (error instanceof ZodError)
        sendError(response, 400, 'Revisa los importes, las fechas y el motivo del movimiento.');
      else
        throw error;
    }
    return true;
  }
  if (url.pathname.startsWith("/api/inventory/")) {
    try {
      const actor = (request as any).identity as Identity | undefined;
      const gym = (request as any).selectedGym as string;
      const inventory = new Inventory(prisma);
      const product = url.pathname.match(/^\/api\/inventory\/products(?:\/([0-9a-f-]+))?$/i);
      const restock = url.pathname.match(/^\/api\/inventory\/restock(?:\/([0-9a-f-]+))?$/i);
      const payment = url.pathname.match(/^\/api\/inventory\/sales\/([0-9a-f-]+)\/payments$/i);
      const receiptAction = url.pathname.match(/^\/api\/inventory\/sales\/([0-9a-f-]+)\/(refunds|verify-payment)$/i);
      const reversal = url.pathname.match(/^\/api\/inventory\/sales\/([0-9a-f-]+)\/(cancel|return)$/i);
      const action = request.method === 'GET' ? 'read' : restock ? 'restock' : url.pathname === '/api/inventory/sales' || payment || receiptAction?.[2] === 'verify-payment' ? 'sell' : reversal?.[2] === 'return' || receiptAction?.[2] === 'refunds' ? 'return' : 'admin';
      inventoryPermission(actor, action);
      if (restock && request.method === 'GET' && !restock[1])
        sendJson(response, 200, { requests: await inventory.restockRequests(gym, url.searchParams.get('status') || undefined) });
      else if (restock && request.method === 'POST' && !restock[1])
        sendJson(response, 201, await inventory.saveRestockRequest(gym, { id: actor!.id, name: actor!.name }, await readJsonBody(request)));
      else if (restock && (request.method === 'PUT' || request.method === 'PATCH') && restock[1])
        sendJson(response, 200, await inventory.updateRestockRequest(gym, { id: actor!.id, name: actor!.name }, restock[1], await readJsonBody(request)));
      else if (restock && request.method === 'DELETE' && restock[1])
        sendJson(response, 200, await inventory.removeRestockRequest(gym, restock[1]));
      else if (product && request.method === 'GET' && !product[1])
        sendJson(response, 200, { products: await inventory.products(gym) });
      else if (product && request.method === 'POST' && !product[1])
        sendJson(response, 201, await inventory.saveProduct(gym, await readJsonBody(request), undefined, actor!));
      else if (product && request.method === 'PUT' && product[1])
        sendJson(response, 200, await inventory.saveProduct(gym, await readJsonBody(request), product[1], actor!));
      else if (product && request.method === 'DELETE' && product[1])
        sendJson(response, 200, await inventory.removeProduct(gym, product[1], actor!));
      else if (url.pathname === '/api/inventory/sales' && request.method === 'GET')
        sendJson(response, 200, await inventory.salesPage(gym, url.searchParams));
      else if (url.pathname === '/api/inventory/sales' && request.method === 'POST')
        sendJson(response, 201, await inventory.sell(gym, actor!, await readJsonBody(request)));
      else if (payment && request.method === 'POST')
        sendJson(response, 200, await inventory.pay(gym, actor!, payment[1], await readJsonBody(request)));
      else if (receiptAction && request.method === 'POST')
        sendJson(response, 200, await (receiptAction[2] === 'refunds' ? inventory.refund(gym, actor!, receiptAction[1], await readJsonBody(request)) : inventory.verifyPaid(gym, actor!, receiptAction[1], await readJsonBody(request))));
      else if (reversal && request.method === 'POST')
        sendJson(response, 200, await inventory.reverse(gym, reversal[1], reversal[2] === 'cancel' ? {} : await readJsonBody(request), reversal[2] === 'cancel', actor!));
      else
        sendError(response, 404, "Operación desconocida.");
    }
    catch (error) {
      if (error instanceof ApiError)
        sendError(response, error.status, error.message);
      else if (error instanceof ZodError)
        sendError(response, 400, "Revisa los campos, cantidades y precios de la operación.");
      else
        throw error;
    }
    return true;
  }
  return false;
}
