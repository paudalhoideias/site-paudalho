import { createHash, createDecipheriv } from 'node:crypto';
export default function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Robots-Tag','noindex,nofollow');
  if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== 'revisao-home-etapa-1-2026-10') return res.status(404).end();
  if(req.method !== 'GET') {res.setHeader('Allow','GET');return res.status(405).end();}
  const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('me_sandbox_session='));
  if(!cookie) return res.status(200).json({autorizado:false,motivo:'Sessão de testes não encontrada neste navegador.'});
  try {
    const raw=Buffer.from(cookie.slice('me_sandbox_session='.length),'base64url');
    if(raw.length<32) throw Error('invalid');
    const iv=raw.subarray(0,12),tag=raw.subarray(12,28),encrypted=raw.subarray(28);
    const key=createHash('sha256').update(process.env.MELHOR_ENVIO_CLIENT_SECRET||'').digest();
    const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);
    const payload=JSON.parse(Buffer.concat([decipher.update(encrypted),decipher.final()]).toString('utf8'));
    return res.status(200).json({autorizado:Boolean(payload.access_token && payload.refresh_token && Number(payload.expires_at)>Date.now()),ambiente:'sandbox',tokens_armazenados:'sessão temporária no navegador',expirado:Number(payload.expires_at)<=Date.now()});
  } catch {return res.status(200).json({autorizado:false,motivo:'Sessão inválida ou expirada.'});}
}
