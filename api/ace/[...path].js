const ALLOWED = new Set(['health','v1/models','release_task','query_result','v1/audio']);

function targetPath(req) {
  const parts = Array.isArray(req.query.path) ? req.query.path : [req.query.path].filter(Boolean);
  return parts.join('/');
}

function applyCors(req,res){
  const origin=req.headers.origin || '';
  const allowed=process.env.EMUZII_ALLOWED_ORIGIN || '*';
  if(allowed==='*' || !origin || origin===allowed) res.setHeader('Access-Control-Allow-Origin', allowed==='*'?'*':origin);
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,X-Emuzii-Access');
  res.setHeader('Vary','Origin');
}

export default async function handler(req, res) {
  applyCors(req,res);
  if(req.method==='OPTIONS') return res.status(204).end();

  const path = targetPath(req);
  if (!ALLOWED.has(path)) return res.status(404).json({ error: 'ACE route not allowed' });

  const required = process.env.EMUZII_PROXY_TOKEN || '';
  if (required && req.headers['x-emuzii-access'] !== required) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const base = (process.env.ACESTEP_API_URL || '').replace(/\/+$/, '');
  if (!base) return res.status(503).json({ error: 'ACESTEP_API_URL is not configured' });

  const url = new URL(`${base}/${path}`);
  for (const [k, v] of Object.entries(req.query || {})) {
    if (k === 'path') continue;
    if (Array.isArray(v)) v.forEach(x => url.searchParams.append(k, x));
    else if (v != null) url.searchParams.set(k, String(v));
  }

  const headers = {};
  const apiKey = process.env.ACESTEP_API_KEY || '';
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (req.method !== 'GET' && req.method !== 'HEAD') headers['Content-Type'] = 'application/json';

  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  }

  try {
    const upstream = await fetch(url, { method: req.method, headers, body });
    const type = upstream.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (type.startsWith('audio/') || path === 'v1/audio') {
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', type);
      return res.status(upstream.status).send(buf);
    }

    const text = await upstream.text();
    res.setHeader('Content-Type', type.includes('json') ? 'application/json; charset=utf-8' : type);
    return res.status(upstream.status).send(text);
  } catch (e) {
    return res.status(502).json({ error: `ACE-Step upstream unavailable: ${e.message}` });
  }
}
