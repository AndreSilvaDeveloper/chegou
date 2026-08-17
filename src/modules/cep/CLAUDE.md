# Módulo: CEP

Consulta de CEP para preencher o endereço do condomínio. É o módulo mais simples
do projeto: um controller, um service, nenhuma tabela.

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

## Ao alterar este módulo

- [ ] Trocou de provedor? O parser é por provedor — acrescente o método e
      mantenha o anterior na cadeia, não substitua.
- [ ] Mexeu nos perfis? Eles precisam bater com quem edita endereço de
      condomínio (tabela "O que cada perfil faz" no `CLAUDE.md` raiz).
- [ ] Campo novo na resposta? Espelhe em `EnderecoPorCep` (`web/src/api/types.ts`)
      e decida se o `EnderecoFields` deve preenchê-lo sozinho.
