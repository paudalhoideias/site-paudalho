import { createHash, createDecipheriv } from 'node:crypto';
import { adminAllowed, configured, previewAllowed, saveTokens, tokenStatus } from '../../lib/melhor-envio/tokens.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (!previewAllowed()) return res.status(404).end();
  if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return res.status(405).end(); }
  if (!adminAllowed(req, res)) return;
  if (!configured()) return res.status(503).json({ error: 'Armazenamento seguro não configurado.' });
  try {
    if (req.method === 'POST') {
      // Only same-origin browser requests can migrate the existing encrypted cookie.
      // No token is accepted in a request body or returned to the browser.
      if (req.headers['x-me-migrate'] !== '1' || req.headers['sec-fetch-site'] !== 'same-origin') return res.status(403).end();
      const cookie = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('me_prod_session='));
      if (!cookie) return res.status(400).json({ error: 'Sessão de produção ausente. Use a autorização existente novamente.' });
      const raw = Buffer.from(cookie.slice('me_prod_session='.length), 'base64url');
      const decipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(process.env.MELHOR_ENVIO_PROD_CLIENT_SECRET).digest(), raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      const session = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'));
      await saveTokens({ access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at });
      res.setHeader('Set-Cookie', 'me_prod_session=; HttpOnly; Secure; SameSite=Lax; Path=/api/melhor-envio; Max-Age=0');
    }
    const status = await tokenStatus();
    if (req.method === 'GET' && req.query.painel === '1') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
      const initial = status.connected ? 'Autorização já armazenada no servidor.' : 'Autorização ainda não armazenada no servidor.';
      return res.status(200).end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Melhor Envio — Migração segura</title><style>body{font:16px system-ui,sans-serif;margin:36px auto;max-width:550px;padding:0 20px;line-height:1.5;color:#222}button{background:#28603a;color:#fff;border:0;padding:14px 20px;border-radius:8px;font:inherit;cursor:pointer}button:disabled{opacity:.5}#status{white-space:pre-wrap;background:#f3f5f3;padding:16px;border-radius:8px}</style></head><body><h1>Melhor Envio — administração</h1><p>Ambiente de testes da Pau D'Alho. Nenhuma etiqueta ou compra será gerada.</p><p id="status">${initial}</p><button id="migrar" ${status.connected ? 'disabled' : ''}>Transferir autorização para o servidor</button><script>
document.getElementById('migrar').addEventListener('click', async () => {
  const botao=document.getElementById('migrar'),saida=document.getElementById('status');
  botao.disabled=true;saida.textContent='Verificando a autorização neste navegador...';
  try {
    const r=await fetch('/api/melhor-envio/sessao-producao', {method:'POST',credentials:'same-origin',headers:{'X-Me-Migrate':'1'}});
    let data;try{data=await r.json()}catch{data={error:'Resposta inesperada do servidor.'}}
    if(r.ok && data.autorizado_no_servidor){saida.textContent='Autorização transferida com sucesso! O servidor já pode consultar o Melhor Envio sem depender deste navegador.';return}
    saida.textContent=data.error || 'A migração não foi concluída ('+r.status+').';
  }catch{saida.textContent='Erro de conexão. A migração não foi confirmada.'}
  botao.disabled=false;
});
</script></body></html>`);
    }
    return res.status(200).json({ ambiente: 'melhor_envio_producao', armazenamento_configurado: status.configured, autorizado_no_servidor: status.connected, expirado: status.expired ?? null, nova_autorizacao_necessaria: status.needs_authorization ?? !status.connected, frete_contratado: false });
  } catch {
    return res.status(503).json({ error: 'Não foi possível verificar ou persistir a autorização. Tente novamente ou refaça a autorização existente.' });
  }
}
