# Módulo: Condomínio

O condomínio visto de dentro (`/meu-condominio`, o síndico) e o condomínio
**em números** (`ResumoCondominioService`), que é como quem está de fora — a
administradora e o superadmin — o enxerga sem precisar entrar nele.

Duas coisas na mesma pasta porque as duas respondem "o que é este condomínio?".
O que muda é quem pergunta.

## Rotas e perfis

| Rota | Perfil | O que faz |
|---|---|---|
| `GET /meu-condominio` | `sindico` | O condomínio da sessão |
| `PATCH /meu-condominio` | `sindico` | Cadastro, endereço e o operacional do `config_json` |

**Nenhuma rota daqui recebe o id do condomínio** — ele vem do `TenantScopeGuard`
(`@TenantId()`), que para o síndico o resolve pelo vínculo do usuário. Não
existe id para adulterar na URL; é o mesmo desenho de `/minha-administradora`.

O `ResumoCondominioService` **não tem rota própria**. Quem o expõe é quem já
resolveu o acesso:

| Rota | Perfil | Onde mora |
|---|---|---|
| `GET /minha-administradora/resumo` | `admin` | `AdministradorasService.resumoDaCarteira` |
| `GET /admin/tenants/:id/resumo` | `superadmin` | `AdminTenantManagementController` |

## `ResumoCondominioService` — o condomínio em números

Uma família de número por consulta agregada, com `GROUP BY tenant_id`, para
**todos** os condomínios pedidos de uma vez:

| Família | Vem de | Recorte |
|---|---|---|
| Unidades | `apartamentos` | ativos |
| Moradores e cobertura | `moradores` | ativos; cobertura = com telefone **e** `receber_whatsapp` |
| Encomendas | `encomendas` | mês atual, mês anterior, aguardando/notificado, tempo médio (30 dias) |
| WhatsApp | `whatsapp_messages` + `tenants` | saídas dos últimos 7 dias; status da coluna `whatsapp_status` |

Quatro decisões que não são detalhe:

1. **Ele não decide quem pode ver o quê.** Só responde sobre os ids que recebeu,
   e nunca busca "todos". Quem resolve o acesso é quem chama — a carteira, no
   caso da administradora; a plataforma, no do superadmin. Foi assim que a
   mesma peça pôde servir aos dois perfis sem virar um caminho lateral.
2. **A assinatura fica de fora.** Quanto um condomínio custa depende de **quem
   paga por ele**, e isso é do `AssinaturasService`. Aqui só entra o que é do
   condomínio em si. Cada chamador junta o valor da fonte certa: a carteira usa
   `previaDaAdministradora().resultado.itens`, o superadmin usa
   `contaDoCondominio().participacaoAtual`.
3. **O status do WhatsApp sai da coluna, não do gateway.** Perguntar ao OpenWA
   seria uma chamada HTTP por condomínio numa tela que lista a carteira inteira;
   o `OpenwaService` já grava `tenants.whatsapp_status` a cada mudança de estado.
   O preço é que o valor pode estar velho — aceitável para um resumo, e a tela
   do WhatsApp continua sendo a fonte ao vivo.
4. **Condomínio sem dado nenhum vira zero, não ausência.** O `GROUP BY` não
   devolve linha para quem não tem registro, então o mapa nasce preenchido com
   `resumoVazio()`. Devolver "sem chave" faria a tela mostrar traço onde o certo
   é `0` — e "sem informação" e "nenhuma encomenda" são coisas diferentes para
   quem está decidindo em qual condomínio entrar.

As fronteiras de dia e mês vêm de `src/common/fuso-brasil.ts`, o mesmo arquivo
que o dashboard de encomendas usa. **Não recalcule "início do mês" aqui**: era
disso que vinham dois números diferentes para a mesma pergunta.

## O que o síndico edita

`PATCH /meu-condominio` — cadastro (nome, documento, contatos e o endereço
completo, de `EnderecoDto`) e, em `configJson`, **só o operacional**. Plano,
`ativo`, `slug` e os módulos contratados são decisão comercial e não estão
declarados no DTO: o `forbidNonWhitelisted` do `ValidationPipe` responde **400**,
sem depender de ninguém lembrar de filtrar.

O merge é o `mesclarConfigOperacional` desta pasta — o **mesmo** que a
administradora usa. Ele mora aqui, e não dentro de um dos dois services, porque
as duas armadilhas são de segurança:

1. **Chave `undefined` fica de fora.** O `class-transformer` materializa todo
   campo do DTO, mesmo os que não vieram; espalhar o DTO cru apagaria os módulos
   e os modelos de mensagem, porque o JSONB descarta `undefined`.
2. **A janela de envio é validada como par.** Cada horário sozinho passa no
   regex do DTO; quem diz se a janela é válida são os dois juntos, e ela precisa
   caber na faixa anti-bloqueio (08:00–21:00). Sem essa checagem, esta rota
   seria o caminho alternativo para enviar de madrugada.

Salvar `configJson` **invalida o `TenantConfigService`**: `estruturaBlocos`
decide se o cadastro de unidade exige bloco, e sem invalidar o próprio síndico
que acabou de salvar continuaria vendo o formulário antigo. Endereço alterado
agenda a geocodificação (`FilaGeocodificacaoService`), e **só quando mudou de
verdade** — a tela manda o endereço inteiro a cada salvamento.

## Frontend

- `web/src/pages/ConfiguracoesCondominio.tsx` — a tela do síndico.
- `web/src/components/condominio/condominio-numeros.tsx` — os números na tela:
  `camposDoResumo()` (os campos do `ListCard` na carteira) e
  `NumerosDoCondominio` (a faixa de indicadores do superadmin). Rótulo, tradução
  do status do WhatsApp e formatação de tempo ficam **num arquivo só**, pelo
  mesmo motivo que o estado da encomenda ficou: mesmo dado com dois textos é
  como as telas divergem.

## Ao alterar este módulo

- [ ] Número novo no resumo? Ele entra na **consulta agregada existente**, não
      numa consulta por condomínio — a carteira pode ter dezenas.
- [ ] Recorte por data? Use `src/common/fuso-brasil.ts`. Nunca escreva
      `-03:00` nem `date_trunc` com fuso à mão numa tela nova.
- [ ] Rota nova que exponha o resumo? Ela precisa resolver o acesso **antes** de
      chamar o serviço — ele confia nos ids que recebe.
- [ ] Campo novo em `configJson` que o síndico possa editar? Declare no
      `AtualizarMeuCondominioDto`, e só se descrever o condomínio (não o
      contrato). Na dúvida, pergunte.
- [ ] Mexeu no `mesclarConfigOperacional`? Ele é compartilhado com a
      administradora — rode `npm run test:e2e`.
