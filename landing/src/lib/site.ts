import { DUVIDAS, MARCA, PRECO } from './conteudo';

/**
 * Os dados que existem para **máquinas**, não para o visitante.
 *
 * Buscador e agente de IA não leem a página como gente: eles leem o `<head>`,
 * o JSON-LD e o `llms.txt`. Este arquivo é a única fonte desses três — se o
 * texto muda em `conteudo.ts`, a resposta que o agente dá muda junto, sem
 * ninguém precisar lembrar de atualizar um segundo lugar.
 */

/**
 * A URL canônica do site.
 *
 * Vem de env para o preview e o ambiente local não anunciarem que são o site
 * de produção — canônica errada é a forma mais rápida de o Google indexar o
 * ambiente errado.
 */
export const URL_SITE = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://chegou.bellory.com.br'
).replace(/\/+$/, '');

export const TITULO = `${MARCA.completo} — a encomenda chegou, o morador já sabe`;

export const DESCRICAO =
  'O porteiro registra a encomenda em segundos. O morador recebe no WhatsApp do ' +
  'próprio condomínio, com um código de 4 dígitos. Ninguém baixa aplicativo nenhum.';

/** O que a página quer responder. Vira `keywords` e guia o texto do `llms.txt`. */
export const TERMOS = [
  'controle de encomendas para condomínio',
  'sistema de portaria',
  'notificação de encomenda por WhatsApp',
  'software para síndico',
  'gestão de condomínio',
  'aviso de encomenda para morador',
  'administradora de condomínios',
] as const;

/**
 * Structured data (schema.org), em JSON-LD.
 *
 * Três tipos, e cada um responde uma pergunta diferente:
 *
 * - `SoftwareApplication` + `Offer`: **o que é e quanto custa**. É o que
 *   permite ao buscador mostrar preço direto no resultado.
 * - `FAQPage`: as dúvidas viram resposta direta na busca e na resposta de um
 *   agente. Sai de `DUVIDAS`, então revisar a copy revisa o dado estruturado.
 * - `Organization`: quem publica — o que amarra marca, site e contato.
 *
 * O preço aqui **é o mesmo de `PRECO.faixas`**: publicar um número no
 * structured data e outro na página é o tipo de divergência que o buscador
 * penaliza e o cliente descobre na fatura.
 */
export function dadosEstruturados(): object {
  const menorPreco = PRECO.faixas
    .map((f) => Number(f.valor.replace(/[^\d,]/g, '').replace(',', '.')))
    .sort((a, b) => a - b)[0];

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        '@id': `${URL_SITE}/#software`,
        name: MARCA.completo,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description: DESCRICAO,
        url: URL_SITE,
        inLanguage: 'pt-BR',
        offers: {
          '@type': 'Offer',
          price: menorPreco,
          priceCurrency: 'BRL',
          priceSpecification: {
            '@type': 'UnitPriceSpecification',
            price: menorPreco,
            priceCurrency: 'BRL',
            unitText: 'por apartamento/mês',
          },
        },
      },
      {
        '@type': 'Organization',
        '@id': `${URL_SITE}/#organizacao`,
        name: MARCA.completo,
        url: URL_SITE,
        description: MARCA.descricao,
        email: MARCA.email,
        areaServed: { '@type': 'Country', name: 'Brasil' },
      },
      {
        '@type': 'FAQPage',
        '@id': `${URL_SITE}/#duvidas`,
        mainEntity: DUVIDAS.itens.map((item) => ({
          '@type': 'Question',
          name: item.pergunta,
          acceptedAnswer: {
            '@type': 'Answer',
            // O `**destaque**` é convenção da nossa copy; para a máquina é ruído.
            text: item.resposta.replace(/\*\*/g, ''),
          },
        })),
      },
    ],
  };
}
