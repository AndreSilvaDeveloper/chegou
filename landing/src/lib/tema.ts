/**
 * O tema claro/escuro, na parte que **o servidor também precisa conhecer**.
 *
 * O hook `use-tema` roda no navegador; este arquivo existe porque o `layout`
 * (Server Component) precisa da mesma chave para escrever o script que aplica
 * a escolha antes da primeira pintura. Duas cópias da string `condoavisa.tema`
 * é como as duas metades passam a discordar em silêncio.
 */

export type Tema = 'light' | 'dark';

/** Onde a escolha da pessoa fica guardada entre uma visita e outra. */
export const CHAVE_TEMA = 'condoavisa.tema';

/**
 * Script **bloqueante**, injetado no `<head>` antes de qualquer pintura.
 *
 * Por que ele existe: o HTML da landing nasce no build, igual para todo mundo,
 * e nele não há `data-theme` — o navegador começa pelo
 * `@media (prefers-color-scheme)` dos tokens. Para quem escolheu o tema
 * *contrário* ao do sistema, isso é um flash da cor errada até o React hidratar
 * e corrigir. Aplicar o atributo aqui, síncrono e antes do `<body>`, é o que
 * mata o flash — é o único lugar do código que roda cedo o bastante.
 *
 * Fica em uma linha e sem dependência de propósito: ele bloqueia a renderização.
 */
export const SCRIPT_TEMA = `try{var t=localStorage.getItem(${JSON.stringify(
  CHAVE_TEMA,
)});if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
