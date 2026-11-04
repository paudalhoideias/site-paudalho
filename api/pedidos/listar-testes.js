
import { adminAllowed, previewAllowed } from '../../lib/melhor-envio/tokens.js';
import { listOrders } from '../../lib/pedidos/store.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex,nofollow');
 if(!previewAllowed())return res.status(404).end();
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).end();}
 if(!adminAllowed(req,res))return;
 try{
  const pedidos=await listOrders();
  return res.status(200).json({ambiente:'preview',aviso:'Pedidos de teste. Sem cobrança, sem confirmação de pagamento, sem autorização para produção. Registros expiram após 7 dias.',quantidade:pedidos.length,pedidos});
 }catch{return res.status(503).json({error:'Pedidos de teste temporariamente indisponíveis.'});}
}
