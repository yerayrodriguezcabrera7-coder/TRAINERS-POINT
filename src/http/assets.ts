import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';
import { staticFiles } from './asset-catalog';
const compressBrotli = promisify(brotliCompress), compressGzip = promisify(gzip);
type Asset = {
  stamp: string;
  body: Buffer;
  br?: Buffer;
  gzip?: Buffer;
  hash: string;
};
const cache = new Map<string, Asset>();
const pending = new Map<string, Promise<Asset>>();
async function load(file: string, contentType: string): Promise<Asset> {
  const info = await stat(file), stamp = `${info.mtimeMs}:${info.size}`;
  const saved = cache.get(file);
  if (saved?.stamp === stamp)
    return saved;
  const inFlight = pending.get(file);
  if (inFlight)
    return inFlight;
  const promise = (async () => {
    const body = await readFile(file);
    const result: Asset = { stamp, body, hash: createHash('sha256').update(body).digest('base64url') };
    if (body.length >= 1024 && /^(text\/|font\/|application\/javascript)/.test(contentType)) {
      [result.br, result.gzip] = await Promise.all([
        compressBrotli(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } }),
        compressGzip(body),
      ]);
    }
    cache.set(file, result);
    return result;
  })();
  pending.set(file, promise);
  try {
    return await promise;
  }
  finally {
    pending.delete(file);
  }
}
/** Explicit catalogue only: request paths are never used as filesystem paths. */
export async function serveAsset(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
  const profile = /^\/clientes\/[0-9a-f-]+\/ficha$/i.test(path);
  const spec = staticFiles[profile ? '/client-profile.html' : path];
  if (!spec)
    return false;
  const asset = await load(spec.file, spec.contentType);
  const accepted = new Map((req.headers['accept-encoding'] || '').split(',').map(part => {
    const [name, ...params] = part.trim().split(';');
    const quality = params.find(value => value.trim().startsWith('q='));
    return [name.toLowerCase(), quality ? Number(quality.trim().slice(2)) : 1];
  }));
  const br = accepted.get('br') || 0, gz = accepted.get('gzip') || 0;
  const encoding = asset.br && br > 0 && br >= gz ? 'br' : asset.gzip && gz > 0 ? 'gzip' : undefined;
  const body = encoding === 'br' ? asset.br! : encoding === 'gzip' ? asset.gzip! : asset.body;
  const etag = `W/"${asset.hash}-${encoding || 'identity'}"`;
  res.setHeader('Content-Type', spec.contentType);
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('ETag', etag);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (encoding)
    res.setHeader('Content-Encoding', encoding);
  const matches = (req.headers['if-none-match'] || '').split(',').map(value => value.trim());
  if (matches.includes(etag) || matches.includes('*')) {
    res.writeHead(304);
    res.end();
    return true;
  }
  res.setHeader('Content-Length', body.length);
  res.writeHead(200);
  res.end(req.method === 'HEAD' ? undefined : body);
  return true;
}
