# Módulo: CEP e geocodificação

Duas metades de "onde fica este endereço": a **consulta de CEP**, que preenche o
formulário, e a **geocodificação**, que grava a coordenada do condomínio para o
mapa da plataforma.

## Rota e perfis

| Rota | Perfis | O que faz |
|---|---|---|
| `GET /cep/:cep` | `sindico`, `admin`, `superadmin` | Devolve logradouro, bairro, cidade e UF |

**Não é `@Public()`.** A rota não devolve dado de ninguém — CEP é informação
pública —, mas aberta ela vira um proxy gratuito para a BrasilAPI/ViaCEP em cima
do nosso IP, e é o nosso IP que leva o bloqueio quando alguém varrer os CEPs do
Brasil por aqui.

Os três perfis são exatamente os que editam o endereço de um condomínio:
síndico (`/configuracoes`), administradora (`/meus-condominios/:id`) e superadmin
(`/admin/condominios/:id`). **Porteiro fica de fora** — ele não tem tela de
cadastro de condomínio.

**Sem `@TenantId()`, de propósito.** O CEP não é dado de condomínio nenhum, e
exigir escopo obrigaria a administradora a escolher um condomínio antes de
cadastrar o endereço do condomínio novo que ela está criando.

## Resposta

```json
{ "cep": "36010000", "endereco": "Rua Halfeld", "bairro": "Centro",
  "cidade": "Juiz de Fora", "estado": "MG" }
```

`endereco` é o **logradouro** — mesmo nome e mesmo sentido do campo em `tenants`.
Número e complemento não existem aqui: o CEP não os conhece, e quem preenche é
sempre a pessoa.

## Regras de negócio

1. **Dois provedores, em ordem: BrasilAPI, depois ViaCEP.** Não é excesso de
   zelo — os dois são serviços públicos gratuitos, sem contrato de
   disponibilidade, e um CEP que não responde travaria o cadastro inteiro se
   fosse o único caminho.
2. **A ViaCEP responde 200 com `{ "erro": true }`** para CEP inexistente (e, em
   algumas versões, com a string `"true"`). Checar só o status HTTP deixaria
   passar um endereço vazio como se fosse achado.
3. **A consulta nunca é obrigatória.** Ela preenche campos; quem valida o
   endereço é o usuário olhando para a tela. Por isso a única resposta de erro é
   **404** — CEP novo demora a entrar nas bases, e recusar o cadastro por causa
   disso deixaria condomínio de bairro recém-criado sem conseguir se cadastrar.
   O `EnderecoFields` no front mostra um aviso inline e segue aceitando o que for
   digitado (nem toast, porque não é etapa que falhou).
4. **Cache em memória, sem TTL.** CEP não muda de bairro. O limite de 500 chaves
   existe só para o mapa não crescer para sempre num processo de vida longa; o
   descarte é FIFO, porque o custo de um miss é uma chamada HTTP.
5. **Timeout curto** (`CEP_TIMEOUT_MS`, padrão 5s): provedor lento não pode
   segurar a tela de cadastro.

## Por que pelo backend, e não direto do navegador

A consulta feita pelo painel viajaria do dispositivo de quem está cadastrando — e
o síndico costuma estar numa rede de condomínio ou corporativa, que é exatamente
onde domínio de terceiro é filtrado. Saindo do servidor, ela falha igual para
todo mundo, dá para cachear e dá para trocar de provedor sem publicar build novo
do front.

## Frontend

`web/src/components/condominio/EnderecoFields.tsx` é o único consumidor.
`CepInput` (`components/ui/cep-input.tsx`) mascara `00000-000` e entrega só
dígitos, como o `PhoneInput` e o `DocumentoInput`.

**A consulta sai de dentro do `onChange` do CEP, não de um efeito.** Num efeito
sobre o valor do campo ela dispararia também no carregamento do condomínio que
já existe — e sobrescreveria o endereço salvo pelo genérico da base dos Correios.

---

# Geocodificação

`tenants.latitude` / `longitude` / `geo_precisao` / `geo_atualizado_em`
(migration 036). Duas colunas `NUMERIC` e não PostGIS: a única pergunta prevista
é "onde desenhar o alfinete", e para isso um par de números basta.

## A cadeia, em ordem de PRECISÃO

Nenhum provedor sozinho cobre o Brasil, então são três tentativas:

| # | Fonte | `geo_precisao` | Falha quando |
|---|---|---|---|
| 1 | Nominatim — rua + número + cidade + UF | `endereco` | Rua nova, ou grafada diferente do OSM |
| 2 | BrasilAPI — coordenada do CEP | `cep` | O CEP não tem coordenada na base (**comum**) |
| 3 | Nominatim — cidade + UF | `cidade` | Praticamente nunca |

**A ordem não é a da confiabilidade do provedor, é a da precisão do resultado.**
A BrasilAPI é fonte melhor que o OSM, mas a coordenada dela é do CEP: acerta a
rua e ignora o número. Num condomínio numa avenida de 4 km, o alfinete cairia em
qualquer ponto dela.

O passo 3 é deliberadamente ruim e existe assim mesmo — um alfinete no centro do
município, **marcado como tal**, é melhor que um buraco no mapa. É por isso que
`geo_precisao` é gravada junto: sem ela, o alfinete de "centro de Juiz de Fora"
pareceria tão exato quanto o da portaria, e alguém decidiria algo em cima disso.

## Regras de negócio

1. **`location.coordinates` da BrasilAPI vem vazio com frequência.** A v2
   responde `{ "type": "Point", "coordinates": {} }` para uma parcela grande dos
   CEPs. Confiar em `location` existir grava `NaN`. `coordenadaDaBrasilApi()`
   trata isso, mais string não-numérica, par fora da faixa e **(0,0)** — que é o
   Golfo da Guiné e, na prática, significa "não sei". Coberto em
   `cep.service.spec.ts`.
2. **Fila, nunca no salvamento.** O Nominatim aceita 1 req/s e um endereço pode
   gastar duas chamadas; resolver em linha somaria segundos ao `PATCH`. E
   provedor fora do ar deixaria o condomínio sem coordenada **para sempre**,
   porque não haveria o que reprocessar.
3. **`jobId = geo:{tenantId}`.** Corrigir o número e depois o complemento
   enfileira **um** trabalho, não três.
4. **Só quando o endereço muda de verdade.** `aplicarEndereco()` devolve se
   algum campo mudou — a tela manda o endereço inteiro a cada salvamento, mesmo
   quem só corrigiu o nome do condomínio.
5. **`geo_atualizado_em` é gravado mesmo sem achar nada.** É o que separa "nunca
   tentamos" de "tentamos e este endereço não existe em base nenhuma".
6. **Concorrência 1 no worker**, e `WORKER_ENABLED=false` fecha o worker: mais de
   uma réplica consumindo a fila multiplicaria as chamadas ao Nominatim, que é
   exatamente o que a política proíbe.

## Nominatim: as regras de uso não são opcionais

Serviço gratuito, mantido por doação. A política exige **User-Agent que
identifique a aplicação e permita contato** e **no máximo 1 req/s**. As duas
coisas estão no `GeocodingService` — a segunda como intervalo mínimo entre
chamadas, não como confiança em quem chama. Ignorar isso rende bloqueio por IP,
que derruba a geocodificação de **todos** os condomínios de uma vez.

Preencha o `GEOCODING_USER_AGENT` com um contato real. `NOMINATIM_BASE_URL`
vazio desliga os passos 1 e 3 (sobra a coordenada do CEP).

## Ao alterar este módulo

- [ ] Trocou de provedor? O parser é por provedor — acrescente o método e
      mantenha o anterior na cadeia, não substitua.
- [ ] Mexeu nos perfis? Eles precisam bater com quem edita endereço de
      condomínio (tabela "O que cada perfil faz" no `CLAUDE.md` raiz).
- [ ] Campo novo na resposta? Espelhe em `EnderecoPorCep` (`web/src/api/types.ts`)
      e decida se o `EnderecoFields` deve preenchê-lo sozinho.
- [ ] Mexeu na cadeia de geocodificação? A ordem é por **precisão do
      resultado**, não por qualidade do provedor — e toda fonte nova precisa
      dizer qual `geo_precisao` ela produz.
- [ ] Provedor novo devolvendo coordenada? Passe pelas mesmas recusas de
      `coordenadaDaBrasilApi()` (vazio, não-numérico, fora de faixa, (0,0)).
      Alfinete no oceano é o defeito clássico daqui.
- [ ] Vai desenhar o mapa? Leia `geo_precisao` — tratar `cidade` como se fosse
      `endereco` põe um condomínio a quilômetros de onde ele está.
