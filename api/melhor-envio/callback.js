// Etapa 1: retorno seguro, sem troca ou armazenamento de tokens.
// Antes da autenticação real, implementar criação e validação de state no servidor.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end('Método não permitido');
  }
  if (req.query.code || req.query.state || req.query.error) {
    // Não registrar nem exibir parâmetros sensíveis em logs ou HTML.
    return res.status(403).end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Integração em preparação</title><p>Autorização ainda não habilitada. Nenhuma credencial foi armazenada.</p></html>');
  }
  return res.status(200).end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Pau D\'Alho · Integração de frete</title><p>Rota de integração de frete disponível para testes técnicos. A autorização ainda não está habilitada.</p></html>');
}
