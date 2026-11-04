import { redis } from '../melhor-envio/tokens.js';
import { enviarEmail, DESTINO_LOJA, mensagemNovoPedido, emailClienteRecebido, emailClientePagamentoConfirmado } from './email.js';
const PREFIX='paudalho:pedidos:preview:v1:aviso:';
const TTL=604800;
export async function statusNotificacoes(numero){
 const raw=await redis('GET',PREFIX+numero);
 return raw?JSON.parse(raw):{};
}
async function salvar(numero,status){await redis('SET',PREFIX+numero,JSON.stringify(status),'EX',TTL);}
export async function notificarPedidoTeste(pedido,evento){
 if(!['recebido','pagamento'].includes(evento)||pedido.ambiente!=='preview')throw Error('invalid notification');
 const numero=pedido.numero,all=await statusNotificacoes(numero),key=evento;
 if(all[key]?.situacao==='aceito')return all;
 const lock=PREFIX+numero+':'+evento+':lock';
 if(await redis('SET',lock,'1','NX','EX',45)!=='OK')return all;
 try{
  const titulo=evento==='recebido'?'Pedido recebido':'Pagamento conferido';
  const corpoCliente=evento==='recebido'?emailClienteRecebido(pedido):emailClientePagamentoConfirmado(pedido);
  const mensagens=evento==='recebido'?
   [{tipo:'lojista',assunto:'[TESTE] Novo pedido '+numero,corpo:'[SIMULAÇÃO]\n\n'+mensagemNovoPedido(pedido)},
    {tipo:'cliente',assunto:'[TESTE - cópia para a loja] Recebemos seu pedido '+numero,corpo:'DESTINATÁRIO ORIGINAL PREVISTO: '+pedido.comprador.email+'\n\n'+corpoCliente}]:
   [{tipo:'cliente',assunto:'[TESTE - cópia para a loja] Pagamento identificado '+numero,corpo:'DESTINATÁRIO ORIGINAL PREVISTO: '+pedido.comprador.email+'\n\n'+corpoCliente}];
  const anteriores=all[key]?.mensagens||{};
  const resultados={...anteriores};
  for(const m of mensagens){
   if(resultados[m.tipo]?.situacao==='aceito')continue;
   try{
    // Por segurança, a Preview envia apenas à caixa da própria loja,
    // nunca ao e-mail digitado por um visitante em um pedido fictício.
    const sent=await enviarEmail({destinatario:DESTINO_LOJA,assunto:m.assunto,corpo:m.corpo,chaveIdempotencia:'paudalho-preview-'+evento+'-'+m.tipo+'-'+numero});
    resultados[m.tipo]={situacao:'aceito',resend_id:sent.id,quando:new Date().toISOString()};
   }catch{
    resultados[m.tipo]={situacao:'falhou',quando:new Date().toISOString()};
   }
   all[key]={situacao:Object.values(resultados).every(x=>x.situacao==='aceito')?'aceito':'falhou',mensagens:resultados,atualizado_em:new Date().toISOString()};
   await salvar(numero,all);
  }
  return all;
 }finally{await redis('DEL',lock).catch(()=>{});}
}
