# Módulo: Apartamentos

As unidades do condomínio. Base de quase tudo: encomenda chega para um
apartamento, morador mora em um, vaga pode pertencer a um.

## Rotas e perfis

| Rota | admin | sindico | porteiro |
|---|:---:|:---:|:---:|
| `GET /apartamentos` (busca por `q`, corta em 50) | ✅ | ✅ | ✅ |
| `GET /apartamentos/count` (total de unidades) | ✅ | ✅ | ✅ |
| `GET /apartamentos/blocos` | ✅ | ✅ | ✅ |
| `GET /apartamentos/estrutura` | ✅ | ✅ | ✅ |
| `GET /apartamentos/lookup` | ✅ | ✅ | ✅ |
| `GET /apartamentos/:id`, `/:id/moradores` | ✅ | ✅ | ✅ |
| `POST /apartamentos` | ✅ | ✅ | ✅¹ |
| `PATCH /apartamentos/:id` | ✅ | ✅ | — |
| `DELETE /apartamentos/:id` (desativa) | ✅ | ✅ | — |
| `POST /apartamentos/import` (CSV) | ✅ | ✅ | — |
| `POST /apartamentos/disparar-cobranca` | ✅ | ✅ | — |
| `GET /apartamentos/:id/vagas` ² | ✅ | ✅ | ✅ |
| `POST /apartamentos/:id/vagas` ² | ✅ | ✅ | — |
| `DELETE /apartamentos/:id/vagas/:vagaId` ² | ✅ | ✅ | — |

¹ O porteiro cria a unidade (na portaria aparece unidade nova antes de o síndico
cadastrar), mas **sem** as vagas dela — mandar `vagas` no corpo devolve 403.
² Exige o módulo Vagas habilitado (`@RequiresModule('vagas')`).

## Dados

`apartamentos` (`tenant_id NOT NULL`): `bloco` (opcional no schema, obrigatório
ou proibido conforme a config), `numero`, `identificador` (coluna gerada:
`A-101` ou `101`), `valor_condominio`, `observacoes`, `ativo`.

Unicidade por `(tenant_id, COALESCE(bloco,''), numero)` — bloco NULL e bloco
vazio contam como a mesma coisa.

## Regras de negócio

1. **O campo bloco segue a estrutura do condomínio** (`config_json`):

   | `estruturaBlocos` | Comportamento |
   |---|---|
   | `multiplos` | Bloco **obrigatório** (400 sem ele) |
   | `unico` | Bloco **recusado** — só o número da unidade |

   Quem manda é `estruturaBlocos`, não o `tipo`: prédio residencial de torre
   única existe, e deduzir pelo tipo obrigaria a inventar um "bloco A" para todo
   mundo. O `tipo` só **sugere** a estrutura na tela de configuração do
   superadmin (comercial → único; residencial/misto → múltiplos). Condomínio
   antigo sem `estruturaBlocos` cai nessa mesma dedução.

2. **Dado legado é tolerado na edição.** Se o condomínio virou "bloco único"
   depois de já ter unidades com bloco, reenviar o bloco que já está gravado
   continua valendo — quem só está corrigindo o número não pode ser barrado.
3. **Bloco + número é único no condomínio** (409 com mensagem explícita).
4. **Remoção é desativação** — apagar levaria junto o histórico de encomendas.
5. **Importação CSV** processa linha a linha e devolve os erros com o número da
   linha, sem abortar o lote. O diálogo oferece um **modelo para baixar**
   (`MODELOS` em `web/src/components/ImportDialog.tsx`): como o parser casa a
   coluna pelo nome, o cabeçalho do modelo tem que bater com o esperado
   (`bloco,numero,observacoes,valor_condominio`).

### Vagas que pertencem à unidade

6. **A vaga vinculada é do apartamento, não do morador.** O morador vai embora e
   ela fica com a unidade — o oposto da locação, que é da pessoa que aluga.
7. **Criar unidade + vagas é transacional.** Vaga com número repetido não pode
   deixar para trás um apartamento meio criado.
8. **Vaga com locação vigente não pode ser vinculada** (409): vincular tiraria a
   vaga do pool com um contrato em vigor.
9. **Desativar a unidade desativa as vagas dela**, mantendo o vínculo. Soltar
   vaga para aluguel é decisão comercial, não efeito colateral. Se alguma tiver
   locação vigente (dado legado), a desativação falha com 409 pedindo para
   encerrar antes.
10. **Desvincular devolve a vaga ao pool de locação** — a partir daí ela pode ser
    alugada.
11. **As regras de vaga moram no `VagasService`** (`criarVinculada`,
    `vincularAoApartamento`, `desvincularDoApartamento`,
    `desativarPorApartamento`), que aceita um `EntityManager` para participar da
    transação daqui. Não reimplemente essas regras neste módulo.

## Frontend

`web/src/pages/Apartamentos.tsx` + `components/ApartamentosManager.tsx`
(reaproveitado pela tela do superadmin), `components/apartamentos/VagasDoApartamento.tsx`
e `components/ImportDialog.tsx`.

A seção de vagas só aparece com `permiteVagas` — hoje: módulo Vagas habilitado
**e** perfil síndico/administradora. Na tela do superadmin ela fica oculta
(as rotas de vaga não existem sob `/admin/tenants/:id/apartamentos`).

**A busca da lista é no servidor** (`GET /apartamentos?q=`), com debounce — a
listagem vem cortada em `LIMITE_LISTAGEM` (50), então filtrar no cliente só
enxergaria as 50 primeiras (foi o bug de "501 não encontra uma unidade que
existe"). O `ApartamentosManager` mostra o **total** (`/count`) e, acima de 50
sem busca, avisa que está exibindo só as primeiras.

## Ao alterar este módulo

- [ ] Mudou `identificador`? Ele aparece em encomendas, moradores e vagas —
      confira as telas que exibem.
- [ ] Campo novo → veja se entra na importação CSV e no `ApartamentosManager`.
- [ ] Mexeu na unicidade → ajuste a migration e a tradução do erro 409 (que hoje
      distingue duplicidade de unidade e de vaga).
- [ ] Mexeu na regra do bloco → `test/apartamentos.e2e-spec.ts` cobre; rode.
- [ ] Regra nova de vaga → implemente no `VagasService`, não aqui.
