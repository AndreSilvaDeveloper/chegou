# Módulo: Etiquetas (leitura de etiqueta de entrega)

Ler a etiqueta do pacote com a câmera e preencher os campos da encomenda
sozinho, em vez de o porteiro digitar.

**Estado atual: só o banco de amostras.** A leitura na portaria ainda não
existe — ela depende de o parser acertar, e o parser só acerta depois de ver
etiqueta real. Este módulo é a ferramenta que torna isso mensurável.

## As três peças

```
foto ──▶ serviço OCR (container `ocr`) ──▶ linhas de texto
                                              │
                                              ▼
                                    parser/ (regex, TypeScript)
                                              │
                                              ▼
                              CamposEtiqueta {destinatario, bloco, ...}
```

| Peça | Onde | Papel |
|---|---|---|
| Serviço OCR | `ocr/` (Python, container à parte) | Imagem → linhas de texto. Não interpreta nada |
| `OcrService` | `ocr.service.ts` | Cliente HTTP do serviço acima |
| Parser | `parser/` | Linhas → campos. **É o que muda toda semana** |
| Banco de amostras | `admin-etiquetas.*` | Mede o parser contra etiquetas reais |

A separação entre OCR e parser é deliberada: trocar uma regex não pode
significar rebuildar uma imagem Python de 2 GB.

## Rotas e perfis

Todas `@Roles('superadmin')` — é ferramenta de plataforma, não de condomínio.

| Rota | O que faz |
|---|---|
| `GET /admin/etiquetas/status` | OCR configurado/no ar, versão do parser, contadores |
| `GET /admin/etiquetas/placar` | Acerto por campo e por transportadora (sem reprocessar) |
| `POST /admin/etiquetas/reprocessar` | Roda o parser atual em todas as amostras e devolve o placar |
| `POST /admin/etiquetas/amostras` | Upload em lote (até 20 fotos) → OCR → parser → grava |
| `GET /admin/etiquetas/amostras` | Lista (filtros `status`, `transportadora`) |
| `GET /admin/etiquetas/amostras/:id` | Detalhe, com as linhas do OCR |
| `PATCH /admin/etiquetas/amostras/:id` | Gabarito, rótulo de transportadora, observação |
| `DELETE /admin/etiquetas/amostras/:id` | Remoção lógica (`ativo = false`) |

Frontend: `web/src/pages/SuperAdminEtiquetas.tsx` (`/admin/etiquetas`).

## Dados

`etiqueta_amostras` (migration 025) é **tabela de plataforma**: `tenant_id` é
nulável, ao contrário da regra geral do projeto. Uma etiqueta da Shopee é igual
em qualquer condomínio, e o que se aprende com ela vale para todos — o
`tenant_id` guarda só a origem quando a amostra nasceu de uma leitura real.
Por isso `ON DELETE SET NULL`: apagar um condomínio não pode apagar o banco de
regressão.

`ocr_linhas` guarda a saída crua do OCR. É o que permite **reprocessar sem
reenviar a imagem** — cada leitura custa 1–3s de CPU, e reprocessar 200
amostras a cada ajuste de regex seria inviável.

## Regras de negócio

1. **O placar só conta amostra com gabarito.** Sem isso ele despencaria toda vez
   que alguém subisse fotos novas, e ninguém confiaria no número.
2. **Acertar que o campo é vazio é acerto.** Etiqueta sem bloco é comum, e o
   parser que não inventa um bloco está certo. Por isso o gabarito grava as 7
   chaves sempre, com `null` explícito — "campo ausente" e "campo vazio" não
   podem virar a mesma coisa.
3. **Falha de um arquivo não derruba o lote.** Quem subiu 20 fotos quer as 19
   que deram certo, e saber qual falhou.
4. **Foto órfã é limpa quando o OCR falha** — a imagem sobe antes da leitura;
   sem o rollback, cada erro deixaria lixo pago no bucket.
5. **Remoção é lógica e a foto fica.** Amostra apagada por engano volta com um
   booleano; um JPEG custa menos que perder um caso de regressão.
6. **`PARSER_VERSAO` sobe a cada mudança de regra** (`parser/etiqueta-parser.ts`).
   É o que permite dizer "a v3 melhorou o bloco e piorou o destinatário" em vez
   de discutir de memória.
7. **Sem `OCR_BASE_URL` o módulo responde 503 e o resto da API não sente.** O
   container de OCR é o mais pesado da stack e precisa poder ficar de fora.

## Decisões e armadilhas

**Por que OCR self-hosted e não modelo de visão.** Um modelo de visão leria a
etiqueta inteira e devolveria JSON interpretado, sem parser nenhum, e aguentaria
etiqueta amassada muito melhor. A escolha foi outra porque a etiqueta tem nome e
endereço do morador, e o projeto inteiro é self-hosted — nenhuma foto sai do
servidor. O preço disso é este módulo: o parser é nosso, e melhora na mão.

**`\b` depois da palavra-chave de bloco, mas não da de unidade.** Bloco aceita
letra como valor, então sem o boundary `TRANSPORTADORA` casa `TR` + `ANSP`.
Unidade tem valor numérico, e é justamente a ausência do boundary que faz
`APTO 302`, `AP.302` e `AP302` casarem igual. Tem teste para os dois.

**A zona do remetente não é uma janela de N linhas.** Bloco de remetente tem
tamanho variável (com ou sem endereço, CNPJ, telefone): janela fixa ora engole o
destinatário, ora deixa o remetente passar. A regra é "o primeiro nome de pessoa
depois de REMETENTE é o remetente" — e só esse é descartado.

**Conserto de OCR só em trecho de formato rígido.** `digitosProvaveis` /
`letrasProvaveis` (`parser/texto.ts`) transformariam `BLOCO` em `8L0C0` se
aplicados em texto livre. Só são usados no código dos Correios, cujo formato
(2 letras + 9 dígitos + 2 letras) diz posição por posição o que é o quê.

**O nome escrito vale mais que o formato do código.** Uma etiqueta da Shopee
pode carregar um objeto postado nos Correios; quem manda é o que está escrito.

## Ao alterar este módulo

- [ ] Mexeu em regex do parser → **suba `PARSER_VERSAO`**, rode
      `POST /admin/etiquetas/reprocessar` e compare o placar antes/depois.
- [ ] Amostra real quebrou o parser → traga o caso para
      `parser/etiqueta-parser.spec.ts` **antes** de consertar a regex.
- [ ] Transportadora nova → `parser/transportadoras.ts`, e olhe o primo no front
      (`web/src/pages/NovaEncomenda.tsx`), que roda sobre QR/código de barras.
- [ ] Campo novo em `CamposEtiqueta` → entidade, `CAMPOS_ETIQUETA` (back e
      front), DTO do gabarito e a tela de conferência. O placar se ajusta sozinho.
- [ ] Trocou versão do `paddleocr` → confira `_normalizar_saida` em `ocr/app.py`;
      a 3.x mudou o formato de retorno e a quebra é silenciosa (zero linhas).
