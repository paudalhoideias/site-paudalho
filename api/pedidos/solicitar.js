
import { randomUUID } from 'node:crypto';
import { accessToken, previewAllowed, quoteAllowed, redis, adminAllowed } from '../../lib/melhor-envio/tokens.js';
import { orderId, storeOrder, listOrders, getTestOrder, updateTestOrderStatus } from '../../lib/pedidos/store.js';
import { enviarEmail, resendConfigurado, DESTINO_LOJA } from '../../lib/pedidos/email.js';
import { notificarPedidoTeste, statusNotificacoes } from '../../lib/pedidos/notificacoes.js';
import { pixPreview } from '../../lib/pedidos/pix.js';
import { mercadoPagoTestStatus, preferenciaCartaoTeste } from '../../lib/pedidos/mercado-pago.js';
// O painel de teste envia apenas após clique explícito do administrador.
const ADMIN_HTML="<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Pedidos de teste | Pau D'Alho</title><style>body{font:16px system-ui,sans-serif;margin:0;background:#f4f6f2;color:#243028}.wrap{max-width:850px;margin:28px auto;padding:16px}h1{font-size:27px}p{line-height:1.55}.aviso{background:#fff2d8;padding:14px;border-radius:10px;margin-bottom:18px}.pedido{background:white;border:1px solid #dce3d9;border-radius:12px;padding:20px;margin:14px 0}.pedido h2{font-size:18px;margin:0 0 10px}.linha{margin:6px 0}.btn{background:#34673c;color:white;border:0;padding:11px 15px;border-radius:8px;margin-top:12px;cursor:pointer}.btn:disabled{opacity:.5;cursor:default}.status{font-weight:700}.erro{color:#9a2a20}</style></head><body><main class=\"wrap\"><h1>Pedidos da Pau D'Alho — testes</h1><p class=\"aviso\"><strong>Ambiente de teste.</strong> Nenhum pagamento é processado neste painel. Marcar Pix como conferido é uma simulação e <strong>não libera produção</strong>. Os registros expiram em 7 dias.</p><section class=\"pedido\"><h2>Notificação por e-mail</h2><p>Envie apenas uma mensagem de teste para o e-mail comercial da Pau D'Alho. Isso não gera pedido nem cobrança.</p><button class=\"btn\" id=\"email-teste\" type=\"button\">Enviar e-mail de teste</button><p id=\"email-estado\" role=\"status\"></p></section><section class=\"pedido\"><h2>Configuração Pix Inter PJ</h2><p id=\"pix-estado\" role=\"status\">Conferindo chave CNPJ no servidor...</p><small>A chave completa não é exibida no painel de testes.</small></section><section class=\"pedido\"><h2>Mercado Pago — cartão</h2><p id=\"mp-estado\" role=\"status\">Verificando integração de testes...</p><small>Pagamento por cartão ainda bloqueado. Nenhuma cobrança é iniciada neste painel.</small></section><p id=\"estado\" role=\"status\">Carregando pedidos...</p><section id=\"pedidos\"></section></main><script>\nconst root=document.getElementById('pedidos'),estado=document.getElementById('estado');\nconst moeda=c=>(c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});\nfunction el(tag,content,klass){const a=document.createElement(tag);if(content!==undefined)a.textContent=content;if(klass)a.className=klass;return a;}\nfunction item(bloco,nome,valor){bloco.append(el('p',nome+': '+valor,'linha'))}\nasync function carregar(){\n try{\n  const r=await fetch('/api/pedidos/solicitar',{credentials:'same-origin',cache:'no-store'}),dados=await r.json();\n  if(!r.ok)throw Error('Consulta administrativa indisponível.');\n  root.replaceChildren();\n  estado.textContent=dados.quantidade+' pedido(s) de teste encontrado(s).';\n  for(const p of dados.pedidos){\n   const card=el('article',undefined,'pedido');card.append(el('h2',p.numero));\n   item(card,'Criado em',new Date(p.criado_em).toLocaleString('pt-BR'));\n   item(card,'Cliente',p.comprador.nome);\n   item(card,'E-mail',p.comprador.email);\n   item(card,'Telefone',p.comprador.telefone);\n   item(card,'Produto',p.produto+' | fita: '+p.configuracao.fita+' | revestimento: '+p.configuracao.revestimento+' | lousa: '+p.configuracao.lousa);\n   item(card,'Entrega',p.entrega.rua+', '+p.entrega.numero+' — '+p.entrega.cidade+'/'+p.entrega.uf+' — CEP '+p.entrega.cep);\n   item(card,'Frete',p.frete.transportadora+' '+p.frete.nome+' — '+moeda(p.valores.frete_centavos));\n   item(card,'Valor total',moeda(p.valores.total_centavos));\n   item(card,'Método',p.pagamento.metodo==='cartao'?'Cartão Mercado Pago (sandbox)':'Pix Inter (simulado)');\n   item(card,'Situação do pagamento',p.pagamento.metodo==='cartao'?'Checkout sandbox — aprovação não verificada':p.pagamento.situacao==='PAGAMENTO_CONFERIDO_TESTE'?'Pix conferido na simulação — produção não autorizada':'Aguardando conferência simulada do Pix — sem cobrança');\n   const historico=Array.isArray(p.historico)?p.historico:[{em:p.criado_em,descricao:'Pedido de teste registrado.'}];\n   if(p.pagamento.situacao==='PAGAMENTO_CONFERIDO_TESTE'&&!historico.some(e=>e.evento==='CONFERENCIA_PIX_SIMULADA'))historico.push({em:p.pagamento.confirmado_em_teste||p.criado_em,descricao:'Conferência simulada do Pix.'});\n   const linhaHistorico=el('div');linhaHistorico.append(el('strong','Histórico do pedido'));\n   for(const evento of historico){\n    linhaHistorico.append(el('p',new Date(evento.em).toLocaleString('pt-BR')+' — '+evento.descricao,'linha'));\n   }\n   card.append(linhaHistorico);\n   const avisos=p.notificacoes||{};\n   const recebido=avisos.recebido?.situacao||'não enviado';\n   const pagamento=avisos.pagamento?.situacao||'não enviado';\n   item(card,'E-mails de pedido recebido (somente loja, teste)',recebido);\n   if(p.pagamento.situacao==='PAGAMENTO_CONFERIDO_TESTE')item(card,'E-mail de Pix conferido (somente loja, teste)',pagamento);\n\n   const falhas=[];\n   if(recebido!=='aceito')falhas.push({evento:'recebido',rotulo:'Tentar novamente e-mail de pedido'});\n   if(p.pagamento.situacao==='PAGAMENTO_CONFERIDO_TESTE'&&pagamento!=='aceito')falhas.push({evento:'pagamento',rotulo:'Tentar novamente e-mail de confirmação Pix'});\n   for(const tentativa of falhas){\n    const retry=el('button',tentativa.rotulo,'btn');retry.type='button';\n    const aviso=el('p','');\n    retry.onclick=async()=>{\n     retry.disabled=true;aviso.textContent='Verificando notificações...';\n     try{\n      const response=await fetch('/api/pedidos/solicitar',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({acao:'reenviar-notificacoes-teste',numero:p.numero,evento:tentativa.evento})});\n      const answer=await response.json();if(!response.ok)throw Error(answer.error||'Falha no reenvio.');\n      aviso.textContent=answer.situacao==='aceito'?'Notificação aceita pelo Resend.':'Notificação ainda pendente. Verifique os registros.';\n      await carregar();\n     }catch(e){aviso.textContent=e.message;retry.disabled=false;}\n    };\n    card.append(retry,aviso);\n   }\n\n   const conf=p.pagamento.situacao==='PAGAMENTO_CONFERIDO_TESTE';\n   card.append(el('p',p.pagamento.metodo==='cartao'?'Cartão: aguardando verificação externa (sandbox)':conf?'Pix marcado como conferido NA SIMULAÇÃO':'Pix ainda não conferido NA SIMULAÇÃO','status'));\n   if(!conf&&p.pagamento.metodo==='pix'){\n    const btn=el('button','Simular conferência do Pix','btn');btn.type='button';\n    const msg=el('p','');\n    btn.onclick=async()=>{\n     if(!confirm('Marcar o pedido '+p.numero+' como Pix conferido apenas no ambiente de TESTE? Isso não representa pagamento real.'))return;\n     btn.disabled=true;msg.textContent='Atualizando...';\n     try{\n      const resp=await fetch('/api/pedidos/solicitar',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({acao:'confirmar-pix-teste',numero:p.numero})});\n      const d=await resp.json();if(!resp.ok)throw Error(d.error||'Falha na confirmação');\n      await carregar();\n     }catch(e){msg.textContent=e.message;msg.className='erro';btn.disabled=false;}\n    };\n    card.append(btn,msg);\n   }\n   root.append(card);\n  }\n }catch(e){estado.textContent=e.message;estado.className='erro'}\n}\ndocument.getElementById('email-teste').addEventListener('click',async()=>{\n const botao=document.getElementById('email-teste'),status=document.getElementById('email-estado');\n botao.disabled=true;status.textContent='Enviando teste...';\n try{\n  const resp=await fetch('/api/pedidos/solicitar',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({acao:'enviar-email-teste'})});\n  const dados=await resp.json();if(!resp.ok)throw Error(dados.error||'Falha no envio.');\n  status.textContent='O Resend aceitou a mensagem para '+dados.destinatario+'. Verifique a caixa de entrada (e spam). Identificador: '+dados.resend_id;\n }catch(e){status.textContent=e.message;botao.disabled=false;}\n});\nasync function verificarPix(){\n const out=document.getElementById('pix-estado');\n try{\n  const resposta=await fetch('/api/pedidos/solicitar?pix=1',{credentials:'same-origin',cache:'no-store'});\n  if(!resposta.ok)throw Error('Não foi possível verificar a configuração.');\n  const data=await resposta.json();\n  const estados={\n   configurado:'Chave Pix CNPJ do Inter configurada e validada no servidor. Vendas reais ainda desativadas.',\n   variavel_ausente:'A variável PIX_INTER_CNPJ não está chegando ao servidor desta Preview. Verifique branch e redeploy.',\n   quantidade_digitos_incorreta:'A variável chegou ao servidor, mas não contém exatamente 14 dígitos numéricos de CNPJ.',\n   digitos_verificadores_invalidos:'A variável chegou ao servidor com 14 dígitos, mas o CNPJ não passou na validação dos dígitos verificadores.'\n  };\n  out.textContent=estados[data.diagnostico]||'Não foi possível identificar a situação da configuração Pix.';\n }catch(e){out.textContent=e.message;}\n}\nasync function verificarMercadoPago(){\n const out=document.getElementById('mp-estado');\n try{\n  const r=await fetch('/api/pedidos/solicitar?mercadopago=1',{credentials:'same-origin',cache:'no-store'});\n  if(!r.ok)throw Error('Diagnóstico de cartão indisponível.');\n  const d=await r.json();\n  out.textContent=d.teste_configurado?'Credencial de teste detectada. Checkout permanece desativado até integração e validação do webhook.':'Falta configurar MERCADO_PAGO_TEST_ACCESS_TOKEN na Preview. Checkout com cartão permanece desativado.';\n }catch(e){out.textContent=e.message;}\n}\nverificarPix();\nverificarMercadoPago();\ncarregar();\n</script></body></html>";
const cores=new Set(['azul','amarelo','preto','branco','rosa','vermelho']);
const fitas=new Set(['sem','azul','amarelo','preto','branco','verde','rosa']);
const ufs=new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
const text=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.trim().length<=max?s.trim():null;
function sameOrigin(req){
 const origin=req.headers.origin;
 if(!origin)return false;
 try{return new URL(origin).host===req.headers.host&&new URL(origin).protocol==='https:';}catch{return false;}
}
async function cotar(cep){
 let token=await accessToken();
 const run=()=>fetch('https://melhorenvio.com.br/api/v2/me/shipment/calculate',{
  method:'POST',headers:{Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json','User-Agent':'Pau DAlho (paudalhoideias@gmail.com)'},
  body:JSON.stringify({from:{postal_code:'08790200'},to:{postal_code:cep},package:{length:65,width:45,height:16,weight:9}}),
  signal:AbortSignal.timeout(10000),redirect:'error'
 });
 let response=await run();
 if(response.status===401){token=await accessToken(token);response=await run();}
 if(!response.ok)throw Error('freight unavailable');
 const data=await response.json();
 if(!Array.isArray(data))throw Error('freight unavailable');
 return data.filter(x=>x&&!x.error).flatMap(x=>{
  const price=x.custom_price??x.price,days=x.custom_delivery_time??x.delivery_time;
  if(!['string','number'].includes(typeof price)||String(price).trim()===''||!Number.isFinite(Number(price))||Number(price)<0||!Number.isFinite(Number(days))||Number(days)<0)return[];
  return [{nome:String(x.name||''),transportadora:String(x.company?.name||''),centavos:Math.round(Number(price)*100),prazo_dias:Number(days)}];
 });
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex,nofollow');
 if(!previewAllowed())return res.status(404).end();
 if(req.method==='GET'){
  if(!adminAllowed(req,res))return;
  if(req.query?.pix==='1')return res.status(200).json(pixPreview());
  if(req.query?.mercadopago==='1')return res.status(200).json(mercadoPagoTestStatus());
  if(req.query?.painel==='1'){
   res.setHeader('Content-Type','text/html; charset=utf-8');
   res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
   return res.status(200).end(ADMIN_HTML);
  }
  try{
   const pedidos=await listOrders();
   const enriquecidos=await Promise.all(pedidos.map(async p=>({...p,notificacoes:await statusNotificacoes(p.numero).catch(()=>({indisponivel:true}))})));
   return res.status(200).json({ambiente:'preview',aviso:'Pedidos de teste, sem cobrança. E-mails de simulação enviados somente à loja. Registros expiram em 7 dias.',quantidade:pedidos.length,pedidos:enriquecidos});
  }
  catch{return res.status(503).json({error:'Consulta de pedidos temporariamente indisponível.'});}
 }
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).end();}

 if(!sameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 if(req.body?.acao==='enviar-email-teste'){
  if(!adminAllowed(req,res))return;
  if(!resendConfigurado())return res.status(503).json({error:'RESEND_API_KEY não está disponível nesta publicação. Confira a variável na Preview e o redeploy.'});
  try{
   const enviado=await enviarEmail({
    destinatario:DESTINO_LOJA,
    assunto:'[TESTE] Pau D’Alho — notificações da loja',
    corpo:'Este é um e-mail de teste do checkout da Pau D’Alho.\n\nO domínio e o envio pelo Resend estão sendo validados.\n\nNENHUM PEDIDO FOI CRIADO. NENHUM PAGAMENTO FOI REALIZADO.\n\nVocê receberá notificações automáticas quando o fluxo de pedidos reais for habilitado e validado.',
    chaveIdempotencia:'paudalho-resend-preview-primeiro-teste-v1'
   });
   return res.status(200).json({enviado:true,ambiente:'preview',destinatario:DESTINO_LOJA,resend_id:enviado.id});
  }catch(e){
   return res.status(502).json({error:e.message||'Falha no envio de teste pelo Resend.'});
  }
 }
 if(req.body?.acao==='reenviar-notificacoes-teste'){
  if(!adminAllowed(req,res))return;
  const numero=req.body?.numero,evento=req.body?.evento;
  if(typeof numero!=='string'||!/^TESTE-\d{8}-[A-F0-9]{10}$/.test(numero)||!['recebido','pagamento'].includes(evento))return res.status(400).json({error:'Pedido ou notificação inválidos.'});
  try{
   const pedido=await getTestOrder(numero);
   if(!pedido)return res.status(404).json({error:'Pedido de teste não encontrado.'});
   if(evento==='pagamento'&&pedido.pagamento?.situacao!=='PAGAMENTO_CONFERIDO_TESTE')return res.status(409).json({error:'Ainda não houve conferência simulada do Pix.'});
   const notificacoes=await notificarPedidoTeste(pedido,evento);
   return res.status(200).json({numero,evento,situacao:notificacoes[evento]?.situacao||'em_processamento',ambiente:'preview'});
  }catch{return res.status(503).json({error:'Não foi possível repetir o envio. O pedido continua registrado.'});}
 }
 if(req.body?.acao==='confirmar-pix-teste'){
  if(!adminAllowed(req,res))return;
  const numero=req.body?.numero;
  if(typeof numero!=='string')return res.status(400).json({error:'Número do pedido inválido.'});
  try{
   const updated=await updateTestOrderStatus(numero,'PAGAMENTO_CONFERIDO_TESTE');
   if(!updated.found)return res.status(404).json({error:'Pedido de teste não encontrado.'});
   let notificacoes={};
   try{notificacoes=await notificarPedidoTeste(updated.order,'pagamento');}
   catch{notificacoes={indisponivel:true};}
   return res.status(200).json({numero,ambiente:'preview',situacao:updated.order.pagamento.situacao,confirmado_em_teste:updated.order.pagamento.confirmado_em_teste,producao_liberada:false,notificacoes:notificacoes.pagamento?.situacao||'indisponivel'});
  }catch{return res.status(409).json({error:'Não foi possível atualizar a situação do pedido de teste.'});}
 }

 const b=req.body||{},d=b.entrega||{},p=b.comprador||{},cfg=b.configuracao||{},f=b.frete||{};
 const nome=text(p.nome,120),email=text(p.email,200),telefone=text(p.telefone,25);
 const rua=text(d.rua,150),numero=text(d.numero,15),bairro=text(d.bairro,90),cidade=text(d.cidade,90),uf=text(d.uf,2),cep=typeof d.cep==='string'?d.cep.replace(/\D/g,''):null;
 const complemento=typeof d.complemento==='string'&&d.complemento.length<=100?d.complemento.trim():null;
 const fita=text(cfg.fita,20),revestimento=text(cfg.revestimento,20),lousa=text(cfg.lousa,3);
 if(!nome||!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!telefone||!rua||!numero||!bairro||!cidade||!ufs.has(uf)||!/^\d{8}$/.test(cep||'')||complemento===null||!['sim','nao'].includes(lousa)||!(revestimento==='nao'||cores.has(revestimento))||!(revestimento==='nao'?fitas.has(fita):fita===revestimento)||!['pix','cartao'].includes(b.metodo)||!text(f.nome,100)||!text(f.transportadora,100)||typeof b.idempotencia!=='string'||!/^[a-f0-9-]{36}$/i.test(b.idempotencia))
  return res.status(400).json({error:'Confira os dados do pedido e selecione Pix e frete válido.'});
 try{
  const limiter=await redis('EVAL',"local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n",1,'paudalho:pedidos:preview:limit');
  if(limiter>15)return res.status(429).json({error:'Muitas tentativas. Tente novamente em um minuto.'});
  if(!await quoteAllowed())return res.status(429).json({error:'Consultas de frete temporariamente limitadas.'});
  const servicos=await cotar(cep);
  const selected=servicos.find(x=>x.nome===f.nome&&x.transportadora===f.transportadora);
  if(!selected||!Number.isSafeInteger(f.preco_centavos)||selected.centavos!==f.preco_centavos)return res.status(409).json({error:'O valor ou a disponibilidade do frete mudou. Calcule novamente e revise o total antes de registrar.'});
  const preco=33000+(revestimento==='nao'?0:5000)+(lousa==='sim'?4000:0);
  const pedido={
   numero:orderId(),criado_em:new Date().toISOString(),ambiente:'preview',status:'TESTE_SEM_COBRANCA',
   comprador:{nome,email,telefone},entrega:{rua,numero,complemento,bairro,cidade,uf,cep},
   produto:'Torre 3 em 1',quantidade:1,configuracao:{fita,revestimento,lousa},
   pagamento:{metodo:b.metodo,situacao:b.metodo==='pix'?'AGUARDANDO_CONFERENCIA_TESTE':'CHECKOUT_SANDBOX_PENDENTE',banco:b.metodo==='pix'?'Inter':'Mercado Pago',comprovacao_manual:b.metodo==='pix'},
   historico:[{em:new Date().toISOString(),evento:'PEDIDO_DE_TESTE_REGISTRADO',descricao:'Pedido fictício registrado. Nenhum pagamento real solicitado.'}],
   valores:{produto_centavos:preco,frete_centavos:selected.centavos,total_centavos:preco+selected.centavos},
   frete:{transportadora:selected.transportadora,nome:selected.nome,prazo_dias:selected.prazo_dias,contratado:false},
   prazo_producao_dias_uteis:20
  };
  const saved=await storeOrder(pedido,b.idempotencia);
  if(saved.duplicate)return res.status(409).json({error:'Esta tentativa já foi recebida. Não envie novamente.',numero:saved.numero});
  let notificacoes={};
  try{notificacoes=await notificarPedidoTeste(pedido,'recebido');}
  catch{notificacoes={indisponivel:true};}
  if(b.metodo==='cartao'){
   // Mesmo que o Mercado Pago esteja indisponível, o pedido permanece registrado.
   // Nenhuma URL de produção é devolvida ao navegador.
   try{
    const origem='https://'+req.headers.host;
    const preferencia=await preferenciaCartaoTeste(pedido,origem);
    return res.status(201).json({numero:pedido.numero,ambiente:'preview',status:pedido.status,total_centavos:pedido.valores.total_centavos,registro_temporario:true,checkout_sandbox:preferencia.sandbox_url,preferencia_id:preferencia.preferencia_id,notificacoes:notificacoes.recebido?.situacao||'indisponivel',mensagem:'Pedido fictício registrado. Continue apenas no ambiente sandbox do Mercado Pago. Não utilize cartão verdadeiro.'});
   }catch(e){
    return res.status(201).json({numero:pedido.numero,ambiente:'preview',status:pedido.status,total_centavos:pedido.valores.total_centavos,registro_temporario:true,checkout_sandbox:null,erro_checkout:e.message,notificacoes:notificacoes.recebido?.situacao||'indisponivel',mensagem:'Pedido fictício registrado, mas o checkout sandbox não foi aberto. Nenhuma cobrança foi realizada.'});
   }
  }
  return res.status(201).json({numero:pedido.numero,ambiente:'preview',status:pedido.status,total_centavos:pedido.valores.total_centavos,frete_centavos:selected.centavos,registro_temporario:true,pagamento_iniciado:false,notificacoes:notificacoes.recebido?.situacao||'indisponivel',mensagem:'Pedido de TESTE registrado. E-mails de simulação somente para a loja. Nenhum Pix gerado; produção não autorizada.'});
 }catch{
  return res.status(503).json({error:'Não foi possível registrar o pedido de teste. Nenhuma cobrança foi realizada.'});
 }
}
