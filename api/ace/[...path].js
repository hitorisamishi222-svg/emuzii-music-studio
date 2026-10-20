import { timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';

const METHODS = new Map([
  ['health', 'GET'],
  ['v1/models', 'GET'],
  ['v1/stats', 'GET'],
  ['v1/audio', 'GET'],
  ['format_input', 'POST'],
  ['release_task', 'POST'],
  ['query_result', 'POST'],
]);
const MAX_JSON_BYTES = 1024 * 1024;

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function parseRoute(req) {
  // Read the original URL, not req.query.path: /v1/audio also uses ?path=.
  const raw = new URL(req.url || '/', 'https://proxy.invalid');
  const prefix = '/api/ace/';
  if (!raw.pathname.startsWith(prefix)) return null;
  const endpoint = decodeURIComponent(raw.pathname.slice(prefix.length));
  return { raw, endpoint };
}

function originPermitted(req, res) {
  const origin = req.headers.origin;
  const expected = process.env.EMUZII_ALLOWED_ORIGIN
    || 'https://' + (req.headers.host || '');
  if (origin && origin !== expected) return false;
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Emuzii-Access');
  return true;
}

function error(res, status, message) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ error: message });
}

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!originPermitted(req, res)) return error(res, 403, 'Origin is not allowed');

  if (req.method === 'OPTIONS') return res.status(204).end();

  let route;
  try { route = parseRoute(req); }
  catch { return error(res, 400, 'Invalid route encoding'); }
  if (!route || !METHODS.has(route.endpoint)) return error(res, 404, 'ACE route not allowed');
  if (METHODS.get(route.endpoint) !== req.method) return error(res, 405, 'Method not allowed');

  // Fail closed: a partially configured deployment must never expose a billable GPU.
  const access = process.env.EMUZII_PROXY_TOKEN || '';
  if (!access) return error(res, 503, 'Proxy access is not configured');
  if (!safeEqual(req.headers['x-emuzii-access'], access)) {
    return error(res, 401, 'Unauthorized');
  }

  const rawBase = process.env.ACESTEP_API_URL || '';
  const apiKey = process.env.ACESTEP_API_KEY || '';
  if (!rawBase || !apiKey) return error(res, 503, 'ACE-Step backend is not configured');

  let base;
  try {
    base = new URL(rawBase);
    if (base.protocol !== 'https:' || base.username || base.password
      || base.search || base.hash || base.pathname !== '/') throw new Error('Invalid URL');
  } catch {
    return error(res, 503, 'ACE-Step backend must be an HTTPS origin');
  }
  const upstreamUrl = new URL('/' + route.endpoint, base);
  if (route.endpoint === 'v1/audio') {
    const path = route.raw.searchParams.get('path');
    if (!path) return error(res, 400, 'Audio path is missing');
    upstreamUrl.searchParams.set('path', path);
  }

  let body;
  if (req.method === 'POST') {
    const type = req.headers['content-type'] || '';
    if (!type.toLowerCase().includes('application/json')) {
      return error(res, 415, 'JSON input required');
    }
    body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    if (Buffer.byteLength(body, 'utf8') > MAX_JSON_BYTES) {
      return error(res, 413, 'JSON payload is too large');
    }
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers: {
        Authorization: 'Bearer ' + apiKey,
        ...(req.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body === undefined ? {} : { body }),
      signal: AbortSignal.timeout(120000),
      redirect: 'error',
    });
    const type = upstream.headers.get('content-type') || 'application/octet-stream';
    res.status(upstream.status);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', type);

    if (route.endpoint === 'v1/audio' && upstream.ok && upstream.body) {
      // Stream large WAV/MP3/FLAC files rather than buffering them in memory.
      Readable.fromWeb(upstream.body).on('error', () => res.destroy()).pipe(res);
      return;
    }

    const result = await upstream.text();
    // Do not echo credential-bearing upstream headers.
    return res.send(result);
  } catch {
    return error(res, 502, 'ACE-Step backend is unreachable');
  }
}
