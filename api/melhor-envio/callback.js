// Ponte fixa: recebe o retorno cadastrado no Melhor Envio e encaminha ao Preview.
// Não utiliza Client Secret nem processa tokens em produção.
const preview = 'https://site-paudalho-git-r-6037e1-fabricio-oliveiras-projects-d0e317d9.vercel.app';
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  const allowed = ['code', 'state', 'error', 'error_description'];
  const target = new URL('/api/melhor-envio/callback', preview);
  for (const name of allowed) {
    const value = req.query[name];
    if (typeof value === 'string' && value.length <= 4096) target.searchParams.set(name, value);
  }
  if (!target.searchParams.has('state')) return res.status(400).end('Fluxo OAuth não iniciado.');
  res.statusCode = 302;
  res.setHeader('Location', target.toString());
  return res.end();
}
