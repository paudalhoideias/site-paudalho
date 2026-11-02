import { randomBytes, createHmac } from 'node:crypto';
const callback='https://www.paudalhoideias.com.br/api/melhor-envio/callback';
export default function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex,nofollow');
 if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!=='revisao-home-etapa-1-2026-10')return res.status(404).end();
 if(req.method!=='GET')return res.status(405).end();
 const id=process.env.MELHOR_ENVIO_PROD_CLIENT_ID,secret=process.env.MELHOR_ENVIO_PROD_CLIENT_SECRET;
 if(!id||!secret)return res.status(503).end('Credenciais de producao nao configuradas.');
 const payload='prod.'+Date.now()+'.'+randomBytes(24).toString('hex');
 const state=payload+'.'+createHmac('sha256',secret).update(payload).digest('hex');
 res.setHeader('Set-Cookie','me_prod_oauth_state='+encodeURIComponent(state)+'; HttpOnly; Secure; SameSite=Lax; Path=/api/melhor-envio; Max-Age=600');
 const url=new URL('https://melhorenvio.com.br/oauth/authorize');
 url.searchParams.set('client_id',id);url.searchParams.set('redirect_uri',callback);
 url.searchParams.set('response_type','code');url.searchParams.set('state',state);url.searchParams.set('scope','shipping-calculate');
 res.statusCode=302;res.setHeader('Location',url.toString());res.end();
}
