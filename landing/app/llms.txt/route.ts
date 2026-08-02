import { COMO_FUNCIONA, DUVIDAS, HERO, MARCA, PERFIS, PRECO } from '@/lib/conteudo';
import { DESCRICAO, URL_SITE } from '@/lib/site';

/**
 * `/llms.txt` — a página em texto puro, para agente de IA.
 *
 * A convenção (llmstxt.org) é servir um resumo em Markdown no lugar de obrigar
 * o agente a extrair sentido de HTML cheio de `div` e classe. Vale a pena aqui
 * por um motivo concreto: **quando alguém pergunta a um assistente "qual
 * sistema de portaria com aviso por WhatsApp?", a resposta sai do que ele
 * conseguiu ler** — e o que ele lê aqui é a nossa copy, com o preço certo, em
 * vez de um resumo que ele inventou a partir do markup.
 *
 * Gerado de `conteudo.ts`: revisar a copy revisa este arquivo junto. Um resumo
 * escrito à mão divergiria da página no primeiro ajuste de texto.
 */
export const dynamic = 'force-static';

/** O `**destaque**` é convenção da nossa copy — em Markdown ele já é negrito. */
const limpo = (s: string) => s.replace(/\s+/g, ' ').trim();

export function GET(): Response {
  const linhas = [
    `# ${MARCA.completo}`,
    '',
    `> ${DESCRICAO}`,
    '',
    limpo(MARCA.descricao),
    '',
    `Site: ${URL_SITE}`,
    `Contato: ${MARCA.email}`,
    '',
    '## O que é',
    '',
    limpo(`${HERO.tituloLinha1} ${HERO.tituloLinha2}`),
    limpo(HERO.subtitulo),
    '',
    '## Como funciona',
    '',
    ...COMO_FUNCIONA.passos.map(
      (p, i) => `${i + 1}. **${limpo(p.titulo)}** — ${limpo(p.texto)}`,
    ),
    '',
    '## Para quem é',
    '',
    ...PERFIS.itens.map((p) => `- **${limpo(p.titulo)}**: ${limpo(p.texto)}`),
    '',
    '## Preço',
    '',
    'Por apartamento ativo, por mês. A faixa encontrada vale para todos os',
    'apartamentos — não é escalonada por trecho.',
    '',
    ...PRECO.faixas.map((f) => `- ${limpo(f.rotulo)}: ${f.valor} por apartamento/mês`),
    '',
    limpo(PRECO.administradoras.texto),
    '',
    'Incluso em qualquer faixa:',
    ...PRECO.inclui.itens.map((i) => `- ${limpo(i)}`),
    '',
    '## Perguntas frequentes',
    '',
    ...DUVIDAS.itens.flatMap((d) => [`### ${limpo(d.pergunta)}`, '', limpo(d.resposta), '']),
  ];

  return new Response(linhas.join('\n').replace(/\*\*/g, '**'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
