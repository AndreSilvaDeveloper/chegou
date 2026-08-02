/**
 * Caminho de um arquivo de `web/public/`, já com o prefixo onde o painel mora.
 *
 * POR QUE ISTO EXISTE: o painel é servido em **`/app/`**, não na raiz do
 * domínio — a raiz é a landing. Um `src="/logo-mark.png"` escrito à mão aponta
 * para `chegou.bellory.com.br/logo-mark.png`, que o nginx entrega à landing, e
 * o resultado é 404 e imagem quebrada. O arquivo mora em `/app/logo-mark.png`.
 *
 * A armadilha é que **o Vite conserta quase tudo, menos isto**. Ele reescreve
 * os caminhos do `index.html` e de qualquer asset que passe por `import`, mas
 * uma string literal dentro do JSX ele não tem como enxergar — o build passa,
 * o `tsc` passa, e a imagem só quebra no ar. Foi assim que o logo do login e
 * do menu quebrou depois da migração para `/app/`.
 *
 * `BASE_URL` é o `base` do Vite: `/app/` no build e `/` no dev sem proxy —
 * então funciona nos dois sem `if`. É o mesmo mecanismo que o
 * `QrAutocadastroDialog` usa para montar o link do QR.
 *
 * @example
 * <img src={asset('logo-mark.png')} alt="Chegou" />
 */
export function asset(caminho: string): string {
  // A barra da frente é opcional na chamada: `BASE_URL` já termina em `/`, e
  // duas barras seguidas viram uma URL diferente para o cache do navegador.
  return `${import.meta.env.BASE_URL}${caminho.replace(/^\/+/, '')}`;
}
