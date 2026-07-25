# Módulo: Relatórios

Consultas agregadas para as telas de relatório. Só leitura, tudo em SQL puro por
performance.

## Rotas e perfis

| Rota | admin | sindico | porteiro |
|---|:---:|:---:|:---:|
| `GET /relatorios/encomendas` | ✅ | ✅ | — |
| `GET /relatorios/whatsapp` | ✅ | ✅ | — |
| `GET /relatorios/vagas` (`@RequiresModule('vagas')`) | ✅ | ✅ | — |

## O que cada relatório entrega

| Relatório | Conteúdo |
|---|---|
| `encomendas` | Volume, tempos, produtividade da portaria, comparação com o período anterior |
| `whatsapp` | Saúde dos disparos no período |
| `vagas` | Ocupação atual **+ histórico financeiro acumulado** |

O de vagas tem duas naturezas misturadas de propósito: `resumo`/`porTipo` são
**foto do agora** (não dependem do período), e `financeiro`/`historicoPorVaga`
somam **tudo o que já foi cobrado**, inclusive de contrato encerrado — dívida
não some quando o contrato acaba. Cobrança cancelada não entra em nada.

## Regras de negócio

1. **`tenant_id = $1` em toda query.** São queries SQL cruas, sem o TypeORM para
   lembrar do filtro — é o módulo onde um esquecimento vaza mais dado de uma vez.
2. **Período comparado com o anterior** (mesma duração) para mostrar variação.
3. **Filtro opcional por bloco**, resolvido dentro do SQL.
4. **Datas em fuso local**, não UTC — senão a virada do dia sai errada.
5. Só leitura: nenhuma rota aqui grava.

## Frontend

`web/src/pages/Relatorios.tsx`, com gráficos em
`web/src/components/ui/chart.tsx`.

## Ao alterar este módulo

- [ ] Query nova → `WHERE ... tenant_id = $1` **sempre**, e parâmetro
      posicional (nunca interpolar string).
- [ ] Relatório novo de módulo opcional → `@RequiresModule(...)` na rota.
- [ ] Confira o resultado com dois condomínios no banco: relatório é o lugar onde
      um vazamento aparece somado, sem chamar atenção.
