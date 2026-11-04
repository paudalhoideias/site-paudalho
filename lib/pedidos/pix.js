// Chave Pix CNPJ do Inter: configurada no servidor, nunca no repositorio.
function digitosCnpj(value){return typeof value==='string'?value.replace(/\D/g,''):'';}
export function cnpjValido(value){
 const v=digitosCnpj(value);
 if(!/^\d{14}$/.test(v)||/^(\d)\1{13}$/.test(v))return false;
 function verificador(base,pesos){
  const soma=pesoSoma(base,pesos);
  const resto=soma%11;
  return resto<2?0:11-resto;
 }
 function pesoSoma(base,pesos){return [...base].reduce((s,n,i)=>s+Number(n)*pesos[i],0);}
 const primeiro=verificador(v.slice(0,12),[5,4,3,2,9,8,7,6,5,4,3,2]);
 const segundo=verificador(v.slice(0,13),[6,5,4,3,2,9,8,7,6,5,4,3,2]);
 return primeiro===Number(v[12])&&segundo===Number(v[13]);
}
export function pixConfigured(){
 return cnpjValido(process.env.PIX_INTER_CNPJ||'');
}
export function pixPreview(){
 const configured=pixConfigured();
 // Nunca mostrar uma chave de recebimento real para pedidos ficticios.
 return {banco:'Inter PJ',tipo_chave:'CNPJ',configurado:configured,ambiente:'preview',chave_exibida:false,pagamento_real_habilitado:false};
}
