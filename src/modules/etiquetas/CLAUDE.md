# Módulo: Etiquetas (leitura de etiqueta de entrega)

Ler a etiqueta do pacote com a câmera e preencher os campos da encomenda
sozinho, em vez de o porteiro digitar.

Duas frentes sobre o mesmo parser:

- **Portaria** (`POST /etiquetas/ler`): o porteiro fotografa, os campos que o
  parser entendeu já vêm preenchidos e ele completa o resto à mão.
- **Banco de amostras** (`/admin/etiquetas`, superadmin): mede o quanto o parser
  acerta contra etiquetas reais. É o que torna a melhoria mensurável em vez de
  achismo.

O parser ainda está em calibração — por isso a leitura **nunca salva sozinha**,
sempre preenche e pede confirmação.

## As três peças

```
câmera ──▶ prepararFoto() ──▶ serviço OCR (container `ocr`) ──▶ linhas de texto
           (reduz no celular)                                        │
                                                                     ▼
                                                       parser/ (regex, TypeScript)
                                                                     │
                                                                     ▼
                                     CamposEtiqueta {destinatario, bloco, ...}
```

| Peça | Onde | Papel |
|---|---|---|
| Preparo da foto | `web/src/lib/imagem.ts` | Reduz, recomprime e mede nitidez **antes** de subir |
| Serviço OCR | `ocr/` (Python, container à parte) | Imagem → linhas de texto. Não interpreta nada |
| `OcrService` | `ocr.service.ts` | Cliente HTTP do serviço acima |
| Parser | `parser/` | Linhas → campos. **É o que muda toda semana** |
| Banco de amostras | `admin-etiquetas.*` | Mede o parser contra etiquetas reais |

A separação entre OCR e parser é deliberada: trocar uma regex não pode
significar rebuildar a imagem do serviço de OCR.

## Rotas e perfis

### Portaria

| Rota | admin | sindico | porteiro |
|---|:---:|:---:|:---:|
| `POST /etiquetas/ler` (foto → campos preenchidos) | — | ✅ | ✅ |

**A administradora fica de fora de propósito.** Ela registra encomenda, mas a
leitura foi definida como ferramenta de quem está na portaria. Para liberar:
`@Roles` em `etiquetas.controller.ts` **e** `podeLerEtiqueta` em
`web/src/pages/NovaEncomenda.tsx` — os dois, senão ela vê o botão e toma 403.

Devolve `{ campos, apartamento, moradorId, moradorNome, linhasLidas }`. Tudo é
**sugestão**: a tela preenche o que veio, preserva o que o porteiro já digitou e
só grava depois da revisão.

### Banco de amostras

Todas `@Roles('superadmin')` — é ferramenta de plataforma, não de condomínio.

| Rota | O que faz |
|---|---|
| `GET /admin/etiquetas/status` | OCR configurado/no ar, versão do parser, contadores |
| `GET /admin/etiquetas/placar` | Acerto por campo e por transportadora (sem reprocessar) |
| `POST /admin/etiquetas/reprocessar` | Roda o parser atual em todas as amostras e devolve o placar |
| `POST /admin/etiquetas/reprocessar-ocr` | Baixa as fotos, **relê no OCR** e depois roda o parser |
| `POST /admin/etiquetas/amostras` | Upload em lote (até 20 fotos) → OCR → parser → grava |
| `GET /admin/etiquetas/amostras` | Lista (filtros `status`, `transportadora`) |
| `GET /admin/etiquetas/amostras/:id` | Detalhe, com as linhas do OCR |
| `PATCH /admin/etiquetas/amostras/:id` | Gabarito, rótulo de transportadora, observação |
| `DELETE /admin/etiquetas/amostras/:id` | Remoção lógica (`ativo = false`) |

Frontend: `web/src/pages/SuperAdminEtiquetas.tsx` (`/admin/etiquetas`).

## Dados

`etiqueta_amostras` (migration 026) é **tabela de plataforma**: `tenant_id` é
nulável, ao contrário da regra geral do projeto. Uma etiqueta da Shopee é igual
em qualquer condomínio, e o que se aprende com ela vale para todos — o
`tenant_id` guarda só a origem quando a amostra nasceu de uma leitura real.
Por isso `ON DELETE SET NULL`: apagar um condomínio não pode apagar o banco de
regressão.

`ocr_linhas` guarda a saída crua do OCR. É o que permite **reprocessar sem
reenviar a imagem** — cada leitura custa 1–3s de CPU, e reprocessar 200
amostras a cada ajuste de regex seria inviável.

## Regras da leitura na portaria

1. **Nada é sobrescrito.** Campo que o porteiro já preencheu fica como está — a
   leitura só completa o que está vazio.
2. **Três tentativas para achar a unidade**, nesta ordem: com o bloco lido, sem
   bloco, e — só quando existe **uma única** unidade com aquele número no
   condomínio inteiro — em qualquer bloco. A regra que vale é *nunca escolher
   entre várias*, e não *nunca olhar fora do bloco*: em condomínio de múltiplos
   blocos o mesmo número existe em vários e aí a busca devolve `null`, mas
   desistir quando não há ambiguidade nenhuma jogava fora o caso mais comum de
   todos — a etiqueta cujo bloco não saiu legível na foto.
3. **O número é testado em variações** (`302`, `0302`, `302-B`, `302B`): o
   cadastro guarda o que o síndico digitou e a etiqueta traz o que o remetente
   escreveu. Achou várias unidades numa variação, para ali — uma reescrita mais
   frouxa não pode devolver por acidente o que a forma lida rejeitou.
4. **Morador casa por quatro regras, sempre exigindo resultado único** e apenas
   entre os moradores daquela unidade: nome idêntico (normalizado, sem
   preposição nem pontuação), primeiro+último nome, todos os tokens lidos
   contidos no cadastro (`JOSE CARLOS SILVA` → `… SILVA JUNIOR`) e truncamento à
   direita (`MARIA APARECIDA SOU` → `… SOUZA`). Empate em qualquer uma devolve
   `null` e o porteiro escolhe — "Ana Silva" e "Ana Souza" moram no mesmo prédio.
5. **Sem unidade identificada, cai no cadastro manual** com bloco e número
   pré-preenchidos — nunca num apartamento "mais provável".
6. **A foto da etiqueta vira a foto do pacote** quando ainda não há nenhuma:
   é o registro do que chegou e evita fotografar duas vezes.
7. **A tela marca o que veio do OCR** (selo "lido" ao lado do campo). A leitura
   é sugestão, e na revisão o porteiro precisa saber onde olhar duas vezes sem
   contar de cabeça o que ele mesmo digitou.
8. **A leitura é cancelável.** Sem saída, uma leitura travada prendia o porteiro
   por até 30s com fila na frente — o botão aborta o upload e devolve o teclado.

## Regras do banco de amostras

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
8. **Mudança no OCR só aparece no placar via `reprocessar-ocr`.** O
   `reprocessar` barato roda apenas o parser sobre as linhas já gravadas — com
   ele, todo ajuste em `ocr/app.py` (pré-processamento, parâmetro do engine,
   ordenação) era literalmente imensurável, porque as linhas continuavam as
   antigas. O caro relê as fotos do bucket, e por isso é botão separado: 1 a 3s
   de CPU por amostra num container de worker único.
9. **Amostra cuja releitura falhar mantém as linhas antigas.** Perder o
   histórico por uma indisponibilidade momentânea destruiria justamente o caso
   de regressão que a amostra guarda.

## Decisões e armadilhas

**Por que OCR self-hosted e não modelo de visão.** Um modelo de visão leria a
etiqueta inteira e devolveria JSON interpretado, sem parser nenhum, e aguentaria
etiqueta amassada muito melhor. A escolha foi outra porque a etiqueta tem nome e
endereço do morador, e o projeto inteiro é self-hosted — nenhuma foto sai do
servidor. O preço disso é este módulo: o parser é nosso, e melhora na mão.

**Nenhuma regex do parser usa `\s`. Use `ESPACO`.** As linhas do OCR chegam
unidas por `' \n '` e `\s*` casa `\n`, então uma palavra-chave no fim de uma
linha capturava o primeiro número da linha **seguinte**: `QTD 1 UN` + `0,350 KG`
produzia `numero = 0` — e, como `String.match` devolve a primeira ocorrência do
blob, esse zero vencia o `APTO 51` verdadeiro impresso mais abaixo. Campo
preenchido com valor errado é o pior desfecho do módulo: ninguém confere o que
já veio preenchido. `ESPACO` (`[^\S\n]*`) é espaço que não atravessa a quebra.

**Marcador de linha se testa como palavra inteira, nunca com `includes`.**
`includes('CHAVE')` reprova "Maria Chaves Souza", `'PRACA'` reprova "Ana
Cristina Praça" e `'TOTAL'` reprova "Roberto Total Nunes" — nomes de moradores
reais que a etiqueta trazia certos e o parser jogava fora, caindo no fallback
global que é a rota para devolver o **remetente**. `testeDePalavras()` em
`parser/texto.ts` monta o `\b` para isso.

**Tipo de logradouro vale pela posição, não pela palavra.** `PRAÇA`, `LARGO` e
`CAMPOS` são sobrenomes brasileiros correntes. O que distingue "Ana Cristina
Praça" (moradora) de "Praça da Liberdade 50" (endereço) é que o logradouro abre
a linha e o sobrenome nunca — daí `RE_LOGRADOURO` ancorado em `^`.

**Razão social é um predicado próprio (`pareceEmpresa`), não mais um ruído.** Na
zona do remetente a diferença entre "não é nome de pessoa" e "é o nome de uma
empresa" decide tudo: a loja que enviou ocupa o lugar do nome do remetente, e o
primeiro nome de *pessoa* depois dela já é o destinatário. Sem isso, etiqueta
cujo remetente é "Loja Fulano ME" fazia o parser descartar o destinatário.

**Rótulo de destinatário encontrado e sem nome perto devolve `null`.** Cair na
varredura global ali seria pegar o primeiro nome da etiqueta — que, quando o
bloco do remetente vem antes (Shopee, Mercado Livre), é quem enviou.

**Marca própria vem antes de `Correios` na lista de transportadoras.** Etiqueta
de marketplace menciona "PAC" no rodapé porque usa os Correios como transporte
final; ela continua sendo do Mercado Livre. Ordem = precedência.

**O endpoint `/ocr` é `def`, não `async def`.** Como `async`, a inferência (0,5 a
2s de CPU) rodava dentro do event loop e o processo inteiro parava — inclusive o
`/health`, que com `timeout: 5s` marcava o container como unhealthy no meio de
um lote de amostras. Sendo síncrono, o FastAPI o joga num threadpool; quem
serializa a inferência é o semáforo `_LIMITE`.

**Passar um kwarg ao RapidOCR 1.4.x reseta os outros.** O `__call__` reconstrói o
postprocess do detector com os defaults do próprio método, então mandar só
`text_score` silenciosamente fixava `box_thresh=0.5` e `unclip_ratio=1.6`,
ignorando o config. Por isso `_rodar_ocr()` passa os três sempre juntos.

**`OCR_MAX_LADO` tem um espelho no cliente.** `web/src/lib/imagem.ts` reduz a
foto antes de subir porque o serviço descarta tudo acima desse teto na primeira
operação — os megabytes do sensor subiam pelo 4G da portaria só para serem
jogados fora. Mudou um lado, mude o outro: acima do teto é desperdício de rede,
abaixo é perder resolução que o reconhecedor usaria.

**Desenhar num canvas destrói o EXIF.** O OCR depende dele (`exif_transpose`)
para não receber metade das etiquetas deitadas; `imageOrientation: 'from-image'`
no `createImageBitmap` aplica a rotação nos pixels antes do desenho, que é o que
torna a perda do metadado inofensiva.

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
- [ ] Mexeu em `ocr/app.py` → rode `POST /admin/etiquetas/reprocessar-ocr`
      ("Reler tudo no OCR" na tela). O `reprocessar` normal **não** mede
      mudança de OCR: ele roda o parser sobre as linhas antigas.
- [ ] Mexeu em `OCR_MAX_LADO` → espelhe `MAX_LADO_OCR` em
      `web/src/lib/imagem.ts`, e vice-versa.
- [ ] Regex nova no parser → use `ESPACO`/`SEP`, nunca `\s`. Veja a primeira
      entrada de "Decisões e armadilhas".
- [ ] Amostra real quebrou o parser → traga o caso para
      `parser/etiqueta-parser.spec.ts` **antes** de consertar a regex.
- [ ] Transportadora nova → `parser/transportadoras.ts`, e olhe o primo no front
      (`web/src/pages/NovaEncomenda.tsx`), que roda sobre QR/código de barras.
- [ ] Campo novo em `CamposEtiqueta` → entidade, `CAMPOS_ETIQUETA` (back e
      front), DTO do gabarito e a tela de conferência. O placar se ajusta sozinho.
- [ ] Trocou versão do `rapidocr-onnxruntime` → confira `_normalizar_saida` em
      `ocr/app.py`. Está travado em 1.4.x: a linha seguinte mudou de nome de
      pacote (`rapidocr`) e de API, e a quebra é silenciosa (zero linhas).
