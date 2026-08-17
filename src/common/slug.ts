/**
 * O slug do condomínio — derivado do nome, **nunca digitado pelo usuário**.
 *
 * Ele não é enfeite de URL: é o nome da sessão do condomínio no gateway de
 * WhatsApp (`{OPENWA_SESSION_PREFIX}-{slug}`), e por isso não se troca depois de
 * criado. Pedi-lo num formulário sempre foi estranho — o superadmin não tem como
 * saber qual está livre, e a administradora não tem por que saber o que é um
 * slug. Quem sabe se ele está livre é o banco, então quem o gera é o servidor.
 */

/** Sufixo de desempate: **letras**, para o slug inteiro seguir sem números. */
export function sufixoAleatorio(tamanho = 4): string {
  const letras = 'abcdefghijklmnopqrstuvwxyz';
  let saida = '';
  for (let i = 0; i < tamanho; i++) {
    saida += letras[Math.floor(Math.random() * letras.length)];
  }
  return saida;
}

/**
 * Nome → slug: sem acento, sem número, sem caractere especial.
 *
 * O `normalize('NFD')` separa a letra da marca de acento (`é` vira `e` + U+0301)
 * e a linha seguinte **descarta a marca**. Os dois passos são necessários: sem o
 * descarte explícito, a marca cairia no `[^a-z]` e viraria separador, partindo a
 * palavra ao meio — "Condomínio" produzia `condomi-nio`. Só não aparecia em
 * "José" e "Ipê", onde o acento está na última letra e o hífen extra é aparado
 * na ponta. É o tipo de bug que passa no teste fácil e estraga o nome real.
 *
 * Tudo que não é letra vira separador — inclusive dígito. "Residencial Aurora
 * II" e "Ed. 33 Andares" viram `residencial-aurora` e `ed-andares`; o desempate
 * de quem colidir é o sufixo aleatório, não o número que estava no nome (dois
 * condomínios "Bloco 1" e "Bloco 2" gerariam o mesmo slug de qualquer forma).
 *
 * Devolve **string vazia** quando não sobra nada aproveitável (nome só com
 * números, por exemplo). Quem chama decide o que fazer — aqui não há palpite
 * possível.
 */
export function slugDoNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * A base do slug, já no tamanho que o formato aceita (3 a 80).
 *
 * Corta em 70 para sobrar espaço ao `-xxxx` do desempate, e completa com letras
 * aleatórias o que for curto demais — "Ipê" produz `ipe` e passa, mas "A2"
 * produziria `a`, que o formato recusa.
 */
export function baseDeSlug(nome: string): string {
  const bruto = slugDoNome(nome).slice(0, 70);
  if (bruto.length >= 3) return bruto;
  return `${bruto ? `${bruto}-` : ''}${sufixoAleatorio(4)}`;
}
