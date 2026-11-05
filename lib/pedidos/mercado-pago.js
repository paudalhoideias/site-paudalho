// Checkout Pro do Mercado Pago via Orders API (fluxo recomendado).
// Integração bloqueada até credenciais de TESTE e verificação do ciclo de pagamento.
export const mercadoPagoTestStatus=()=>{
 const token=process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN||'';
 const temTeste=Boolean(token);
 const production=process.env.MERCADO_PAGO_ACCESS_TOKEN||'';
 return {
  integracao:'Checkout Pro via Orders API',
  ambiente:'preview',
  teste_configurado:temTeste,
  credencial_producao_presente:Boolean(production),
  checkout_habilitado:false,
  webhook_validado:false,
  cobranca_real_habilitada:false
 };
};
export function bodyCheckoutProTeste(pedido){
 if(!pedido||pedido.ambiente!=='preview'||pedido.status!=='TESTE_SEM_COBRANCA')throw Error('Pedido de teste inválido');
 if(pedido.pagamento?.metodo!=='cartao')throw Error('Pagamento de teste não é cartão');
 const centavos=pedido.valores?.total_centavos;
 if(!Number.isSafeInteger(centavos)||centavos<=0)throw Error('Valor do pedido inválido');
 return {
  type:'online',
  processing_mode:'manual',
  external_reference:pedido.numero,
  total_amount:(centavos/100).toFixed(2),
  description:'Pau D’Alho — Torre 3 em 1',
  country_code:'BRA'
 };
}
