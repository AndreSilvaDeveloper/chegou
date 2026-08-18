# Módulo: Vagas de garagem

Módulo **opcional** (`@RequiresModule('vagas')`): só funciona em condomínio que
tem `moduloVagas: true` no `config_json`. Quem liga é o superadmin — **ou quem
cadastra o condomínio, no passo 4 do wizard**, que é a única porta pela qual a
administradora o alcança (ver [Administradoras](../administradoras/CLAUDE.md));
depois de criado, mexer nele volta a ser da plataforma. Cobre o
cadastro das vagas, a locação avulsa e a cobrança mensal.

## Rotas e perfis

Todas exigem o módulo habilitado.

| Rota | admin | sindico | porteiro |
|---|:---:|:---:|:---:|
| `GET /vagas`, `GET /vagas/:id` | ✅ | ✅ | ✅ |
| `GET /vagas/:id/historico` (contratos + cobranças + pagamentos) | ✅ | ✅ | — |
| `GET /vagas/disponiveis` (pool de locação) | ✅ | ✅ | — |
| `POST/PATCH/DELETE /vagas` | ✅ | ✅ | — |
| `GET/POST/PATCH /vagas-locacao`, `POST :id/encerrar` | ✅ | ✅ | — |
| `POST/DELETE /vagas-locacao/:id/contrato` | ✅ | ✅ | — |
| `GET/PUT /vagas-precos` | ✅ | ✅ | — |
| `GET /vagas-cobrancas`, `/resumo`, `/:id` | ✅ | ✅ | — |
| `POST /vagas-cobrancas/gerar`, `:id/enviar`, `:id/pagar`, `:id/cancelar` | ✅ | ✅ | — |

O porteiro só consulta ("de quem é a vaga 12?"). Superadmin não entra aqui — se
precisar, usa as rotas de suporte em `/admin/tenants/:id/...`.

## Dados

| Tabela | Papel |
|---|---|
| `vagas` | A vaga física: `numero`, `tipo` (carro/moto/grande/pcd), `localizacao`, `apartamento_id` |
| `vagas_locacao` | Contrato: locatário, `valor_mensal`, `dia_vencimento`, período, contrato anexado |
| `vagas_precos` | PK `(tenant_id, tipo)` — preço sugerido por tipo |
| `vagas_cobrancas` | Uma linha por locação por competência (mês) |

`situacao` e `alugavel` da vaga **não existem no banco**: são derivados em
`VagasService.decorar()` a partir de `ativo`, `apartamento_id` e das locações
vigentes.

## Regras de negócio

1. **Vaga vinculada a apartamento é da unidade e não pode ser alugada.** É a
   regra central do módulo — o pool de locação é só `apartamento_id IS NULL`,
   ativo e sem contrato vigente. A vaga é **do apartamento**: o morador vai
   embora e ela fica com a unidade.
2. **Uma locação vigente por vaga.** Garantido pelo índice parcial
   `uq_vagas_locacao_vaga_vigente` (status `ativa` ou `inadimplente`), além da
   checagem no service: o índice pega duas requests simultâneas.
3. **Locatário é morador OU pessoa externa.** Externo guarda nome/documento/
   contato na própria locação e **precisa de telefone ou e-mail** — é por onde a
   cobrança vai. CHECK no banco (`chk_vagas_locacao_locatario`).
4. **Trocar de vaga exige encerrar e abrir outro contrato** — o histórico de
   cobrança fica preso ao contrato.
5. **Preço é sugestão.** O valor cobrado é o gravado na locação; reajustar a
   tabela não mexe em contrato vigente.
6. **Gerar cobrança é idempotente**: rodar de novo na mesma competência não
   duplica (`orIgnore` + unicidade). Locação que não pode ser cobrada volta em
   `ignoradas`, com motivo — o síndico precisa saber por quê.
7. **Cobrança vencida vira `vencida` sozinha** na consulta (`atualizarVencidas`),
   não por job.
8. **Envio de cobrança passa pela fila** de notificações — herda janela de
   horário e ritmo anti-bloqueio.

### Histórico (o que sobrevive ao fim do contrato)

9. **Encerrar contrato não perdoa dívida.** Cobrança não paga continua em
   aberto, aparece no histórico da vaga e soma no relatório.
10. **O nome de quem alugou fica gravado no contrato** (`locatario_nome`),
    inclusive quando o locatário é morador. `morador_id` é `ON DELETE SET NULL`:
    sem esse registro, remover o morador deixaria o histórico financeiro sem
    dono identificável. Para exibição, o nome vivo do morador tem preferência —
    o gravado é a rede de segurança.
11. **As FKs protegem o histórico**: `vagas_locacao.vaga_id` e
    `vagas_cobrancas.locacao_id` são `ON DELETE RESTRICT` (migration 022).
    Apagar vaga com contrato é erro; o caminho é desativar (`ativo = false`).
    O `CASCADE` por `tenant_id` continua — excluir o condomínio limpa tudo dele.
12. **Vaga desativada mantém o histórico acessível** — a rota de histórico não
    filtra por `ativo`.
13. **Cobrança cancelada não entra em nenhum total**: não foi cobrada e não é
    dívida.

## O vínculo com o apartamento é operado de fora

A tela de **Apartamentos** cadastra e vincula vagas da unidade. Para que a regra
não fosse reescrita lá, o `VagasService` expõe as operações do vínculo — todas
aceitam um `EntityManager` opcional para rodar dentro da transação de quem chama:

| Método | O que garante |
|---|---|
| `criarVinculada` | Número único no condomínio; nasce pertencendo à unidade |
| `vincularAoApartamento` | Vaga do condomínio, sem outro apartamento e **sem locação vigente** |
| `desvincularDoApartamento` | Solta a vaga de volta ao pool de locação |
| `desativarPorApartamento` | Desativa as vagas quando a unidade sai de operação; recusa se houver locação vigente |
| `listarPorApartamento` | Vagas da unidade, já com `situacao` |

Regra nova de vínculo entra **aqui**, não no módulo Apartamentos.

## Gateway de cobrança

`gateway/cobranca.gateway.ts` com dois adapters: `manual` (padrão — registro
interno, aviso por WhatsApp) e `asaas` (**ainda não implementado**, lança
`NotImplemented`). Trocar é só `COBRANCA_PROVIDER=asaas`. E-mail tem gateway
próprio, hoje `NoopEmailAdapter`.

## Frontend

`web/src/pages/Vagas.tsx` (abas Vagas / Locações / Cobranças) +
`web/src/components/vagas/`: `VagaFormDialog`, `LocacaoFormDialog`,
`PrecosDialog`, `ContratoDialog`, `CobrancasPanel`, `HistoricoVagaDialog` e
`vagas-shared.tsx` (rótulos, ícones, formatação de moeda/data/competência).

O botão **Histórico** no card da vaga abre a linha do tempo: cada contrato com
as cobranças dele, o que foi pago e o que ficou em aberto. Foi criado porque a
informação existia mas era invisível — as cobranças só apareciam filtradas por
competência, então o que aconteceu há três meses sumia da tela.

## Decisões e armadilhas

- **Datas como texto `YYYY-MM-DD`**, formatadas sem passar por `new Date()` —
  converter embaralha o fuso e mostra o dia anterior.
- **Competência é sempre dia 1** do mês (`YYYY-MM-01`); a API recebe `YYYY-MM`.
- **Valores `numeric` chegam como string** do PostgreSQL: use o
  `numeric.transformer.ts` das entidades, senão soma vira concatenação.
- Rota fixa antes da curinga: `/vagas/disponiveis` está declarada antes de
  `/vagas/:id`.

## Ao alterar este módulo

- [ ] Mexeu em situação/alugável? Ajuste `decorar()` e a tabela de rótulos em
      `vagas-shared.tsx` (front) juntos.
- [ ] Campo novo na locação → veja se entra no template de cobrança
      (`cobranca-template.ts`) e no `LocacaoFormDialog`.
- [ ] Regra de cobrança → confira idempotência e o array `ignoradas`.
- [ ] Rota nova → o módulo é opcional: `@RequiresModule('vagas')` no controller.
- [ ] Mexeu em cobrança, encerramento ou vínculo → `test/vagas-historico.e2e-spec.ts`
      cobre que o histórico sobrevive; rode.
- [ ] Nunca apague contrato ou cobrança para "limpar" — o banco recusa, e é de
      propósito.
