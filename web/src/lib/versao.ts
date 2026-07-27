/**
 * Versão do app rodando neste navegador.
 *
 * Vem de `web/package.json` e é injetada no build pelo `define` do Vite
 * (ver `web/vite.config.ts`). Em dev vale a versão do package.json também —
 * então o que aparece na sidebar é sempre o que está no repositório.
 */
export const APP_VERSION: string = __APP_VERSION__;

/** Guarda a última versão vista, para avisar o usuário depois que ela troca. */
export const CHAVE_VERSAO = 'chegou.versao';
