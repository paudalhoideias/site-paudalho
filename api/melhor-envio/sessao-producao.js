import { createHash, createDecipheriv } from 'node:crypto';
export default function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex,nofollow');
 if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!=='revisao-home-etapa-1-2026-10')return res.status(404).end();
 if(req.method!=='GET')return res.status(405).end();
 const configured=Boolean(process.env.MELHOR_ENVIO_PROD_CLIENT_ID&&process.env.MELHOR_ENVIO_PROD_CLIENT_SECRET);
 let authorized=false,expired=null;
 const value=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('me_prod_session='));
 if(value&&configured){
  try{
   const raw=Buffer.from(value.slice('me_prod_session='.length),'base64url');
   const key=createHash('sha256').update(process.env.MELHOR_ENVIO_PROD_CLIENT_SECRET).digest();
   const d=createDecipheriv('aes-256-gcm',key,raw.subarray(0,12));d.setAuthTag(raw.subarray(12,28));
   const session=JSON.parse(Buffer.concat([d.update(raw.subarray(28)),d.final()]).toString('utf8'));
   expired=Date.now()>=Number(session.expires_at);
   authorized=Boolean(session.access_token&&!expired);
  }catch{authorized=false;}
 }
 res.status(200).json({ambiente:'melhor_envio_producao',executado_na_branch:'preview',credenciais_configuradas:configured,autorizado_neste_navegador:authorized,expirado:expired,frete_contratado:false,cotacao_real_habilitada:false});
}
