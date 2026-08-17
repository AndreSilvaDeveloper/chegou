# Changelog — Chegou 📦

Formato da versão: **MAIOR.RECURSO.CORREÇÃO** (ver "Versionamento" no `CLAUDE.md`).

- **MAIOR** — virada de versão do produto (quebra de compatibilidade, marco grande)
- **RECURSO** — funcionalidade grande nova (módulo, tela, integração)
- **CORREÇÃO** — bug corrigido, ajuste visual, refino

Quem mexe no sistema sobe a versão (`npm run versao correcao|recurso|maior`) e
escreve aqui o que mudou, no mesmo commit.

---

## 0.35.0 — 2026-08-17

**Coordenadas do condomínio, para o mapa da plataforma.**

`tenants.latitude`, `longitude`, `geo_precisao` e `geo_atualizado_em`
(migration 036). Duas colunas `NUMERIC` e não PostGIS: a única pergunta prevista
é "onde desenhar o alfinete", e para isso um par de números basta.

**A coordenada não vem de um provedor só, porque nenhum cobre o Brasil.** A
cadeia tenta em ordem de **precisão do resultado**:

| # | Fonte | `geo_precisao` |
|---|---|---|
| 1 | Nominatim — rua + número + cidade + UF | `endereco` |
| 2 | BrasilAPI — coordenada do CEP | `cep` |
| 3 | Nominatim — cidade + UF | `cidade` |

A BrasilAPI é fonte mais confiável que o OSM, mas vem **depois**: a coordenada
dela é do CEP, então acerta a rua e ignora o número — num condomínio numa
avenida de 4 km o alfinete cairia em qualquer ponto dela. O passo 3 é
deliberadamente ruim e existe assim mesmo: um alfinete no centro do município,
**marcado como tal**, é melhor que um buraco no mapa. Daí a coluna
`geo_precisao` — sem ela, "centro de Juiz de Fora" pareceria tão exato quanto a
portaria.

**`location.coordinates` da BrasilAPI vem vazio com frequência** — `{}`, com o
`location` presente. Confiar em ele existir gravaria `NaN`. Além disso são
recusados: string não-numérica, par fora da faixa geográfica e **(0,0)**, que é o
Golfo da Guiné e na prática significa "não sei". Seis casos em
`cep.service.spec.ts`.

**Resolvida em fila (`geocodificacao`), nunca no salvamento.** O Nominatim aceita
1 requisição por segundo e um endereço pode gastar duas chamadas; em linha, isso
somaria segundos a cada `PATCH`. E provedor fora do ar deixaria o condomínio sem
coordenada para sempre, porque não haveria o que reprocessar. O `jobId` é
`geo:{tenantId}`: corrigir o número e depois o complemento enfileira **um**
trabalho, não três.

**Só enfileira quando o endereço muda de verdade** — `aplicarEndereco()` agora
devolve se algum campo mudou. As telas mandam o endereço inteiro a cada
salvamento, inclusive quem só corrigiu o nome do condomínio.

`geo_atualizado_em` é gravado **mesmo quando nada é encontrado**: é o que separa
"nunca tentamos" de "tentamos e este endereço não existe em base nenhuma".

Variáveis novas: `NOMINATIM_BASE_URL` (padrão: a instância pública; vazio
desliga os passos 1 e 3), `GEOCODING_USER_AGENT` e `GEOCODING_TIMEOUT_MS`.

> ⚠️ **A política de uso do Nominatim não é opcional.** Ela exige User-Agent que
> identifique a aplicação e permita contato, e no máximo 1 req/s — o código
> respeita o intervalo, mas o User-Agent é configuração. **Ponha um contato real
> em `GEOCODING_USER_AGENT` antes do deploy**: bloqueio por IP derruba a
> geocodificação de todos os condomínios de uma vez.

---

## 0.34.1 — 2026-08-17

**Cada perfil cai na tela dele ao entrar.** Superadmin e administradora eram
sempre jogados em `/encomendas` — o superadmin numa tela de condomínio que ele
nem opera, a administradora numa tela que exige um condomínio escolhido.

**A causa era uma corrida no próprio `Login`.** A guarda de "já está logado" era
`<Navigate to="/encomendas">`. O `submit` grava o token e chama `nav(...)` com o
destino certo, mas o componente **re-renderiza antes de a navegação sair** — e
nesse render `getToken()` já é verdadeiro, então o redirect fixo corria por cima.
O mapa de destinos existia e estava sendo ignorado.

Agora há **um mapa só**, em `lib/rota-inicial.ts`:

| Perfil | Cai em |
|---|---|
| `porteiro` | `/encomendas` |
| `sindico` | `/dashboard` (era `/encomendas`) |
| `admin` | `/meus-condominios` |
| `superadmin` | `/admin` |

Ele é usado nos **seis** lugares que decidiam destino, dos quais quatro
mandavam todo mundo para encomendas: o `nav()` do login, a guarda de sessão do
`Login`, a rota `/`, o catch-all `*` e os dois redirects de recusa do
`ProtectedRoute`.

**Perfil recusado agora volta para a própria tela inicial.** Mandar o superadmin
para `/encomendas` o deixava preso num lugar que ele não opera — e que ele
consegue abrir, porque essa rota não declara `allowedRoles`. Não há laço
possível: a tela inicial de cada perfil é, por construção, uma que ele pode
abrir.

---

## 0.34.0 — 2026-08-17

**Cadastro de condomínio em três passos, e o slug some do formulário.**

**O wizard** (`components/condominio/CondominioWizard.tsx`): informações gerais →
endereço → síndico responsável. **Um componente para as duas telas** — o
superadmin (`/admin`) e a administradora (`/meus-condominios`) criam pelo mesmo
DTO, e copiado o formulário divergiria na primeira vez que um campo entrasse só
de um lado. São treze campos de três assuntos diferentes: numa coluna só, no
celular, o erro de validação aparecia longe do campo que o causou.

O botão "Continuar" **nunca fica apagado sem explicação** — `pendencia(passo)`
devolve em texto o que falta. E o submit revalida os três passos, porque dá para
chegar ao passo 3 e voltar para apagar um campo.

**O slug é gerado no servidor** (`src/common/slug.ts` + `AdminService.slugUnico`)
e não aparece mais em tela nenhuma. Ele é o nome da sessão do condomínio no
gateway de WhatsApp, então não se troca depois de criado — e quem sabe se ele
está livre é o banco, não o navegador. `baseDeSlug()` tira acento, número e
caractere especial do nome; havendo colisão, entra um sufixo de **letras** (o
slug inteiro segue sem números). Antes o campo era digitado nas duas telas, cada
uma com a sua cópia da mesma função de sugestão.

Duas armadilhas resolvidas aí:

- **O acento precisa ser descartado, não virar separador.** `normalize('NFD')`
  sozinho fazia "Condomínio" produzir `condomi-nio`. Não aparecia em "José" nem
  "Ipê", onde o acento está na última letra e o hífen extra é aparado na ponta —
  o teste (`src/common/slug.spec.ts`) foi quem pegou.
- **O retry olha a constraint, não só o código do erro.** `23505` cobre slug,
  documento e e-mail do síndico; sem conferir `tenants_slug_key`, um CNPJ
  repetido trocaria o slug à toa e devolveria o mesmo erro de novo.

**Cadastro obrigatório na criação**: nome, CNPJ (ou CPF), e-mail e telefone do
condomínio; CEP, logradouro, número, cidade e UF; nome, e-mail, senha e telefone
do síndico. Complemento e bairro seguem livres — nem todo endereço tem os dois.

**E o que virou consequência:** o superadmin passou a *exigir* e-mail e telefone
do condomínio no cadastro e não tinha onde corrigi-los depois. Os dois campos
entraram no `AtualizarTenantDto` e na aba "Dados gerais" de
`/admin/condominios/:id` — exigir na criação sem oferecer na edição deixaria o
conserto de um erro de digitação para o banco.

**Onde as informações novas aparecem:** o InfoPill "Localização" das três telas
de condomínio virou "Endereço" e mostra a linha inteira (`enderecoLinha()` em
`lib/endereco.ts`); as listagens seguem com cidade/UF (`municipioLinha()`), que é
o que cabe numa coluna. O telefone do síndico entra em `users.telefone`, que as
telas de acesso já mostravam.

Fixture de e2e centralizada em `test/helpers/condominio.ts` — com CNPJ de
dígitos verificadores calculados, já que o documento agora é obrigatório e
único.

---

## 0.33.0 — 2026-08-17

**Endereço completo do condomínio, com preenchimento pelo CEP.**

Até aqui o endereço era **uma linha de texto livre** e o `cep` existia na tabela
`tenants` desde a migration 001 sem nunca ter aparecido em tela nenhuma. Cada
condomínio escreveu do jeito que quis, e o cadastro que o gateway de cobrança
recebe (`addressStreet`) saía com número e bairro grudados na rua.

**Sete campos, um só componente.** CEP, logradouro, número, complemento, bairro,
cidade e UF, em `components/condominio/EnderecoFields.tsx`. As três telas que
editam o mesmo endereço — síndico (`/configuracoes`), administradora
(`/meus-condominios/:id`) e superadmin (`/admin/condominios/:id`) — passam a usar
esse componente. Elas divergiam: duas tinham "Endereço" de texto livre e **a do
superadmin não tinha endereço nenhum**, então quando a cobrança falhava por
endereço incompleto quem consertava era o próprio cliente que abriu o chamado.

**A coluna `endereco` continua com esse nome**, agora significando *logradouro*
(migration `035_endereco_completo_tenant.sql`, que só acrescenta `numero`,
`complemento` e `bairro`). Renomear custaria caro por nada, e **não há backfill**:
separar "1179" de "Rua Halfeld 1179" por regex acerta o caso fácil e estraga o
difícil em silêncio. O que está gravado segue valendo e se ajeita no próximo
salvamento.

**Consulta de CEP pelo backend** (`GET /cep/:cep`, módulo novo `src/modules/cep`)
— BrasilAPI com ViaCEP de reserva, cache em memória, timeout de 5s
(`CEP_TIMEOUT_MS`). Pelo servidor e não pelo navegador porque o síndico costuma
estar em rede de condomínio ou corporativa, que é onde domínio de terceiro é
filtrado. Perfis: síndico, administradora e superadmin — os mesmos que editam
endereço. **A consulta nunca trava o cadastro**: CEP não encontrado vira um aviso
inline e o endereço segue digitável.

**No gateway de cobrança**, `addressStreet` volta a ser montado com logradouro,
número e bairro — a Payment API tem um campo de rua só, e sem isso o endereço do
boleto teria regredido para "Rua Halfeld", sem número.

Peças novas: `@Cep()` e `EnderecoDto`/`aplicarEndereco()` (`src/common/`),
`CepInput` e `lib/cep.ts` no front.

> **Cuidado que vale registrar:** o `@IsOptional()` do class-validator pula
> `null` e `undefined`, mas **não** string vazia. Sem o `TextoOpcional` do
> `EnderecoDto`, apagar a UF mandaria `''` ao `@Matches(/^[A-Z]{2}$/)` e
> devolveria 400 para quem só queria limpar o campo.

---

## 0.32.1 — 2026-08-17

**Dois formulários mais leves: apartamento e morador.**

**Vaga saiu de bloco e virou botão** (`components/apartamentos/VagasDoApartamento.tsx`).
No cadastro de apartamento a seção de vagas era um sub-card com dois formulários
já abertos — vincular uma vaga livre e criar uma nova — e ocupava metade do
diálogo mesmo para quem ia cadastrar a unidade sem mexer em vaga (o caso comum).
Agora o repouso é uma linha: as vagas já vinculadas + o botão "Vincular vaga". O
formulário só aparece depois do clique, num bloco chapado, com as duas formas em
`Tabs` — abrindo em "Já cadastrada" quando o condomínio tem vaga livre e em
"Criar nova" quando não tem (aí o trilho nem aparece). As vagas vinculadas
deixaram de ser linhas com botão largo "Desvincular" e viraram chips discretos
com ação de ícone.

**Morador: os dois sim/não viraram interruptores** (`components/MoradoresManager.tsx`).
"Morador principal" e "Notificações por WhatsApp" eram dois `<input
type="checkbox">` escritos à mão dentro de um `bg-muted` — a moldura os
anunciava como um bloco à parte do cadastro. Agora são duas linhas de
`SwitchField`, sem moldura.

**`SwitchField`** (`components/ui/switch.tsx`) — peça nova: rótulo e explicação à
esquerda, interruptor à direita, linha inteira clicável. Irmão do
`CheckboxField`, com a divisão documentada em `components/ui/CLAUDE.md`: caixa
para item marcado numa lista, interruptor para estado de um recurso.

**`SimpleSelect` aceita `aria-label`**, para o select que vive numa linha já
rotulada e não tem `Label` visível.

---

## 0.32.0 — 2026-08-17

**Cinco versões de cada mensagem, sorteadas por envio, e o ritmo em 90s.** Um
número que dispara o mesmo texto para dezenas de destinatários é o padrão que o
WhatsApp não-oficial marca como spam. Esta versão ataca os dois lados do
problema — o texto e a cadência.

**Texto.** Chegada de encomenda e confirmação de retirada passam a ter **cinco
redações diferentes cada uma** (`src/modules/notificacoes/message-template.ts`),
e o sistema sorteia uma no enfileiramento. As cinco não são sinônimos trocados:
mudam estrutura, tamanho e uso de emoji — duas com lista de tópicos, duas em
prosa, uma sem emoji nenhum.

**Saudação pelo horário.** Toda versão abre com `{{saudacao}}` → "Bom dia"
(05:00–11:59), "Boa tarde" (12:00–17:59) ou "Boa noite" (18:00–04:59).

O token é resolvido **na hora em que a mensagem sai**, não na em que foi criada:
o conteúdo é montado quando o porteiro registra a encomenda, mas entre isso e o
envio há fila, intervalo anti-bloqueio e janela de horário. Uma encomenda
registrada às 20h55 sai às 8h do dia seguinte — resolvido no registro, o morador
receberia "Boa noite" de manhã. Por isso `{{saudacao}}` atravessa a renderização
das variáveis e só é fechado em `NotificationService.agendarEmLote`, o único
ponto que conhece a hora real de saída.

**A personalização por condomínio saiu.** Não existe mais
`whatsappTemplateEncomenda` / `whatsappTemplateRetirada`, nem para o síndico,
nem para a administradora, nem para o superadmin — o card "Modelos de mensagem"
foi removido das três telas (`/whatsapp`, `/admin/condominios/:id`,
`/meus-condominios/:id`), junto com `WhatsappTemplateCard` e `TemplateEditor`.

É uma troca deliberada de liberdade por segurança do número: um cliente colando
o mesmo texto em todo envio anularia a variação e derrubaria o próprio WhatsApp.
`/whatsapp/config` passa a devolver só o ritmo.

**Ritmo.** O intervalo entre mensagens do mesmo número sobe de 60s+60s para
**90s fixos + 0 a 90s aleatórios** — de 1 a 2 minutos para 1min30 a 3min. O piso
que o síndico pode escolher na tela sobe junto, de 60s para 90s: nascer em 90 e
deixar a primeira tela devolver o número para 60 não protegeria nada.

Sem migration: nenhum condomínio em produção tinha personalizado texto ou ritmo.

**O plano de migração para a API Oficial foi revisado junto** (`docs/whatsapp-migration/`).
Ele fora escrito na 0.31.3 e descrevia a personalização como uma feature a
preservar — um gap inteiro (§3.2, "fluxo de aprovação de template") existia só
por causa dela. Esse gap **acabou**, e com ele 5–8 dias da estimativa, que caiu
de 43–67 para 38–59 dias. A pergunta aberta B3 virou registro de decisão.

Duas descobertas da revisão, que não são só atualização de texto:

- **A Meta rejeita template cujo corpo começa com variável** (*dangling
  parameter*), e as cinco versões abrem com `{{saudacao}}`. Na Cloud API o texto
  precisa abrir com palavra fixa; a saudação continua só no caminho OpenWA.
- **As cinco versões não devem virar cinco templates na Meta.** Elas defendem
  contra o filtro de spam do WhatsApp não-oficial, que não existe numa plataforma
  onde o texto é pré-aprovado — submeter as dez custaria manutenção sem comprar
  proteção. O catálogo segue em 11 templates, não 19.

## 0.31.3 — 2026-08-02

**O logo do painel quebrou com a mudança para `/app/`.** Aparecia como imagem
quebrada na tela de login (duas vezes) e no menu lateral — as três ocorrências
de `<img src="/logo-mark.png">`.

O caminho absoluto aponta para a **raiz do domínio**, que desde a 0.31.0 é a
landing: o navegador pedia `chegou.bellory.com.br/logo-mark.png`, o nginx
entregava ao Next e voltava 404. O arquivo mora em `/app/logo-mark.png`.

**Por que passou pelo build e pelos testes:** o Vite reescreve os caminhos do
`index.html` (`/icon-192.png` virou `/app/icon-192.png`) e de qualquer asset
que passe por `import` — mas uma **string literal dentro do JSX** ele não tem
como enxergar. `npm run build` passa, `tsc` passa, e a imagem só quebra no ar.
O manifest do PWA já tinha sido tratado na migração; estes três ficaram.

A correção não é escrever `/app/` à mão — isso amarraria o código ao lugar onde
o painel mora hoje e quebraria de novo se ele mudar. Passa a existir
`asset()` (`web/src/lib/asset.ts`), que monta o caminho a partir de
`import.meta.env.BASE_URL` — `/app/` no build, `/` no dev sem proxy, sem `if`.
É o mesmo mecanismo que o `QrAutocadastroDialog` já usava para o link do QR.

```tsx
<img src={asset('logo-mark.png')} alt="Chegou" />
```

> Varri o resto do `web/src`: não sobrou nenhum outro caminho absoluto de asset
> (`src="/…"`, `href="/…"`, `url(/…)`). Ao adicionar imagem de `web/public/`,
> use `asset()` — está na tabela de peças reutilizáveis do `CLAUDE.md`.

## 0.31.2 — 2026-08-02

**`movimento.css` tinha um `@media` perdido, e quem pedia menos movimento
ganhava uma área vazia gigante.** Uma edição anterior (commit `e656541`, antes
da migração para Next) apagou a linha `@media (prefers-reduced-motion: reduce) {`
e deixou o conteúdo dela **dentro da regra do link "pular para o conteúdo"**:

```css
.pular:focus { left: 1rem; top: 1rem;   /* comentário do bloco perdido */
  .pilha { height: auto; }
  ...
}
```

As chaves fechavam, então **o CSS não dava erro de parse e o build passava** —
por isso sobreviveu a uma migração inteira sem ninguém ver. Com o aninhamento
nativo do CSS, aquelas regras viraram `.pular:focus .pilha` e nunca se
aplicaram.

O estrago aparecia só com `prefers-reduced-motion` ligado, na seção "Como
funciona": `.pilha` é a **pista** de rolagem, com altura `100vh + (n-1) × 80vh`,
que existe só para alimentar o efeito de empilhar os cartões. Sem o
`height: auto`, o palco soltava mas a pista continuava ocupando o espaço — três
telas de rolagem vazia depois da seção. O `.passos` escapava porque tinha regra
equivalente no bloco de cima; a `.pilha` não tinha.

Agora as quatro regras estão no `@media` certo (o espaçamento passou a vir do
`gap` do `.pilha__cartoes`, não de margem no cartão) e `.pular:focus` voltou a
ser uma linha só.

> Conferido o resto: chaves balanceadas em todos os CSS da landing, e nenhum
> outro bloco aninhado por acidente.

### A ordem do CSS se inverteu na migração, e ninguém percebeu

Consertar o `@media` acima **não mudou nada na tela** — e foi isso que revelou
o problema de verdade. Medido no navegador:

| Folha | Arquivo | Regra |
|---|---|---|
| 0 | `styles/movimento.css` | `.pilha { height: auto }` |
| 1 | `secoes/ComoFunciona.css` | `.pilha { height: calc(…) }` |

Mesma especificidade, `movimento.css` primeiro → **quem vence é o componente**.

No Vite, `main.tsx` importava `movimento.css` por último e ele vencia por
ordem. O Next injeta o CSS do layout **antes** do CSS de componente, que vem em
chunk próprio. A inversão passou despercebida porque as regras com `!important`
(`animation: none`) continuaram vencendo — a animação parava de rodar, como
esperado — enquanto **toda regra de pose estática perdia em silêncio**,
deixando os elementos presos no primeiro quadro da animação recém-desligada.

Agora todo seletor daquele bloco começa com `html`, o que sobe a especificidade
para (0,1,1) e vence **independente da ordem do bundle** — a ordem passou a ser
decisão do empacotador, não nossa. `.pilha` saiu de 2368px para 974px.

### Três leituras de navegador quebravam a hidratação (React #418)

O console acusava `Minified React error #418`. Reproduzido com o dev server, o
diff apontou `TituloFlutuante` e `PixelCanvas` renderizando marcação diferente
no servidor e no cliente. A causa nos três casos era a mesma:

```ts
useState(() => typeof window !== 'undefined' && matchMedia(q).matches)
```

O guard evita o `ReferenceError` no build — e cria o mismatch, porque o
servidor gera `false` e o primeiro render do cliente devolve o valor real.
Quando discordam, o React **descarta o HTML do servidor e regenera a árvore**.
Só se manifesta em quem tem a preferência ligada, o que explica não ter
aparecido antes.

Corrigidos `use-movimento-reduzido`, `use-media-query` e a constante de módulo
`TEM_SCROLL_TIMELINE` do `TituloFlutuante` (essa via `typeof CSS`): estado
inicial igual ao do servidor, leitura do navegador — **inclusive a inicial** —
dentro do `useEffect`. Console limpo; sobra só um atributo injetado por
extensão do navegador, fora do nosso controle.

### `/favicon.ico` respondia 404

Não havia `icons` no metadata, então o navegador pedia `/favicon.ico` no
palpite e levava 404. Passa a apontar para a arte oficial (`/logo.png`), sem
segunda cópia no repositório — a reconstrução em SVG foi descartada de
propósito (ver `components/marca/Logo.tsx`). Fica anotado que 512×512 e ~300 KB
é pesado para favicon: o certo, quando houver fôlego, é gerar um derivado
pequeno **a partir** deste arquivo.

> **Nota para quem for investigar "a landing está sem animação":** a preferência
> `prefers-reduced-motion` do sistema desliga o movimento por design, e foi o
> que aconteceu aqui. Confirme com
> `matchMedia('(prefers-reduced-motion: reduce)').matches` **antes** de procurar
> bug — no Windows 11 é Acessibilidade → Efeitos visuais → Efeitos de animação.

### O botão do topo virou "Entrar"

Era "Quero ver funcionando", âncora para `#chamada`. Passa a levar ao painel:
**`/app/login`**.

- **Por que `/app/login` e não `/login`**: os dois chegam lá, mas `/login` gasta
  um 301 do nginx. Aquele redirect existe para URL digitada, compartilhada e
  impressa — um link nosso, que conhece o destino, não precisa dele.
- **O rótulo é o mesmo do painel** ("Entrar", em `web/src/pages/Login.tsx`).
  Dois vocabulários para a mesma porta é como o usuário deixa de reconhecê-la.
- O texto saiu do markup para `lib/conteudo.ts` (`TOPO.acao`), que era onde ele
  já devia estar — ver a regra 2 do `landing/CLAUDE.md`.

O caminho de conversão **não** ficou órfão: "Agendar uma demonstração" continua
no hero, na chamada final e no rodapé. O que mudou é que a barra fixa agora
serve quem **já é cliente**, em vez de repetir um CTA que a página faz três
vezes. É o único link da landing que sai para o painel.

**E ele aparece no celular** — antes `.topo .btn` era `display: none` abaixo de
640px. A regra estava certa para o rótulo antigo ("Quero ver funcionando" não
cabia), mas o celular é justamente onde o porteiro abre o sistema.

Para caber foi preciso abrir espaço: **no celular a marca fica só com o
símbolo**, sem a palavra. A conta em 375px não fechava — o `.wrap` deixa 335px
úteis e a linha somava 393 (marca 164 + hambúrguer 44 + tema 44 + botão 93 +
3 gaps de 16). Sem a palavra: 265px, com folga até ~305px de tela. O nome não
se perde para leitor de tela, porque o `<a class="marca">` já carrega
`aria-label="CONDO avisa — início"`.

### O atalho do app instalado agora cai no painel, não no marketing

Quem instalou o PWA antes da landing tem um ícone na tela do celular apontando
para o `start_url` antigo — a **raiz** do domínio, que hoje é o site de vendas.
O painel mudou para `/app/`, mas o atalho já gravado no aparelho não se
atualiza sozinho.

`RedirecionaAppInstalado` resolve sem pedir nada ao usuário: se a página foi
aberta em janela de app (`display-mode: standalone | fullscreen | minimal-ui`,
mais `navigator.standalone` para o iOS, que nunca implementou `display-mode`),
manda para `/app/login`. Detalhes que não são óbvios:

- **Só app instalado.** Aba de navegador — visitante, buscador, agente de IA —
  continua vendo a landing. Crawler nunca roda em `standalone`, então o SEO não
  muda. Verificado ao vivo: em aba normal `display-mode: browser` é o único
  verdadeiro e o redirect não dispara.
- **`location.replace`, não `href`**: a landing não entra no histórico. Com
  `href`, o "voltar" do aparelho traria o usuário de volta e o redirect
  dispararia de novo, prendendo ele num pingue-pongue.
- **Vai para `/app/login` mesmo**, não para `/app/`: quem já tem sessão é
  desviado sozinho pelo painel (`if (getToken()) return <Navigate to="/encomendas" />`
  em `web/src/pages/Login.tsx`), então o mesmo destino serve aos dois casos.

> ⚠️ Isto **não** substitui reinstalar o PWA para quem ainda tem o service
> worker antigo no escopo `/`: naquele caso o SW serve o painel em cache e a
> landing nem chega a carregar, então este código não roda. Os dois problemas
> são distintos e a correção do SW continua pendente.

## 0.31.1 — 2026-08-02

**A landing prometia três coisas que o produto não entrega mais.** Correção de
copy em `landing/src/lib/conteudo.ts` — que é também o `<head>`, o JSON-LD e o
`/llms.txt`, então a promessa errada estava saindo para o buscador junto.

- **Preço da administradora**: um item de `PERFIS` ainda vendia "desconto por
  volume somando a carteira inteira". A administradora tem **tabela própria**
  (R$ 1,99, valor único) desde a migration 028 — o bloco `PRECO` já tinha sido
  corrigido, este passou batido e dizia o contrário dele, na mesma página.
- **"Botão grande, letra grande"** em `PERFIS` (porteiro) e em `DUVIDAS`
  ("quanto tempo o porteiro leva para aprender", que ainda prometia "nome
  sempre ao lado do ícone"): premissa de fonte e alvo de toque aumentados que
  **saiu do produto** — a interface segue os padrões do shadcn/ui. O que
  continua verdade ficou: um campo por linha, uma decisão por tela, nenhum
  gesto para decorar.

> Ao mexer em preço, o par continua sendo `PRECO.faixas` **e**
> `assinatura_faixas` (migration 028) — mas este release mostra que a copy
> repete o número em mais de um bloco. Procure o valor na página inteira, não
> só na tabela.

## 0.31.0 — 2026-08-01

**A landing page entra no ar, no mesmo domínio do painel.**
Ver [o plano](docs/plano-landing-monorepo.md) e [landing/CLAUDE.md](landing/CLAUDE.md).

### O painel mudou de endereço: `/app/`
`chegou.bellory.com.br/` passa a ser o site público; o painel vive sob `/app/`.

Três arquivos fazem isso funcionar, e só funcionam **juntos** — um sem o outro
quebra tudo (assets em 404, ou links apontando para fora do painel):
- `base: '/app/'` em `web/vite.config.ts`
- `basename="/app"` em `web/src/main.tsx`
- `location /app/` com **barra final** no `proxy_pass` (a barra é que remove o
  `/app` antes de repassar, então o `web/nginx.conf` continua valendo intacto)

> ⚠️ **Quem já tem o PWA instalado precisa reinstalar.** O atalho na tela do
> celular aponta para o `start_url` antigo (`/`), que agora abre a landing. É a
> única mudança deste release sentida pelo usuário final — avise os condomínios
> antes de subir.

**O prefixo existe por causa do escopo do service worker.** Ele é um prefixo de
caminho: com o painel na raiz, o único escopo possível seria `/`, e o SW do
painel passaria a controlar e cachear a **landing** — publicar uma mudança no
site e ela não aparecer para quem já abriu o painel é bug que só se manifesta
depois, com cliente na frente.

### A landing passou a ser Next.js
Ela nasceu em Vite + React e migrou **antes de subir** — o § 5 do plano tinha
decidido o contrário, e o § 11 registra por que a decisão virou. O que se
comprou não foi SSR (a página continua estática, pré-renderizada no build):

- **Fontes auto-hospedadas** (`next/font`): some a ida a `fonts.googleapis.com`
  no caminho crítico e o pulo de layout na troca de fonte — metade de um CLS
  ruim, na página cuja única função é converter visitante.
- **`<head>`, Open Graph e JSON-LD gerados da copy** (`src/lib/site.ts`).
  Revisar `conteudo.ts` revisa os três junto, em vez de deixar o preço do
  structured data divergir do preço da página no primeiro ajuste de texto.
- **`sitemap.xml`, `robots.txt` e `/llms.txt`** gerados no build. O último é a
  página em texto puro, para agente de IA: quando alguém pergunta a um
  assistente "qual sistema de portaria com aviso por WhatsApp?", a resposta sai
  do que ele conseguiu ler.

**O custo foi aceito de olhos abertos: existe um processo Node em produção**
(`next start` sobre o build `standalone`, ouvindo na 3000). `output: 'export'`
evitaria isso, mas levaria junto o `/llms.txt` — que é metade do motivo da
migração. O painel **não** migrou e continua em Vite.

### Adicionado
- `landing/Dockerfile`, `Dockerfile.dev` e `.dockerignore` — a landing existia
  mas não tinha como subir. O build `standalone` empacota só as dependências
  realmente usadas, em vez de copiar `node_modules` inteiro para a imagem.
- Serviço `landing` nos dois compose, e `nginx-dev.conf`: **um proxy também em
  dev**. Sem ele, a barra final do `proxy_pass` só seria testada em produção.
- Redirects `/login` → `/app/login` e `/app` → `/app/`.
- `/healthz` na landing: o healthcheck do container não precisa baixar a home
  inteira a cada 30 segundos. Mesmo endereço que o painel já expunha.

### Corrigido
- **O QR de autocadastro apontaria para a landing.** `QrAutocadastroDialog`
  montava `${origin}/cadastro/${token}`; com o painel em `/app/`, o morador
  abriria o site de marketing. Duas correções, porque são dois problemas: os QRs
  novos usam `import.meta.env.BASE_URL`, e um redirect `/cadastro/` →
  `/app/cadastro/` atende os **já impressos e colados no elevador** — papel não
  se atualiza.
- **`navigateFallbackDenylist` ganhou `/^\/(?!app\/)/`.** O `scope` impede o SW
  de *controlar* a landing, mas o fallback de navegação é outra coisa: sem a
  negativa, ele responderia o `index.html` do painel para uma URL do site.
- **A tabela de preços da landing estava desatualizada.** Publicava o corte
  antigo em 50 apartamentos (hoje são 100) e prometia à administradora um
  desconto por volume que não existe mais — ela tem tabela própria, R$ 1,99.
  Não é infraestrutura, mas era o tipo de erro que aparece na primeira fatura.
- **`useTema` quebrava o `next build`.** O estado inicial lia
  `window.matchMedia(...)`; no Vite isso só rodava no navegador, no Next roda no
  build (`ReferenceError: window is not defined`). Agora começa no único valor
  que o servidor pode produzir e se corrige no primeiro efeito.
- **O tema piscava a cor errada.** Com o HTML igual para todo mundo, quem
  escolheu o tema *contrário* ao do sistema via a cor errada até o React
  hidratar. Um script bloqueante no `<head>` (`src/lib/tema.ts`) aplica
  `data-theme` antes da primeira pintura.
- **O `next build` traçava os arquivos a partir da pasta errada.** Sem
  `turbopack.root`, o Next procura lockfile para cima e adotava a raiz do
  repositório (ou um lockfile solto no perfil do usuário) como raiz do projeto.

### Alterado
- `npm run versao` passou a sincronizar **três** `package.json` (raiz, `web/` e
  `landing/`). Cada app é buildado da própria pasta; a landing ficaria para trás.
- `landing/README.md` virou `landing/CLAUDE.md` — a convenção do projeto, para a
  doc ser carregada sozinha por quem for mexer ali.

### Pendente
- [ ] **A lista de verificação de roteamento (§ 9 do plano) não foi rodada.** O
      Docker estava parado ao fim desta implementação; o `next build`, o runtime
      `standalone` e os compose foram validados, o roteamento ao vivo não.
- [ ] `MARCA.email` em `landing/src/lib/conteudo.ts` ainda é placeholder.
- [ ] A copy de `PERFIS` ainda vende "botão grande, letra grande" ao porteiro —
      premissa que saiu do produto quando a interface voltou aos padrões do
      shadcn/ui. A landing está prometendo o que a tela não entrega mais.

---

## 0.30.3 — 2026-08-01

### Corrigido
- **Erro da Payment API agora diz a URL completa que foi chamada.** Antes a
  mensagem trazia só o caminho (`POST /customers`), e um 405 mandava investigar
  rota, versão da API e credencial — quando a causa costuma ser a base apontando
  para outro lugar. A URL sai da **mesma função** que monta a chamada, então não
  há como as duas divergirem e mandarem alguém investigar uma URL que nunca
  existiu.
- **Duas pistas automáticas**, para os erros que não se explicam sozinhos:
  - **405**: diz que o caminho existe mas não aceita o método, e manda conferir
    se a base é a **raiz** da Payment API (sem `/api`, sem `/api/v1`) e se algum
    proxy à frente não está barrando o método.
  - **Resposta em HTML**: denuncia que `PAYMENT_API_BASE_URL` aponta para uma
    página, não para a API — corpo começando em `<` é o sinal.

### Testes
- Mais 3 casos em `payment-api.client.spec.ts`: a URL na mensagem, a explicação
  do 405 e a detecção de HTML.

---

## 0.30.2 — 2026-08-01

### Adicionado
- **`PAYMENT_API_KEY` — autenticação por API Key, e ela é o caminho principal.**
  Com a chave preenchida, **o ciclo de autenticação some**: nada de login,
  refresh com rotação, trava entre réplicas ou token em Redis. Uma chamada HTTP
  por operação, e menos peças no caminho de uma integração de dinheiro.
  - O usuário de integração (JWT) continua aceito e vira **reserva**. Basta uma
    das duas credenciais para a integração ficar configurada.
  - **A referência da Payment API se contradiz** sobre quais endpoints aceitam
    API Key: a tabela-resumo lista `/access-policy` e `access-status` como JWT, e
    a seção de cada endpoint diz "JWT ou API Key". Em vez de escolher uma versão
    e torcer, o cliente descobre na prática — 401/403 com a chave, havendo
    credenciais, ele repete com JWT e registra um aviso nomeando o caminho. A
    lista de exceções sai do log, não de um documento que discorda de si mesmo.
  - O fallback acontece **uma vez** por chamada: 403 no JWT também não vira laço.

### Corrigido
- **`Payment API HTTP 405 (POST /auth/login)`** — o erro que motivou tudo isto.
  Com API Key não há mais chamada a `/auth/login`, mas a causa provável valia ser
  tratada: **`fetch` segue redirecionamento e, num 301/302, troca POST por GET**
  (é o que a especificação manda). Uma base em `http://` num host que redireciona
  para `https://` transforma `POST /auth/login` em `GET` — e o endpoint responde
  405, que não conta essa história.
  - A mensagem de erro agora nomeia o redirect e a **URL final**. Sem essa pista,
    o caminho até descobrir passa por conferir rota, versão da API e credencial —
    tudo que está certo.
- **Base com o prefixo junto.** `PAYMENT_API_BASE_URL=https://host/api/v1`
  produzia `/api/v1/api/v1/...` — um 404 que parece problema de rota e é de
  configuração. O sufixo `/api` ou `/api/v1` passou a ser removido da base;
  copiar a URL do Swagger com o prefixo é o engano mais natural aqui.

### Testes
- `payment-api.client.spec.ts` ganhou 9 casos: a chave dispensa o login, o
  fallback para JWT no 403, o laço que não acontece, a normalização da base e a
  pista de redirecionamento na mensagem.

---

## 0.30.1 — 2026-08-01

### Corrigido
- **"property id should not exist" ao sincronizar cliente com o gateway.** A
  rota `POST /admin/assinaturas/clientes/:tipo/:id/sincronizar` usava `@Param()`
  **sem chave**, que entrega o objeto inteiro de params (`{ tipo, id }`), e o DTO
  só declarava `tipo`. Com `forbidNonWhitelisted: true` no `ValidationPipe`
  global, o `id` virava campo proibido — e o 400 não dizia nada sobre a causa.
  - O DTO passou a declarar os **dois** params, com `@IsUUID` no id. Efeito
    colateral bom: id inválido agora responde "id do cliente inválido" em vez da
    mensagem genérica do `ParseUUIDPipe`.
  - Era o único `@Param()` sem chave do projeto.
- **Teste que falhava sozinho entre 21h e meia-noite.** `assinaturas.e2e-spec.ts`
  montava as datas das condições com `CURRENT_DATE` do Postgres (que roda em
  **UTC** no container), enquanto o produto conta os dias em **São Paulo**
  (`hojeISO()`). Das 21h à meia-noite os dois discordam em um dia, e a condição
  "vencida ontem" ainda valia para o app — o teste de `condição vencida não vale
  mais` quebrava.
  - As datas agora saem de `hojeISO()`. A mesma armadilha já estava documentada
    em `assinaturas-cliente.e2e-spec.ts`; este arquivo não seguia.
  - **A regra de produção estava certa** — quem estava errado era o fixture.

### Adicionado
- `test/assinatura-clientes.e2e-spec.ts`: a rota de sincronizar por HTTP, com o
  **mesmo `ValidationPipe` do `main.ts`**. É o ponto do arquivo — um e2e que
  monta a aplicação sem ele passa por cima de toda validação de DTO, e foi
  assim que este defeito chegou ao servidor: 201 no teste, 400 em produção.
- **As variáveis `PAYMENT_*` no `deploy/`.** Elas existiam na validação de env e
  no `.env.example` da raiz, mas **não** em `deploy/docker-compose.yml` nem em
  `deploy/.env.example` — em produção o container nunca as receberia, e a
  cobrança ficaria desligada em silêncio (porque "vazio = desligado" é o
  comportamento correto). Agora as sete estão lá, com a URL do webhook
  documentada ao lado do token.

---

## 0.30.0 — 2026-08-01

Fase 6 — a última do [plano de cobrança pela Payment API](docs/plano-cobranca-gateway.md).
**Cupom de desconto**, e com ele a integração fica completa: das faixas por tipo
de cliente ao bloqueio por inadimplência.

### Adicionado
- **Cupons** (`/admin/assinaturas/cupons`), como **proxy** da Payment API. O
  cupom vive lá — escopo, vigência, limites e contagem de uso são de lá, e é de
  lá que sai o desconto. Guardar uma cópia criaria duas fontes da verdade que
  divergem no primeiro erro de rede, e a que importa é a que desconta.
- **Atribuição por cliente** (`assinatura_cupom_cliente`, migration 034) — esta
  parte é nossa. Um cupom em aberto por cliente (índice parcial), como
  `assinatura_condicoes`: dois ativos exigiriam uma regra de desempate que
  ninguém lembraria seis meses depois.
- `assinatura_faturas` ganhou `cupom_codigo` e `cupom_desconto`. Sem elas, uma
  fatura com cupom seria indistinguível de uma fatura com preço errado: o valor
  viria menor e nada diria por quê.
- **Aba Cupons** na tela do superadmin, com `usos` e "vale agora" vindos do
  gateway.

### A armadilha que o desenho inteiro evita
**O desconto não pode nascer na cobrança.** Mandar só o `couponCode` e deixar a
API descontar faria a fatura dizer R$ 418,80 e a cobrança cobrar R$ 376,92 — e
três coisas quebrariam de uma vez: o cliente veria na tela um número que não é o
que paga, o resumo reportaria faturado maior que recebido **todo mês**, e a
conciliação acusaria divergência. Um alarme falso mensal é a maneira mais rápida
de ninguém mais olhar para os alarmes.

Então: **manda-se o valor SEM o cupom + o código**, e confere-se o valor que
voltou. Mandar o valor já descontado *e* o código aplica o desconto duas vezes —
tem teste dedicado.

### O cupom entra na EMISSÃO, não na geração
O plano descrevia validar → gravar → cobrar como se fossem passos da geração.
Implementando, isso bateu de frente com a regra da fase 3: **a geração mensal não
pode depender de rede**, e validar cupom é chamada ao gateway.

A fatura passou a nascer pelo valor cheio, e os três passos acontecem na emissão
— que já é a fila com retry. É legítimo pelo motivo que o próprio plano dá no
caso do cupom expirado: ali a fatura ainda está em `pendente` e **nunca foi
cobrada**. Fatura emitida continua sendo fotografia intocável.

### Os três desfechos que não são o caminho feliz
| Situação | O que acontece |
|---|---|
| Valor da cobrança ≠ valor da fatura | **Não emite** — e **cancela a cobrança**. Ela já existe do outro lado, com um link que o cliente pode pagar; deixá-la viva seria o pior dos dois mundos |
| 422 (cupom expirou entre validar e cobrar) | Recalcula sem o cupom e emite, com registro no `audit_log`. **Chave de idempotência nova**: a anterior está associada à tentativa recusada |
| Cupom zera a fatura | **Não vira cobrança** — o gateway não emite R$ 0,00. A fatura nasce `paga` com o motivo, e o histórico mostra o mês coberto em vez de um buraco |

### Toda dúvida cobra o valor cheio
Sem cupom atribuído, fora da validade, gateway que não respondeu, resposta sem
desconto: em todos, a fatura sai pelo valor cheio. **Errar para mais é conserto
de um clique; errar para menos é dinheiro que não volta.**

### Cortesia total não é cupom
`PERCENTAGE` é limitado a 90% pelo gateway. Para isentar por completo, o lugar é
**preço especial com `valor_fixo = 0`** — e aí a regra que já existe ("fatura de
R$ 0,00 não nasce") resolve sozinha. A tela diz isso.

### Testes
- `cupom-fatura.service.spec.ts` (10): toda dúvida cobra cheio, `aplicar_ate`
  como freio, e o `finalValue` deles vence uma subtração nossa.
- `assinatura-cobrancas.service.spec.ts` ganhou 7 casos: o valor sem cupom, a
  divergência que cancela, o 422 que recalcula, e o cupom que zera.

---

## 0.29.0 — 2026-08-01

Fase 5 do [plano de cobrança pela Payment API](docs/plano-cobranca-gateway.md):
**bloqueio por inadimplência.**

> ⚠️ **Nasce desligado.** `PAYMENT_BLOQUEIO_ATIVO=false` é o padrão, e nada
> muda para ninguém até alguém ligar de propósito. A ordem para ligar está em
> `src/modules/pagamentos/CLAUDE.md`.

### Adicionado
- **`AcessoAssinaturaGuard`**, global, depois do escopo de condomínio. Trava a
  **escrita**; leitura nunca é bloqueada. O 402 carrega motivo, valor em aberto,
  dias de atraso, link de pagamento e para onde ir resolver.
- **`PAYMENT_BLOQUEIO_ATIVO`** — o interruptor, que o plano não previa.
  Implementar deixou claro que faltava: este é o único ponto do sistema capaz de
  tirar clientes adimplentes do ar, e sem ele o bloqueio começaria a valer no
  mesmo instante em que o código sobe — sem ninguém ter conferido a política do
  gateway, os clientes sincronizados nem as faturas em aberto. É também o freio
  de mão: **desligar não precisa de deploy.**
- **Migration 033** (`assinatura_politica_acesso`): tolerância em dias, faturas
  vencidas até bloquear, mensagem e TTL. Linha única por `CHECK (id = 1)`, não
  por disciplina — somos uma company só no gateway, e duas linhas fariam a tela
  mostrar uma política e a API usar outra.
- **Aba de política** na tela do superadmin, que diz **duas coisas separadas**: a
  política salva e se o bloqueio está mesmo agindo. Confundir as duas é o erro
  mais fácil aqui.
- **Faixa de bloqueio** no topo do app. O 402 vira faixa, não toast: toast some
  em quatro segundos e leva junto a informação de como resolver.

### Fail-open é inegociável
Toda dúvida libera: gateway fora, timeout, 404, cliente sem `customer`, Redis
indisponível, resposta que não entendemos, **e o próprio provider não resolver**.
O prejuízo de deixar um inadimplente trabalhar por um dia é menor que o de travar
todos os adimplentes numa queda nossa.

Não existe um único `catch` que devolva bloqueado — e há um teste para cada
caminho de falha, justamente para a regressão aparecer.

### O que o teste encontrou
**Um guard global que lança na resolução do provider derruba toda escrita do
sistema com 500.** O `moduleRef.get()` estava fora do `try`. Isso não apareceu
lendo o código: apareceu no caso "serviço indisponível passa".

### Rotas que **nunca** são bloqueadas
`/auth/*` (login é onde ele descobre o bloqueio), `/assinatura*` e
`/minha-administradora/assinatura*` (**é a saída** — onde está o link para
pagar), `/health`, `/webhooks/*` e tudo do superadmin.

Sem a isenção de `/assinatura`, o cliente bloqueado não conseguiria abrir a tela
onde está o link — e o único caminho de saída seria ligar para o suporte.

### O desbloqueio é imediato
Toda baixa (webhook, conciliação ou manual) limpa o cache de acesso na hora. Na
baixa manual isso acontece **antes** de falar com o gateway e mesmo com ele fora:
cinco minutos olhando uma tela travada depois de ter pago é a pior experiência
que este sistema pode oferecer.

### A decisão consciente sobre a portaria
Com a escrita travada, **registrar encomenda também para**. A portaria para, e
quem sente primeiro é o morador, que não deve nada. Isso foi aceito de olhos
abertos (§ 9.2 do plano), com três amortecedores: tolerância em dias (padrão 5),
faturas vencidas até bloquear (padrão 1), e a constante `ISENTAS` no guard —
**uma linha** libera a portaria se um dia isso doer demais.

### Testes
- `acesso.service.spec.ts` (13): um caso por caminho de falha, todos liberando.
- `acesso-assinatura.guard.spec.ts` (22): o que nunca bloqueia, e o 402 completo.
- `test/acesso-bloqueio.e2e-spec.ts` (9): por HTTP, prova que **nasce inerte**,
  que `/assinatura` continua acessível e que falha ao avaliar libera.

---

## 0.28.0 — 2026-08-01

Fase 4 do [plano de cobrança pela Payment API](docs/plano-cobranca-gateway.md):
**a cobrança passa a ter garantia.** Antes disto, a única forma de uma fatura
sair de "aberta" era baixa manual — nada escutava o gateway, e um cliente que
pagasse continuaria marcado como devedor.

### Adicionado
- **Webhook de pagamento** (`POST /webhooks/pagamentos`), público e validado por
  `PAYMENT_WEBHOOK_TOKEN` com `timingSafeEqual`.
  - **Sem o token configurado, a rota recusa tudo.** Um endpoint público que
    altera estado de fatura não pode ficar aberto porque alguém esqueceu de
    preencher uma variável de ambiente.
  - **Grava primeiro, processa depois.** Webhook que processa em linha é webhook
    que o remetente considera falho por timeout — e reenvia, multiplicando o
    trabalho justamente quando o sistema está lento.
  - **Corpo ilegível também responde 200** e fica guardado: devolver erro faria o
    remetente reenviar para sempre um evento que repetição nenhuma conserta.
- **Migration 032** (`assinatura_webhook_eventos`): id do evento único, payload
  **bruto**, status, tentativas. O bruto fica porque, quando um valor não fechar
  daqui a três meses, a pergunta vai ser "o que exatamente eles nos mandaram?" —
  e nenhum resumo nosso responde isso.
- **Conciliação horária**: relê no gateway o estado de toda cobrança não
  terminal e registra divergência no `audit_log` com o antes e o depois.
  - Agendada por **repeatable do BullMQ**, não `@Cron`: o repeatable é coordenado
    pelo Redis, então duas réplicas produzem uma execução por hora. Com um cron
    em processo, cada réplica consultaria o gateway pelas mesmas faturas.
  - `@nestjs/schedule` **não** foi adicionado como dependência para isso.
- **Aba Pendências** ganhou as cobranças: fatura sem cobrança há mais de 24h,
  baixa não confirmada no gateway, e o botão "Conciliar agora".

### As três regras que este release existe para garantir
1. **Evento repetido não dá baixa duas vezes.** A dedup é o **índice único do
   banco**, não uma consulta antes do insert — duas entregas simultâneas
   passariam as duas pela consulta e as duas dariam baixa.
2. **Evento fora de ordem não desfaz uma baixa.** `RECEIVED` pode chegar antes
   de `CONFIRMED`, e um `PENDING` atrasado depois do pagamento. A comparação é
   por **precedência de estado**, nunca por ordem de chegada.
3. **Evento de fatura desconhecida não quebra.** Pode ser cobrança de outro
   sistema na mesma company: registra e ignora.

### O parser que não aposta num formato
O formato do repasse nunca foi visto na prática, então `webhook-payload.ts`
**procura os campos** em largura, em qualquer profundidade, em vez de exigir um
envelope. Três formatos plausíveis estão cobertos por teste.

**A armadilha que isso revelou:** `status` na raiz de um envelope pode ser o
`WebhookEventStatus` deles (`PROCESSED`, `FAILED`) — o status do *processamento
do evento*, não o do pagamento. Acreditar nele marcaria fatura como paga por
causa de um evento processado com sucesso que dizia o contrário. O parser marca
o status como não confiável fora de um objeto `payment`/`charge`, e nesse caso
consulta-se o gateway.

### Alterado
- **`paga` deixou de ser estado terminal** para a conciliação. Parece terminal e
  não é: estorno e chargeback chegam **depois** da baixa, e é justamente o caso
  em que perder o webhook custa caro — o cliente aparece adimplente com o
  dinheiro já devolvido.
- **Divergência de valor é alarme, nunca correção automática.** A fatura é a
  fonte da verdade do que o cliente deve; ajustar em silêncio esconderia
  exatamente o que precisa ser visto.

### Diferenças em relação ao plano (documentadas em `docs/`)
- **O pull de `GET /webhooks/events` não foi implementado como via separada.**
  Aquele endpoint devolve o *evento*, não o *estado da cobrança* — saber o status
  exigiria um `GET /charges/{id}` de qualquer forma. Reler a cobrança é
  estritamente mais confiável que reprocessar um log de eventos, então a
  conciliação virou a rede de segurança e passou a rodar **de hora em hora** em
  vez de uma vez por dia.
- **O controller do webhook mora em Assinaturas**, não em Pagamentos: Assinaturas
  já importa Pagamentos, e um controller lá que precisasse do serviço de fatura
  fecharia um ciclo entre os módulos. O conhecimento do formato do gateway
  continua em `pagamentos/webhook-payload.ts`.

### Testes
- `webhook-payload.spec.ts` (14), `webhook-pagamento.service.spec.ts` (12),
  `conciliacao.service.spec.ts` (9).
- `test/webhook-pagamentos.e2e-spec.ts` (7): por HTTP, prova que a rota é
  pública, que o token é conferido e que **a dedup é do índice único**.

---

## 0.27.0 — 2026-08-01

Fase 3 do [plano de cobrança pela Payment API](docs/plano-cobranca-gateway.md):
**o Chegou passa a cobrar de verdade.** A fatura vira cobrança no gateway, o
cliente recebe um link e a baixa manual espelha dos dois lados.

### Adicionado
- **Emissão de cobrança em fila** (`cobranca-emissao`, BullMQ). Gerar a fatura e
  emitir a cobrança são passos separados porque **a geração mensal não pode
  depender de rede**: com o gateway fora no dia 1º, as faturas nascem do mesmo
  jeito e a emissão espera. Misturar os dois é como se perde um mês de
  faturamento por um timeout.
  - Fila própria, não a de notificação: aquela é deliberadamente lenta (regras
    anti-bloqueio do WhatsApp) e esta quer terminar o lote do dia 1º.
  - O worker **não relança** o erro: a falha já virou estado na fatura, com o
    motivo. Relançar faria o BullMQ repetir cinco vezes uma emissão que falhou
    por cliente sem documento — algo que repetição nenhuma conserta.
- **`POST /charges/undefined`**: um link só, e o cliente escolhe PIX, boleto ou
  cartão na tela do gateway. Escolher o método por ele seria decidir por um
  condomínio inteiro como o síndico prefere pagar.
- **Botão "Pagar"** na tela do cliente, e coluna de estado da cobrança na do
  superadmin (com "Emitir cobrança" onde a emissão resolve).
- **Migration 031**: `cobranca_id`, `cobranca_asaas_id`, `cobranca_status`,
  `cobranca_status_gateway`, `cobranca_idempotency_key`, `cobranca_erro`,
  `invoice_url`, `sincronizado_em`, `cobranca_dessincronizada` — e os status
  `estornada` e `em_disputa`.
  - As duas partes entram **na mesma migration** de propósito: separadas,
    existiria um intervalo em que o código já grava `estornada` e o CHECK ainda
    recusa, e um evento de estorno chegando nele derrubaria o processamento.
  - Índice único em `cobranca_id`: sem ele, duas faturas apontando para a mesma
    cobrança fariam a baixa de uma marcar a outra como paga.

### Idempotência — três camadas, e as três são necessárias
1. `jobId` do BullMQ impede enfileirar a mesma fatura duas vezes.
2. Só emite fatura em `pendente`/`erro`/`desligada`.
3. **A `Idempotency-Key` é gravada ANTES do POST** e reusada no retry. Gerar e
   mandar sem gravar perderia a chave num crash entre as duas coisas, e o retry
   criaria outra — que é exatamente como se cobra o cliente duas vezes. Tem
   teste dedicado.

**409 é sucesso**, não erro: é a resposta de um retry idempotente que deu certo.
Tratar como falha marcaria a fatura como erro tendo cobrança viva no gateway — o
cliente recebe o link e nós achamos que não emitimos.

### Baixa e cancelamento têm ordens **opostas**
Não é inconsistência, é o risco de cada lado:
- **Baixa**: local primeiro. Falhando no gateway, a baixa vale assim mesmo e a
  fatura fica `cobranca_dessincronizada`. **Dinheiro que entrou não fica refém
  de API fora do ar.**
- **Cancelar**: gateway primeiro. Falhando, o cancelamento local **não
  acontece** — cancelar só do nosso lado deixaria uma cobrança viva que o
  cliente pode pagar por engano.

### Alterado
- `CONFIRMED` do gateway já vira `paga`. Confirmado é "o pagamento aconteceu";
  liquidado é "o dinheiro caiu", o que no boleto leva o D+1 do banco — e quem
  pagou não pode ficar bloqueado esperando a compensação.
- `estornada` e `em_disputa` ficam **fora de `valorFaturado`**: somar dinheiro
  devolvido ou em disputa faria a receita do mês mentir. Baixa manual é recusada
  nos dois.
- **O cliente não vê `cobranca_status`.** Ele recebe `pagamento`, com uma
  resposta só: dá para pagar agora, e por onde? Duas decisões guardadas por
  teste:
  - "Já está resolvida?" vem **antes** de "tem link?". O `invoiceUrl` continua
    gravado depois da baixa; invertendo a ordem, a tela mostraria "Pagar" numa
    fatura paga.
  - **Disputa não oferece pagamento.** O link continua vivo, mas pagar no meio
    de um chargeback é como se paga duas vezes: se a disputa for resolvida a
    nosso favor, o valor volta.

### Corrigido
- `jobId` do BullMQ não aceita `:` — o e2e pegou isso na geração de faturas, que
  passou a responder 500. Trocado por `-`.

### Testes
- `assinatura-cobrancas.service.spec.ts` (16 casos), `cobrancas.service.spec.ts`
  (26) e `situacao-pagamento.spec.ts` (10).
- O e2e ganhou o caso que prova que **a fatura nasce com a cobrança desligada** —
  gateway ausente não pode custar faturamento.

---

## 0.26.0 — 2026-08-01

Fase 2 do [plano de cobrança pela Payment API](docs/plano-cobranca-gateway.md):
o cliente passa a existir no gateway. **Ainda não cobra** — emitir cobrança é a
fase 3. O que muda é que agora dá para saber, antes do dia 1º, quem não poderia
ser cobrado.

### Adicionado
- **Módulo `pagamentos`** (`src/modules/pagamentos/`), com fronteira explícita:
  ele fala com a Payment API e **não conhece regra de assinatura**. Quem sabe
  quem é o sacado e quanto ele deve continua sendo o módulo Assinaturas.
- **`PaymentApiClient`** — autenticação, retry e disjuntor:
  - O par de tokens vive no **Redis**, não em memória: com mais de uma réplica,
    cada uma logando por conta própria multiplicaria sessões. E como o refresh
    **rotaciona**, duas renovando na mesma janela derrubariam uma à outra — daí
    a trava `pay:auth:lock`.
  - **Refresh que falha cai para login.** Temos as credenciais em env, então
    rotação perdida nunca é beco sem saída. Sem esse degrau, uma corrida infeliz
    deixaria a integração fora do ar até alguém reiniciar o processo.
  - `expiresIn` é lido como **milissegundos**. Tratado como segundos, o token
    ficaria guardado por 24 mil dias e o primeiro sinal seria um 401 em produção.
  - Retry só no transitório (rede, timeout, 5xx). **400/403/404/409/422 não têm
    retry**: payload errado não melhora com insistência, e 409 é a resposta certa
    de um retry idempotente — quem decide o que fazer com ele é o chamador.
  - **4xx não conta para o disjuntor.** O gateway está de pé e respondeu; contar
    faria o cadastro errado de um cliente derrubar a emissão de todos os outros.
- **`ClientesGatewayService`** — o cliente do Chegou virando `customer`:
  - **Falha de sincronização não sobe como exceção, vira estado gravado.** A
    linha do vínculo guarda o motivo e a aba Pendências mostra. Erro que só
    existe no log é erro que ninguém vê — e este custa a cobrança de um cliente
    no mês.
  - **400 de documento duplicado adota o customer existente.** Acontece de
    verdade (retry depois de timeout, cliente criado à mão no painel deles,
    restauração de banco), e sem a adoção o cliente ficaria permanentemente sem
    cobrança: criar outro é impossível, porque o documento é único entre os
    ativos da company. A conferência do documento **exato** é nossa — o `search`
    deles é LIKE, e adotar por semelhança cobraria o cliente errado.
  - Campo vazio fica **fora** do corpo, nunca como string vazia: no `PUT`
    parcial, string vazia apagaria o e-mail por onde o cliente recebe o link.
  - Telefone vai sem o `+55` — guardamos E.164, o gateway espera DDD sem DDI.
- **Migration 030** (`assinatura_clientes_gateway`): tenant XOR administradora,
  `customer_id`, `asaas_id`, `documento_enviado`, `sincronizado_em`,
  `erro_ultima_sync`.
  - `customer_id` é **nullable** de propósito: a linha também registra a
    tentativa que falhou, que é o que alimenta a tela de Pendências.
  - Índice único em `customer_id` (não previsto no plano): sem ele, dois
    clientes nossos apontando para o mesmo customer fariam a inadimplência de um
    bloquear o outro na fase 5, e a conta de um aparecer no extrato do outro.
- **Aba Pendências** em `/admin/assinaturas`, com contador no rótulo. O botão
  Sincronizar **só aparece onde resolve**: cliente sem documento se conserta no
  cadastro, e clicar ali só produziria o mesmo erro.
- Rotas (superadmin): `GET /admin/assinaturas/clientes/pendencias` e
  `POST /admin/assinaturas/clientes/:tipo/:id/sincronizar`. O `tipo` está no
  path porque condomínio e administradora são os dois UUID — o plano escrevia só
  `:id`, e a ambiguidade apareceu na implementação.

### Regras
- **Condomínio de carteira não vira cliente do gateway**, e a recusa é do nosso
  lado. Lá ele seria criado sem reclamação, e sobraria um cliente no Asaas que
  nunca recebe cobrança — sujeira que só apareceria na conciliação.
- **`PAYMENT_API_BASE_URL` vazio desliga a cobrança inteira**, como
  `OPENWA_BASE_URL` faz com o WhatsApp. A fatura continua sendo gerada e
  calculada; a tela diz que está desligada em vez de listar todos como erro.

### Testes
- `payment-api.client.spec.ts` (19 casos): as fronteiras de retry, o 401 que
  renova uma vez só, o refresh que cai para login, `expiresIn` em ms e o
  disjuntor que ignora 4xx.
- `clientes-gateway.service.spec.ts` (13 casos): pendência gravada em vez de
  exceção, adoção só com documento exato, `PUT` sem documento, desligado não
  chama nada.

---

## 0.25.0 — 2026-08-01

Fase 1 do [plano de cobrança pela Payment API](docs/plano-cobranca-gateway.md):
a fundação do preço e da identidade do cliente. **Ainda não cobra nada** — o
gateway entra da fase 2 em diante. O que muda hoje é o preço da próxima geração
e o cadastro do cliente.

### Adicionado
- **Duas tabelas de preço, uma por tipo de cliente** (migration 028). A
  administradora traz vários condomínios de uma vez e paga preço de atacado
  (R$ 1,99 por apartamento, faixa única); o condomínio direto continua andando
  pelas faixas de volume, agora **3,99 até 100 · 3,49 de 101 a 200 · 2,99 acima
  de 200**.
  - `GET/PUT /admin/assinaturas/faixas` passam a **exigir** `?tipo=`. Sem padrão
    de propósito: a tela abriria mostrando os preços do outro tipo, e editar dali
    substituiria a tabela errada.
  - O `delete` da substituição é filtrado pelo tipo. Enquanto havia uma tabela
    só, ele varria `assinatura_faixas` inteira — com duas, isso apagaria a do
    outro tipo a cada edição, e o próximo cliente daquele tipo cairia em
    `TabelaDePrecosVaziaError` no fechamento do mês.
  - A migration **não sobrescreve tabela já mexida** pelo superadmin: o corte
    novo só entra onde os valores ainda eram os originais. Negociação vale mais
    que o nosso padrão.
  - A aba **Preços** ganhou `SegmentedFilter` para trocar entre as duas, cada uma
    dizendo para quem vale.
- **`DocumentoInput`** (`components/ui/documento-input.tsx`) e
  `lib/documento.ts`: o campo mascara `12.345.678/0001-90` enquanto se digita e
  entrega só dígitos para a API — a mesma disciplina do `PhoneInput`. O campo
  estava em quatro telas, cada uma com o seu `replace(/\D/g,'')`, o seu
  `maxLength` e o seu "Só os números" (uma já sem a fonte mono das outras).
- **`@DocumentoBrasileiro()`** (`src/common/documento.ts`): tira a máscara e
  confere os **dígitos verificadores**, não só o tamanho. Documento inválido volta
  400 do gateway quando já não dá para explicar ao usuário onde ele errou.

### Alterado
- **`cnpj` virou `documento` e aceita CPF ou CNPJ** (migration 029), em `tenants`
  e `administradoras`. Nem todo condomínio tem CNPJ — muitos são administrados
  pelo síndico em nome próprio, e exigir CNPJ deixaria esses clientes sem
  cobrança possível quando o gateway entrar.
  - O CHECK antigo exigia **exatamente 14 dígitos**; renomear a coluna não o
    desfazia, e ele continuaria recusando todo CPF. Ele sai, e o novo entra
    `NOT VALID`: vale para toda linha nova ou alterada, sem derrubar a migration
    por causa de dado legado com máscara.
  - Mensagens de conflito deixaram de dizer "CNPJ já em uso".

### Testes
- `test/assinaturas.e2e-spec.ts` acompanhou o modelo novo: a carteira agora sai a
  1,99 (109,45 em 55 unidades) em vez de 3,49, e entrou um caso que prova que
  **trocar a tabela de um tipo não apaga a do outro**.
  - O arquivo chamava `definirFaixas()` com a assinatura antiga e **não
    quebrava o build**: o `tsconfig.json` exclui `test/`. Só o e2e pega isso.

### Documentação
- `src/modules/assinaturas/CLAUDE.md`: as duas tabelas, por que o tipo não tem
  padrão e por que a limpeza é filtrada.
- Regra 30.1 no `CLAUDE.md` raiz: nunca pedir "só os números" num campo de
  documento.
- `docs/plano-cobranca-gateway.md` marca a fase 1 como entregue.

---

## 0.24.18 — 2026-08-01

### Alterado
- **"Nova versão disponível" virou componente próprio** (`AvisoAtualizacao`), no
  rodapé. Era um toast com `duration: Infinity` — e toast é passageiro por
  definição. Forçar um a ficar cobrava o preço em dois lugares: o botão de
  fechar do Sonner é posicionado por conta dele e **caía por cima do título**, e
  a ação vinha com a cor da biblioteca em vez do âmbar do sistema.
  - Agora tem a anatomia do card de lista (bloco de ícone chapado, título,
    apoio, ação), superfície `popover` com `rounded-surface`, entrada em mola e
    respeito à área segura do aparelho.
  - Fica no **rodapé** porque no celular o topo é a faixa âmbar com busca e
    menu, que era exatamente o que o aviso cobria.
  - O X ficou onde o do diálogo fica: canto superior direito, discreto.
  - O texto diz o que **vai** acontecer ("ela entra sozinha quando você terminar
    o que está fazendo; nada do que você digitou se perde") em vez de sugerir uma
    escolha que não existe — dispensar esconde o aviso, não cancela a
    atualização.
- **`Toaster` alinhado aos tokens do projeto.** Saiu o `richColors`, que
  repintava o toast com a paleta do Sonner: superfície, raio e sombra agora são
  os do sistema, a ação é âmbar e o estado aparece no ícone colorido sobre
  superfície neutra — a mesma língua do `StatusDot`. Saíram também os
  `min-h-[44px]` forçados (regra 17).
- `useAtualizacaoAutomatica()` deixou de desenhar: devolve
  `{ temVersaoNova, aplicar, dispensar }` e quem mostra é a tela.

---

## 0.24.17 — 2026-08-01

### Corrigido
- **O trilho de abas e filtros quebrava linha no celular.** Em Encomendas, num
  S24 Ultra, "Todos" descia sozinho para uma segunda fita e o controle parecia
  quebrado — em aparelho menor, pior. Ele passou a ser **uma linha só que rola na
  horizontal quando não cabe** (`flex-nowrap` + `overflow-x-auto`, sem barra à
  vista): cabendo, fica parado; não cabendo, o segmento cortado na borda mostra
  que há mais. Vale para os filtros (Encomendas, Filas, Locações) e para as abas
  — inclusive as sete de "Meu condomínio", que empilhavam em quatro fitas.
- **O `SegmentedFilter` traz o selecionado para a vista.** Com o trilho rolando,
  o filtro ativo podia ficar fora do trecho visível — ao abrir a tela já
  filtrada, ou quando outro controle muda a seleção (nas Filas, os cartões de
  status fazem isso). A tela mostrava a lista filtrada sem nada marcado à vista.

---

## 0.24.16 — 2026-08-01

### Documentação
- **Catálogo da identidade visual** em `web/src/components/ui/CLAUDE.md` — ele é
  carregado sozinho por quem trabalha em `components/ui/`. Traz "quero X → use
  Y", as **seis leis** (cor de token com o âmbar reservado à ação, escala
  tipográfica, tamanho de controle do componente, quatro superfícies sem card
  dentro de card, raio por papel, mobile-first em 375px), o contrato de cada
  peça (`PageShell`, `ListCard`, `Tabs`/`SegmentedFilter`, diálogos, `Button`,
  `StatCard`, gráficos, `DropdownMenu`), o checklist de PR e uma tabela de
  **armadilhas já pagas** — cada linha é um conserto que já custou uma sessão.
- **Skill `tela-frontend` atualizada**: o esqueleto de página usava `PageHeader`,
  que não existe mais (é `PageShell`), e dizia que o `FormDialog` empilha botões
  no celular, o que deixou de valer. Ganhou as regras de âmbar, cor por token,
  diálogo para toda sobreposição, controle segmentado e gráfico.
- **Skill `tela-listagem` atualizada**: o exemplo do `ListCard` ainda repetia no
  campo o que o título já dizia e não mostrava `subtitulo`, `campo.icone` nem
  `campo.enfase`. Agora explica os três níveis de leitura e a diferença entre
  `acoes` e `rodape`.
- `CLAUDE.md` raiz: seção "Identidade visual" nas regras obrigatórias, a skill
  `dataviz` na tabela de skills e o catálogo na tabela de docs.

---

## 0.24.15 — 2026-08-01

### Corrigido
- **"Ver contrato" derrubava a tela.** O botão que abre o arquivo usa `asChild`
  para virar um `<a>`, e o `asChild` entrega o próprio filho ao `Slot` do Radix —
  que aceita **um** filho. O `Button` injetava o spinner de carregando ao lado,
  o que dava dois, e o Radix lançava erro de Slot. Como o bloco do arquivo só é
  renderizado quando existe contrato, o erro aparecia exatamente quando o botão
  dizia "Ver contrato". Agora `Button` com `asChild` renderiza só o filho — link
  não carrega, navega.

### Alterado
- **Cards de vaga e de locação com as mesmas ações das outras listas.** Saíram
  os botões largos no pé do card; entraram botões de ícone no canto, como em
  Moradores e Equipe:
  - **Vaga**: editar, histórico e **remover** (novo — desativa a vaga, com
    confirmação; o backend recusa quando há locação vigente e a mensagem dele
    vai para o aviso).
  - **Locação**: contrato, editar e encerrar. O ícone de contrato fica âmbar
    quando já existe arquivo, e um campo "Contrato" no card diz se está anexado.
- **Rodapé de diálogo unificado.** Os diálogos de vaga, locação, contrato,
  histórico e cobrança empilhavam os botões no celular e espalhavam no desktop;
  agora seguem o do morador — uma linha, botões nas pontas, em qualquer
  viewport. A mudança está no `FormDialog`, então vale também para preços,
  faturas e pagamento.
- Diálogo do contrato: bloco do arquivo e a confirmação de remoção viraram
  blocos chapados (sem borda), e os botões de ação deixaram de ocupar a largura
  toda.

---

## 0.24.14 — 2026-08-01

### Corrigido
- **O gráfico do Dashboard mostrava um total que não existe.** Ele empilhava
  `recebidas + retiradas + pendentes`, mas `pendentes` é um **subconjunto** de
  `recebidas` (o que chegou naquele dia e ainda está na portaria) e `retiradas`
  conta por outra data — a da retirada. Num dia com 10 recebidas (3 paradas) e 8
  retiradas, a pilha desenhava 21. Agora são duas barras lado a lado — o que
  entrou e o que saiu — e o que está parado aparece em texto abaixo, porque
  estoque não divide eixo com fluxo. A legenda explica que uma encomenda conta na
  chegada e de novo no dia em que é buscada.
- **Cores de gráfico não acompanhavam o tema.** Eram hexadecimais escritos à mão
  em cinco lugares (`#0ea5e9`, `#10b981`, `#f59e0b`…), então o azul escolhido
  para fundo claro continuava idêntico no escuro. Agora saem de
  `lib/graficos.ts`, sobre os tokens `--chart-*`.
- **Passos escuros de `--chart-4` e `--chart-5` reprovavam na faixa de
  luminosidade** (OKLCH L 0,77 e 0,72, contra a faixa 0,48–0,67 de marca em fundo
  escuro — cor clara demais vira brilho e a série perde forma). Desceram para 36%
  e 44%; o par passa contraste ≥ 3:1 e separação ΔE 16 sob protanopia e
  deuteranopia.
- **A escala de "tempo até a retirada" tinha azul no meio de uma progressão
  verde→vermelho** — cor que não diz nem melhor nem pior, plantada onde a leitura
  depende da ordem. As duas escalas (essa e a de idade do estoque) passaram a
  sair de `corDeEspera()`, que distribui os tons de estado em ordem para
  qualquer quantidade de faixas.

### Alterado
- **Indicadores e gráfico falam a mesma língua.** "Recebidas" ganhou a variante
  `info` no `StatCard` — o mesmo azul da barra "Recebidas" logo abaixo. Antes
  ela era âmbar, igual ao indicador de "aguardando", e os dois cartões se
  confundiam de relance.
- **Eixos, grade e ponta de barra viraram constantes** (`EIXO_X`, `EIXO_Y`,
  `GRADE`, `PONTA_BARRA`). Era isso que deixava um gráfico com grade vertical e
  outro sem, um com decimal no eixo de contagem e outro sem.
- O seletor Semana/Mensal do Dashboard virou `SegmentedFilter` — era o último
  controle segmentado feito à mão.
- Dashboard ganhou estado vazio quando não houve movimentação no período, em vez
  de desenhar um gráfico de zeros.
- Relatórios: blocos de indicador soltos passaram a usar o rótulo `eyebrow` e o
  número em mono/tabular, como o `StatCard`.

---

## 0.24.13 — 2026-08-01

### Alterado
- **Registrar encomenda: os três passos ganharam a identidade das outras telas.**
  - **Stepper refeito.** O rótulo do passo sumia no celular (`hidden sm:block`)
    e sobravam três bolinhas sem nome, justo onde a tela é mais usada. Agora ele
    aparece sempre (trunca se faltar espaço), o passo cumprido vira ✓ e quem
    marca o passo atual é o contraste, não o âmbar.
  - **A escolha "etiqueta ou manual" deixou de ser card dentro de card.** Os
    dois caminhos **são** os cards agora, com a anatomia do card clicável da
    listagem (ícone chapado, título, apoio, seta) e um selo "Mais rápido" na
    etiqueta.
  - **Grades de bloco e de apartamento** viraram blocos chapados (`bg-muted`,
    sem borda), com o número em mono — a mesma leitura do resto do painel.
  - **Tipo do pacote** passou a usar a pílula do controle segmentado. Os botões
    tinham `border-1`, uma classe que o Tailwind nem gera — na prática estavam
    sem borda nenhuma.
  - **A revisão do passo 3 virou o `ListCard`**: o porteiro confere a encomenda
    no mesmo formato em que vai reencontrá-la na lista.
  - Rodapés dos cards perderam a faixa `bg-muted/50`, que pintava cantos retos
    por cima do card arredondado.
- **O modal de fotografar etiqueta agora é o `Dialog` do projeto.** Ele tinha
  overlay próprio, com raio, rolagem e X diferentes de todo o resto. O X, o
  Escape e o clique fora vêm do componente; a instrução de enquadramento virou
  `DialogDescription`.
- **O bloqueio "Lendo a etiqueta" também virou `Dialog`** — e fechá-lo (X,
  Escape ou clique fora) **aborta a leitura**, em vez de deixar o OCR terminando
  sozinho.
- Títulos e rótulos da tela passaram para caixa de sentença ("Registrar
  encomenda", "Dados do pacote", "Código de rastreio", "(opcional)").

---

## 0.24.12 — 2026-08-01

### Alterado
- **Controle segmentado ganhou tons próprios** (`--segmented` e
  `--segmented-active`), no lugar de `--muted`/`--card`. O trilho estava preso à
  hierarquia de superfícies e por isso mudava de leitura conforme o que havia
  embaixo: dentro de um card ele parecia mais escuro (era o desenho certo, o do
  par Código/Documento), mas na folha ficava **mais claro** que o fundo e a
  pílula selecionada praticamente sumia.
  - **Claro**: trilho no tom do shell (`#E8E4DE`) e pílula **branca**.
  - **Escuro**: o degrau inverte — trilho `#262626` e pílula quase preta
    (`#0A0A0A`). Quem marca a seleção é o contraste, não o "mais claro vence":
    pílula clara no escuro seria uma lâmpada no meio da tela.
- O anel de foco do segmento passou a usar o trilho como `ring-offset` — com a
  cor do fundo, o respiro entre o anel e a pílula virava um halo de outro tom.
- A pílula selecionada dispensou o `ring-border-surface`: com os tons novos, o
  degrau de tom já a separa nos dois temas.

---

## 0.24.11 — 2026-08-01

### Alterado
- **Tela de detalhe da encomenda alinhada à listagem.** Ela repete agora a
  anatomia do `ListCard`: bloco de ícone de 40px em `bg-muted`, rótulo
  `eyebrow`, valor em `txt-corpo` e **um só** dado com ênfase (o apartamento,
  em `txt-numero-sm`).
- **O estado da encomenda passou a ter um mapa só**
  (`components/encomendas/encomenda-status.ts`). Listagem e detalhe tinham cada
  um o seu: na lista, um ponto colorido "Aguardando"; no detalhe, um badge de
  outra cor escrito "Aguardando Retirada". Agora o cabeçalho do detalhe mostra o
  **mesmo ponto de status** do card, com o texto longo.
- **A linha do tempo usa a cor do estado.** O `TONE` do `StatusDot` virou a
  fonte: o ponto ao lado de "Aguardando" na lista é o mesmo círculo do marco
  "Encomenda recebida". Marco que ainda não aconteceu fica chapado, sem cor.
- **Âmbar decorativo removido da tela.** Saíram a borda âmbar do card de
  entrega, o ícone âmbar do cabeçalho dele, as bolinhas numeradas do passo a
  passo e a caixa âmbar em volta do código. O único âmbar que sobrou é o botão
  "Confirmar entrega" — que é a ação.
- **O código de retirada perdeu a caixa em volta**: o `CodigoStrip` já é o
  elemento de assinatura, e embrulhá-lo era caixa dentro de caixa. Ficou o
  rótulo `eyebrow` em cima e a nota de visibilidade embaixo.
- **Falha de WhatsApp** virou aviso chapado com bloco de ícone, no lugar da
  caixa com borda vermelha.
- Títulos da tela passaram para caixa de sentença ("Detalhes da encomenda",
  "Linha do tempo", "Foto do pacote"), como no resto do painel.
- **Esqueleto de carregamento agora fica dentro do `PageShell`** — o porteiro
  continua vendo a seta de voltar, e a forma das duas colunas já aparece (elas
  também estavam invertidas em relação ao layout real).

### Corrigido
- Alturas forçadas no botão "Confirmar entrega" e no campo de documento (regra
  17). A única que sobrou é o campo do código de 4 dígitos, que é o gêmeo do
  `CodigoStrip` — está comentado no código.

---

## 0.24.10 — 2026-08-01

### Corrigido
- **Botões de ação das Vagas ocupam a linha no celular**, como em Apartamentos:
  "Tabela de preços" e "Nova vaga" dividem a largura (`flex-1`) e voltam ao
  tamanho do rótulo no desktop (`sm:flex-none`), com `rounded-full`. Eles
  estavam dentro de um `div` extra, e esse embrulho tirava os botões da fita de
  ações do `PageShell` — era por isso que o `flex-1` não pegava.
- Mesmo alinhamento em **Meus condomínios**, **Administradoras** e
  **Assinaturas da plataforma**, que também destoavam (`w-full sm:w-auto` ou
  sem classe, e sem `rounded-full`).

---

## 0.24.9 — 2026-08-01

### Adicionado
- **`SegmentedFilter`** (`components/ui/segmented-filter.tsx`): o controle que
  recorta uma lista sem trocar de tela. Aceita ícone e contagem, e as classes
  vêm de `tabs.tsx` — as duas peças não têm como divergir.

### Alterado
- **Abas e filtros passaram a ser o mesmo controle.** Havia três desenhos
  diferentes para a mesma ideia: o filtro âmbar das Encomendas, as abas
  quadradas de Vagas/Assinaturas e as abas âmbar de sete colunas das telas de
  condomínio. Agora existe uma pele só (`TRILHO_SEGMENTADO`, `SEGMENTO`,
  `SEGMENTO_ATIVO`, em `components/ui/tabs.tsx`), com `rounded-full` no trilho e
  no segmento.
- **O segmento selecionado deixou de ser âmbar.** O sinal é da ação, e nessas
  telas o botão âmbar fica logo acima do controle — dois âmbares na mesma dobra
  e o botão deixa de saltar. Agora quem marca é o degrau de tom (`bg-card` sobre
  `bg-muted`) mais a sombra; no escuro, o fio de `ring-border-surface`.
- **Nada de `grid-cols-N` nos trilhos.** Coluna de largura fixa espremia
  "Pendentes" e "Cancelados" em 375px; o trilho quebra linha e a largura sai do
  rótulo. Também saíram os `min-h-[44px]` forçados (regra 17).
- **Filas de Disparo virou filtro, não abas.** Os cinco recortes mostram a mesma
  lista — era `Tabs` com um `TabsContent` só, o que anunciava painel inexistente
  para o leitor de tela.
- **Locações (Vagas)**: o select "Mostrar" virou filtro segmentado, igual ao das
  Encomendas.
- **Detalhe da encomenda**: o par Código/Documento era um `TabButton` local com
  a própria pele; agora é o `SegmentedFilter`.
- **Telas atualizadas**: Encomendas, Vagas (abas + locações), Filas de Disparo,
  Relatórios, Assinaturas da plataforma, Meu condomínio, Condomínio do
  superadmin e Detalhe da encomenda.

---

## 0.24.8 — 2026-08-01

### Alterado
- **Card de encomenda agora é o `ListCard`.** Ele montava a anatomia à mão e já
  tinha divergido: apartamento, destinatário e situação empilhados numa coluna
  só, descrição e metadados num rodapé com borda própria. Agora segue os três
  níveis das outras listas — ícone, apartamento (título), destinatário
  (subtítulo) e os campos com rótulo `eyebrow`: Situação, Recebida,
  Transportadora e Conteúdo.
- **O código de retirada continua no canto**, no slot novo `destaque` — e só
  aparece enquanto a encomenda está para ser retirada, como antes.
- **A falha de WhatsApp virou rodapé do card**, colada no pé; numa grade, os
  cards de uma linha esticam juntos e os avisos ficam alinhados.
- **Data**: o card mostra o tempo relativo ("há 2 h"), que é o que se lê na
  portaria, com a data exata no `title`. Antes mostrava os dois lado a lado.
- **Rótulos da tela de detalhe** passaram a usar `eyebrow`, o mesmo do card —
  quem abre o detalhe vindo da lista não vê a tipografia trocar de personagem.

### Adicionado
- **`ListCard` aceita `to`**: o card inteiro vira link para o detalhe, com seta
  ao lado do título e realce no hover (elevação e borda, sem âmbar). O alvo de
  toque passa a ser o card.
- **`ListCard` aceita `destaque`**: conteúdo no canto superior direito que não é
  botão. `acoes` continua para botão de ícone — as margens negativas de lá
  desalinham um bloco.

---

## 0.24.7 — 2026-08-01

### Alterado
- **`ListCard` ganhou hierarquia de leitura.** Antes era título + uma grade de
  campos todos com o mesmo peso. Agora são três níveis: título, **subtítulo**
  (novo — o que confirma qual registro é) e campos. O ícone virou bloco chapado
  (`bg-muted`), que dá o ponto de ancoragem para varrer a lista de relance.
- **Campos com ícone e com ênfase.** `campo.icone` põe um ícone no rótulo;
  `campo.enfase` sobe o valor para `txt-numero-sm` semibold — um por card, para
  o dado que a tela existe para mostrar (o valor do aluguel). O rótulo passou a
  usar `eyebrow`, o papel certo da escala, no lugar de `txt-nota uppercase`
  escrito à mão.
- **`rodape`** (novo): ações com texto no pé do card. O canto superior continua
  só para botão de ícone.
- **Listas ajustadas ao novo desenho**, cortando repetição:
  - **Moradores**: a unidade subiu para o subtítulo; sobraram telefone e
    notificação, lado a lado.
  - **Apartamentos**: os campos "Bloco" e "Número" saíram — o título já É
    bloco + número. O subtítulo escreve isso por extenso ("Bloco A · Unidade
    101") e o card só mostra observações quando existem.
  - **Equipe**: o e-mail (que é o login) virou subtítulo; papel e status ficaram
    lado a lado, com ícone.
  - **Vagas**: as duas listas (vagas e locações) montavam a anatomia do
    `ListCard` à mão e já tinham divergido dele — agora usam o componente. Na
    locação, o valor mensal é o campo com ênfase.

### Corrigido
- **Campo de largura inteira não trunca mais.** Ele existe justamente para texto
  longo (observação, e-mail), e o `truncate` escondia tudo depois da primeira
  linha; agora quebra linha.

---

## 0.24.6 — 2026-08-01

### Alterado
- **Menu do avatar (topo) reescrito.** Ele abre com um bloco de identidade
  chapado — avatar, nome, papel e, embaixo, e-mail e condomínio. O condomínio
  ali resolve a faixa entre `md` e `lg`, onde ele não aparece nem no cabeçalho
  do celular nem no do desktop.
- **Tema: o item mostra a escolha atual** ("Claro/Escuro/Sistema") à direita, com
  o ícone do tema escolhido e uma marca de seleção no submenu. O par sol/lua
  girando por CSS não conseguia representar "Sistema" e dependia de um `absolute`
  sem `relative` em volta.
- **`DropdownMenu` alinhado ao design system.** O conteúdo virou superfície
  flutuante de verdade (`rounded-surface`, `border-surface`, `shadow-panel-lg`) e
  cresce a partir do canto do gatilho; os itens perderam o canto vivo
  (`rounded-xs` → raio de controle) e ganharam base única com `gap-2` +
  `[&>svg]:size-4` — ícone em item novo não precisa mais de `mr-2`. Separador
  agora sangra até a borda, e o rótulo de grupo virou `eyebrow`.
- **Nada de âmbar no menu.** O anel de foco do avatar era o `--ring` âmbar e
  puxava a atenção para o canto da tela; virou neutro (`ring-border`), e o
  destaque do menu aberto é o próprio contorno do avatar. O sinal âmbar fica
  reservado para ação.

### Corrigido
- Itens do menu não forçam mais `min-h-[44px]` (regra 17) — a altura vem do
  padding, como em todo controle do shadcn.

---

## 0.24.5 — 2026-08-01

### Corrigido
- **O botão de fechar do diálogo cobria o título.** Ele era `absolute` no canto
  do `DialogContent` e flutuava por cima do texto sempre que o título ocupava a
  largura toda. Agora ele vive dentro do `DialogHeader`, em linha: o
  título/descrição ficam com todo o espaço que sobra (`flex-1` + `min-w-0`, para
  o título quebrar em vez de empurrar o botão para fora) e o X ocupa só o
  próprio ícone, encostado no canto por margem negativa — sem aumentar a altura
  do cabeçalho.
- **O `DialogHeader` tinha parado de renderizar o conteúdo.** O `children` vinha
  pelo spread de props e era descartado pelo filho explícito (o botão de
  fechar), então título e descrição não apareciam. O componente passou a receber
  `children` como prop e renderizá-lo.
- Alvo de toque do fechar deixou de forçar `min-h-[44px]/min-w-[44px]` à mão
  (regra 17) — agora é o ícone com padding.

---

## 0.24.4 — 2026-07-31

### Alterado
- **A barra do sistema do app instalado agora é âmbar (`#FFC72C`).** Era o
  grafite `#18181b`, herdado do tema antigo. Como o topo do app é a faixa âmbar,
  a barra vira continuação dela em vez de uma listra de outra cor.
  - `theme_color` no manifest (Android e barra de título no desktop) e as duas
    metas `theme-color` do `index.html` (barra do navegador quando o app não
    está instalado). Os dois temas usam o mesmo valor porque a faixa hoje é
    âmbar nos dois; se o escuro voltar ao âmbar fechado, a meta `dark` acompanha.
- **Splash (`background_color`) saiu do quase-preto para `#F3F0EA`**, o tom da
  folha clara. Ela não acompanha claro/escuro, e âmbar não serve: o ícone é
  âmbar e sumiria dentro de um fundo da mesma cor.

### Corrigido
- **iOS: status bar ilegível e conteúdo por baixo dela.** O
  `apple-mobile-web-app-status-bar-style` era `black-translucent`, que pinta o
  texto da status bar de **branco** (1,9:1 sobre o âmbar) e joga o conteúdo por
  **baixo** dela — e como não existe `padding-top: env(safe-area-inset-top)` em
  lugar nenhum, o menu e o avatar ficavam parcialmente sob o relógio do iPhone.
  Passou a `default`: texto escuro e conteúdo começando abaixo da barra.
  - iOS **não lê** `theme_color` do manifest, então essa meta é a única forma de
    tratar a status bar lá.

---

## 0.24.3 — 2026-07-31

### Corrigido
- **Barra de rolagem visível no conteúdo principal, no celular.** A causa não era
  o conteúdo: era o bloco global que estilizava `::-webkit-scrollbar` com 10px de
  largura. **Estilizar a barra faz o navegador sair do modo overlay** e passar a
  desenhar uma barra clássica, que ocupa espaço e não some sozinha — inclusive no
  toque, onde o padrão seria aparecer ao rolar e sumir.
  - A barra decorativa passou a valer só em `@media (pointer: fine)`, ou seja,
    para quem aponta com mouse ou trackpad. No toque volta o overlay nativo.
  - O container principal ganhou `max-md:rolagem-sem-barra`, escondendo a barra
    de vez abaixo de 768px. A rolagem continua por gesto, roda e teclado.

### Adicionado
- **`rolagem-sem-barra`** (`web/src/styles.css`): utility que esconde a barra sem
  tirar a rolagem. É `@utility` do Tailwind 4, e não uma classe solta, para
  aceitar variante — é assim que ela vale só no celular.

### Alterado
- **Em teste: a faixa do topo no modo escuro passou a usar o âmbar cheio
  (`#FFC72C`)**, no lugar do âmbar fechado (`#5C4400`) que vinha desde a 0.23.0.
  - O **texto voltou ao marrom** (`#3A2003`) junto, e não por estilo: sobre
    âmbar puro, o quase-branco que servia ao âmbar fechado cai para 1,9:1.
    No marrom são 10:1 — o mesmo do tema claro. Descrição (5,8:1) e eyebrow
    (4,5:1) também passam AA.
  - Os **controles da faixa continuam escuros** (busca, menu e avatar no tom do
    card). É o que mantém o topo reconhecível como modo escuro em vez de ficar
    idêntico ao claro.
  - Como voltar está escrito em `web/src/styles.css`, no bloco `.dark`: são
    quatro valores. O motivo original de fechar o âmbar é que ele é a única
    superfície grande com cor do app, e à noite tende a virar holofote — é
    exatamente isso que este teste mede.

---

## 0.24.1 — 2026-07-31

### Corrigido
- **Barra de rolagem vertical em toda tela, mesmo sem lista.** A folha branca do
  `PageShell` tinha `min-h-dvh` (introduzido em 0.24.0 ao desfazer uma injeção de
  `h-dvh` do editor). O container de rolagem mede `100dvh − altura do header`,
  então o conteúdo passava a medir `faixa + 100dvh` — sempre ~185px mais alto que
  o espaço disponível, com conteúdo ou sem.
  - A folha voltou a **crescer só com o conteúdo**. Quem a faz *parecer* chegar
    ao rodapé numa tela curta agora é o `bg-background` do container de rolagem:
    a área abaixo dela já é da mesma cor, então não há o que esticar.
  - De quebra, a sobreposição da folha sobre a faixa subiu de 16px para 24px —
    exatamente o raio do `rounded-t-3xl`. Com sobreposição menor que o raio, o pé
    do arco revelava o fundo da página em vez do âmbar e o entalhe sumia.

---

## 0.24.0 — 2026-07-31

**O painel inteiro passou a ter a mesma casca.** As 22 telas que vivem dentro do
`Layout` usam o `PageShell`: faixa âmbar no celular, cabeçalho comum no desktop.
`PageHeader` está aposentado.

### Alterado
- **Todas as telas convertidas para `PageShell`**: Dashboard, Encomendas,
  Detalhe da encomenda, Nova encomenda, Vagas, Assinatura, Avisos, WhatsApp,
  Filas, Relatórios, Meus condomínios, Configurar condomínio, e as cinco telas
  de plataforma (Condomínios, Gerenciar condomínio, Administradoras,
  Assinaturas, Etiquetas). Login e o autocadastro ficam de fora: são públicos e
  não têm barra de topo.
- **Encomendas**: a busca subiu para a faixa e o período (de/até) virou gaveta
  de filtro. O seletor de status continua na folha, como as demais abas.
- As páginas ficaram magras — sem `PageHeader` e sem `<div className="space-y-6 pb-10">`.

### Adicionado
- **`voltar` no `PageShell`**: em tela de detalhe ou formulário, o botão da
  esquerda da barra do topo vira uma seta em vez do menu. Usado em Detalhe da
  encomenda, Nova encomenda, Configurar condomínio e Gerenciar condomínio.
  - É a **única** coisa que atravessa a fronteira entre página e `Layout`, por
    um contexto de um valor só (`voltar-slot.tsx`). Título, busca e ações
    continuam desenhados pela página — mover aquilo para o contexto traria
    efeito por tela e título piscando na troca de rota.
- A skill `tela-listagem` ganhou os **quatro tipos de tela** (listagem, painel,
  detalhe, formulário) e a tabela do que cada tela declara.

### Corrigido
- **Uma extensão do editor havia trocado `h-full` por `h-dvh` em 19 lugares.**
  São coisas diferentes: `h-full` é 100% do elemento pai, `h-dvh` é a altura da
  janela. Na prática o avatar do topo, o ponto de status, o separador vertical,
  as barras de progresso dos relatórios e os cards de encomenda passariam a
  ocupar a tela inteira. Revertido, preservando os casos legítimos — onde o
  original era `h-screen`, o `h-dvh` fica (ele respeita a barra do navegador no
  celular).
- Rota `/apartamentonovo` e imports órfãos deixados pelo protótipo.

---

## 0.23.0 — 2026-07-31

**As telas de listagem ganharam uma casca própria no celular.** Faixa âmbar no
topo com título, busca e filtro; a folha branca sobe por cima dela. No desktop
nada disso aparece — lá a sidebar já dá a identidade.

### Adicionado
- **`PageShell`** (`web/src/components/ui/page-shell.tsx`): a casca das telas de
  listagem/cadastro. A página declara título, descrição, busca, filtros e ações;
  ele decide como isso vira faixa âmbar no celular e cabeçalho comum no desktop.
  - **A faixa é uma coisa só partida em dois arquivos**: a barra com menu,
    condomínio e avatar mora no `Layout`; título e busca, no `PageShell`. Elas se
    unem porque o `<main>` do `Layout` não tem padding nem fundo no celular.
  - Sem context e sem portal: custaria um efeito por tela e título piscando na
    troca de rota. O que une as duas metades é a cor, e ela vem do mesmo token.
- **Gaveta de filtros** com contador no botão. O botão **só existe se houver
  gaveta** — botão que não responde ensina o usuário a ignorar a interface.
  Filtros por tela: Apartamentos (bloco), Moradores (bloco, recebe WhatsApp),
  Equipe (papel, status).
- **Skill `tela-listagem`**: o passo a passo para replicar o layout nas demais
  telas, com o desenho das duas versões, as cinco regras que fazem a faixa
  funcionar e o checklist (inclui conferir o modo escuro).

### Alterado
- **Âmbar próprio para a faixa no modo escuro.** Tokens `--banner*`: no claro é o
  `#FFC72C` com texto `#3A2003` (10:1); no escuro fecha para `#5C4400` com texto
  quase branco (8:1). O âmbar puro num bloco daquele tamanho vira um holofote à
  noite — mas o **botão de ação continua no `#FFC72C` cheio** nos dois temas,
  porque ali a cor tem o tamanho de um botão.
- **Apartamentos, Moradores e Equipe** passaram para o `PageShell`, e as três
  páginas ficaram magras (sem `PageHeader`, sem wrapper com padding).
- **`embutido`** nos três managers: dentro das abas de `/admin/condominios/:id` e
  `/meus-condominios/:id` a listagem não desenha faixa nem título — a aba já diz
  onde a pessoa está, e o contrário seria cabeçalho de tela dentro de outro.
- O `<main>` do `Layout` perdeu padding, fundo e cantos **no celular** (no
  desktop segue o painel flutuante de sempre), que é o que deixa a faixa ir de
  ponta a ponta.

### Corrigido
- **A busca de Apartamentos tinha parado de funcionar**: o campo do protótipo era
  decorativo (sem estado) e o campo real estava comentado. Voltou a ir ao
  servidor com debounce — que é como ela acha unidade fora das 50 primeiras.
- **Rota `/apartamentonovo` apontava para uma página inexistente**, quebrando
  `npm run build`. Removida junto com o import.
- Cores fixas que ignoravam o tema (`bg-white`, `text-neutral-800`) trocadas por
  tokens. Os dois `bg-white` restantes são fundo de QR code, que precisa ser
  branco em qualquer tema.

### Notas
- **Vagas ainda não usa a faixa.** A tela tem abas de situação e precisa de uma
  decisão sobre onde elas ficam em relação ao cabeçalho; os cards dela já estão
  no padrão. Encomendas, Relatórios e Dashboard seguem no layout antigo.
- Vale abrir Apartamentos no **escuro** e conferir a faixa: é a mudança de cor
  mais visível e a única que não dá para julgar sem olhar.

---

## 0.22.0 — 2026-07-31

**O painel ficou mais leve.** A borda deixou de ser o que separa as coisas, o
card parou de morar dentro de outro card e as listas viraram cards legíveis no
celular. Claro, escuro e o âmbar `#FFC72C` continuam os mesmos.

### Alterado
- **A sombra virou o separador, não a borda.** `shadow-panel` ficou mais difusa e
  de opacidade menor, e a borda do card virou um fio (`--border-surface`) que
  quase não se vê. No escuro é o contrário — lá sombra não existe, então é a
  borda que dá o contorno.
- **O card agora SOBE nos dois temas.** No claro ele afundava no papel (card
  `#F7F5F1` abaixo da folha `#FBF9F6`); com a sombra assumindo a separação, tom e
  sombra diziam coisas opostas. A folha virou o cinza quente (`#F3F0EA`) e o card
  é o quase-branco que flutua sobre ela (`#FDFCFA`). Efeito colateral bem-vindo:
  o campo de formulário agora afunda no card **nos dois temas**, em vez de subir
  no claro e afundar no escuro.
- **Raio de superfície próprio** (`--radius-surface`, 20px, classe
  `rounded-surface`) para card, diálogo e gaveta. Botão e campo continuam nos
  12px de `--radius` — arredondar os dois juntos deformava o controle.
- **Card dentro de card virou proibido** e 39 blocos internos que tinham borda +
  preenchimento ficaram chapados (`rounded-lg bg-muted`, sem borda e sem sombra),
  em 22 arquivos. Era o aninhamento que dava o ar de formulário antigo.
- **Busca e ações saíram de dentro do card da lista** em Moradores, Apartamentos
  e Equipe. Elas comandam a lista; dentro, viravam mais uma caixa na caixa.
- **A paginação do `DataTable` some quando tudo cabe numa página** e ganhou o
  indicador "Página X de Y". Dois botões desabilitados sob uma lista de três
  itens eram só ruído.

### Adicionado
- **`ListCard`** (`web/src/components/ui/list-card.tsx`): um registro de lista
  como card, no padrão rótulo-pequeno-apagado sobre valor-forte. É ele que
  substitui o cabeçalho da tabela quando ela some no celular.
- **`DataTable` aceita `mobileCard`**: abaixo de `md` cada linha vira um card;
  a tabela volta no desktop. **Apartamentos, Moradores e Equipe** passaram a
  usar — antes a tabela de 5 colunas era espremida em 375px, e ver o telefone
  de um morador exigia arrastar até o nome sumir.
  - É uma prop, e não algo derivado das `columns`, de propósito: derivar
    despejaria "rótulo: valor" para toda coluna, inclusive as que só existem
    para ordenar. No celular o card é uma *escolha* do que importa.
- Vagas já mostrava cards e não tinha esse problema; ela adotou o mesmo par
  rótulo/valor para as telas ficarem irmãs.

### Notas
- **A mudança de superfície é a mais visível e vale conferir no claro.** Folha,
  card e bloco interno mudaram de tom juntos; o contraste do texto foi conferido
  (principal 16.8:1, secundário 6.4:1 sobre o card), mas o equilíbrio geral só se
  julga olhando.
- A navegação **não** mudou: continua sidebar/gaveta, não virou barra de abas
  inferior.

**A tipografia do painel voltou ao padrão.** O projeto tratava o porteiro como
um público que precisa de fonte aumentada e alvo de toque de 48px. Essa premissa
saiu do produto: a interface agora usa os tamanhos do shadcn/ui, iguais aos de
qualquer painel web.

### Alterado
- **Escala tipográfica retunada e sem crescimento no celular.** Corpo 14px em
  qualquer viewport (era 16px no celular / 14px no desktop); título de tela 24px
  (era até 30px); título de card 16px (era até 20px); KPI 24px (era até 36px).
  As classes de papel (`txt-titulo`, `txt-secao`, `txt-corpo`, `txt-apoio`…)
  **continuam sendo a única forma de definir tamanho** — só os valores mudaram,
  num arquivo só (`web/src/styles.css`). Nenhuma das 65 telas precisou ser
  tocada, e é isso que mantém a coerência: a próxima retunagem também será de
  um arquivo.
- **`txt-subtitulo`, `txt-corpo` e `txt-apoio` passaram a medir o mesmo (14px).**
  Numa escala padrão os degraus são curtos, então o que separa esses três papéis
  agora é **peso e cor**, não tamanho. As três classes continuam existindo de
  propósito: elas registram o papel, que é o que sobrevive à próxima mudança.
- **Alvo de toque de 48px removido** (102 ocorrências de `min-h-[48px]` em 23
  arquivos). `Button` e `Input` voltaram à altura padrão do shadcn (`h-9`);
  `SimpleSelect`, `SearchSelect` e `Combobox` acompanharam.
- **Regras de acessibilidade reescritas** no `CLAUDE.md` raiz, na doc do
  frontend e nas skills `tela-frontend` e `funcionalidade-nova`: "ícone sempre
  com texto" virou "botão só de ícone precisa de `aria-label`", e "label sempre
  visível" virou "`Label` no campo, salvo campo auto-evidente — e aí com
  `aria-label`". O que era regra de público-alvo virou regra de leitor de tela.

### Notas
- **No Safari do iPhone a página passa a dar um leve zoom ao focar um campo.**
  O navegador faz isso em campo com fonte abaixo de 16px e não desfaz sozinho.
  É consequência conhecida e aceita da decisão de padronizar tudo em 14px. Se
  incomodar, o conserto é devolver `text-base md:text-sm` **só** ao `Input` e ao
  `Textarea`, sem mexer na escala.
- As telas existentes não foram reestruturadas — nenhum formulário perdeu
  `Label`, nenhum botão perdeu texto. As regras deixaram de ser obrigatórias
  daqui para a frente; o que já está escrito continua válido.

---

## 0.21.1 — 2026-07-31

### Alterado
- **A lista de encomendas saiu da raiz e passou a ser `/encomendas`.** O menu já
  apontava para lá e só funcionava por acidente, via o redirect de rota
  desconhecida. A raiz continua existindo como redirect: ela é o `start_url` do
  PWA já instalado no celular do porteiro, e o endereço de quem salvou o atalho.

---

## 0.21.0 — 2026-07-30

**O condomínio virou o lugar onde tudo sobre ele é resolvido.** Antes, para
atender um cliente, a plataforma pulava entre um painel de WhatsApp com todos os
condomínios juntos e uma tela de assinaturas com todos os clientes juntos.
Agora `/admin/condominios/:id` tem sete abas e as duas novas — **Assinatura** e
**WhatsApp** — respondem por aquele condomínio, sem precisar "entrar" nele.

### Adicionado
- **Aba WhatsApp do condomínio** (`/admin/tenants/:tenantId/whatsapp`): conexão
  (QR, reconectar, desconectar), modelos de mensagem e ritmo de envio, operados
  pela plataforma. Existe por suporte: o QR e o "desconectar" eram só do
  síndico, então, quando o número caía, a plataforma não tinha como reconectar
  sem pedir a senha do cliente.
  - As faixas de edição **mudam com quem edita**: o síndico continua preso às
    regras anti-bloqueio (intervalo ≥ 60s, janela 08:00–21:00, 20 a 300/dia); a
    plataforma edita livre e ainda ajusta o `jitter`, que o condomínio nem
    enxerga. A tela é a mesma — ela valida pelo que o `GET` devolve em `limites`
    e `jitterEditavel`, em vez de repetir os números.
  - **Janela invertida continua recusada nos dois escopos**: não é uma licença
    da plataforma, é fila parada — nenhuma mensagem sairia.
- **Aba Assinatura do condomínio** (`/admin/assinaturas/condominios/:tenantId`):
  quanto ele custa e por quê, preço especial, dia de vencimento e o histórico de
  cobrança, numa resposta só.
  - **Condomínio de carteira deixou de mostrar histórico vazio.** Ele não tem
    fatura própria — é uma *linha* da fatura da administradora —, e agora a tela
    mostra exatamente isso: em quais faturas dela ele entrou, com o subtotal
    dele ao lado do total, e quanto ele pesa na conta hoje.
- **Dia de vencimento por condomínio** (`tenants.assinatura_dia_vencimento`,
  migration 027): o cliente que negociou "eu pago dia 5" passa a ter o dia dele
  na geração do lote. Sem isso, atendê-lo exigiria gerar a competência duas
  vezes, o que a idempotência da geração impede.
  - `NULL` (o caso da maioria) segue o dia pedido na geração, ou o padrão da
    plataforma — dia 10. A tela diz qual é o padrão que ele está seguindo.
  - **Não muda fatura já emitida**: o vencimento dela é fotografia. Vale da
    próxima geração em diante.
  - Recusado em condomínio de carteira: quem vence lá é a administradora, e
    aceitar o dia daria a impressão de um combinado que nunca seria aplicado.
- **A administradora vê a assinatura de cada condomínio da carteira**
  (`/minha-administradora/condominios/:tenantId/assinatura`), em leitura: quanto
  aquele condomínio pesa na conta dela e o que já foi cobrado. Negociar preço e
  vencimento continua só do superadmin.
- **Abas Assinatura e WhatsApp também em `/meus-condominios/:id`**, a tela da
  administradora — a de assinatura em leitura, a de WhatsApp editável (é
  operacional do condomínio, o mesmo que ela já fazia entrando nele).

### Alterado
- **Os três cards de WhatsApp (conexão, modelos, envio) aceitam `basePath`** e
  são empilhados por `WhatsappCondominioPanel`, usado pelas três telas que
  mostram isso. Card novo entra uma vez e aparece nas três. Mesma ideia do
  `AssinaturaCondominioPanel`, que muda de endpoint pelo `podeEditar`.
- Chaves de query do WhatsApp passaram a carregar o `basePath` — sem isso, a
  config de um condomínio apareceria na aba de outro.

### Removido
- **Painel consolidado `/admin/whatsapp`** (tela, controller e serviço). Sessão,
  modelos e ritmo são de **um** condomínio de cada vez; a lista de todos junta
  não era onde o problema era resolvido. O item some do menu da Plataforma.
- **Provisionamento em lote** (`provisionMissing`): existia para aquele painel, e
  o status da conexão já provisiona sozinho quando a instância falta.

---

## 0.20.1 — 2026-07-30

### Adicionado
- **"Lembrar meus dados" na tela de login**: caixa de seleção que guarda e-mail
  e senha no aparelho e traz os campos preenchidos no próximo acesso. O porteiro
  entra e sai do painel várias vezes por turno, quase sempre no mesmo celular da
  portaria — digitar e-mail e senha em teclado de celular era o atrito do
  começo de cada uso.
  - A caixa vem **desmarcada** e diz o que faz ("só marque se ele for seu"): a
    senha fica em texto puro no `localStorage`, e quem marca precisa saber.
  - Grava **só depois do login dar certo** — senha errada não vira senha salva.
  - Desmarcar apaga na hora, sem esperar um login novo.
- **`Checkbox` / `CheckboxField`** (`web/src/components/ui/checkbox.tsx`): caixa
  de seleção do design system, sem dependência nova, com o texto dentro de um
  alvo de toque de 48px.

### Alterado
- Campos de e-mail e senha do login agora declaram `autoComplete`, para o
  gerenciador de senhas do navegador funcionar como o usuário espera.

---

## 0.20.0 — 2026-07-30

**A leitura de etiqueta passou de protótipo a ferramenta.** A foto agora é
preparada no celular antes de subir, o OCR foi reajustado para etiqueta térmica
e o parser aprendeu as escritas que apareciam nas amostras reais. Junto veio o
que faltava para medir tudo isso: um botão que relê as fotos no OCR.

### Adicionado
- **Preparo da foto no cliente** (`web/src/lib/imagem.ts`): reduz para o tamanho
  que o OCR de fato usa e recomprime antes de subir. No 4G ruim de uma portaria
  é a diferença entre ~30s e ~4s de espera, sem perder um pixel útil.
- **Aviso de foto tremida** antes do upload — mede a nitidez na hora e oferece
  "tirar outra" em vez de gastar upload e 1 a 3s de CPU para não ler nada.
- **Visor de captura no desktop** (webcam, com escolha de câmera lembrada e
  aviso quando a resolução da stream é baixa demais para o OCR). No celular
  continua abrindo a câmera nativa, que tem autofoco e resolução melhores.
- **Cancelar a leitura**: leitura travada prendia o porteiro por até 30s com
  fila na frente.
- **Selo "lido"** ao lado de cada campo que veio do OCR, na revisão — a leitura
  é sugestão, e ele precisa saber onde olhar duas vezes.
- **`POST /admin/etiquetas/reprocessar-ocr`** (superadmin) e o botão "Reler tudo
  no OCR": baixa as fotos do bucket e relê antes de rodar o parser.
- **HEIC no serviço de OCR** — a API já aceitava `image/heic` e o serviço não
  abria: foto de iPhone morria como "Imagem inválida".
- 15 transportadoras novas no reconhecimento (Magalu, Shein, AliExpress,
  Rodonaves, Jamef, GOL Log, entre outras).

### Corrigido
- **Captura atravessando a quebra de linha no parser** — a classe de bug mais
  cara que ele já teve: `QTD 1 UN` numa linha e `0,350 KG` na seguinte davam
  `numero = 0`, e esse zero **vencia** o `APTO 51` verdadeiro impresso mais
  abaixo. Campo preenchido com valor errado é pior que campo vazio: ninguém
  confere o que já veio preenchido.
- **Nome de morador descartado por palavra que só o contém**: "Maria Chaves",
  "Ana Cristina Praça" e "Roberto Total" eram reprovados como se fossem
  endereço ou dado logístico — e o parser caía no fallback que devolve o
  **remetente**.
- **Remetente eleito como destinatário** quando quem enviou é uma loja ("Loja
  Fulano ME") ou quando a etiqueta marca `DESTINATÁRIO` mas não traz nome
  legível ali.
- **Etiqueta de marketplace classificada como Correios** por causa do "PAC" no
  rodapé; e código com prefixo `BR…` rotulado como Shopee (é prefixo nacional
  genérico, de várias transportadoras).
- **Unidade não encontrada por diferença de escrita**: `302`, `0302`, `302-B` e
  `302B` são a mesma porta, e o cadastro guarda o que o síndico digitou.
- **Morador não encontrado** por pontuação, preposição, sufixo ("Junior") ou
  nome cortado pela impressora térmica.
- **`/health` do OCR mudo durante a inferência**, o que marcava o container como
  unhealthy no meio de um lote de amostras.
- **Sessão expirada durante um upload** virava toast genérico em vez de levar
  ao login.
- Escala tipográfica na tela de etiquetas do superadmin (era a única tela do
  painel ainda com `text-sm`/`text-xs` solto).

### Regras
- **A busca da unidade olha fora do bloco, mas nunca escolhe.** A terceira
  tentativa só aceita quando existe uma única unidade com aquele número no
  condomínio inteiro. A regra é *nunca escolher entre várias* — desistir quando
  não há ambiguidade nenhuma jogava fora o caso mais comum, a etiqueta cujo
  bloco não saiu legível.
- **Mudança no serviço de OCR só aparece no placar via `reprocessar-ocr`.** O
  reprocessar barato roda apenas o parser sobre as linhas já gravadas — com ele,
  todo ajuste em `ocr/app.py` era imensurável.
- **Amostra cuja releitura falhar mantém as linhas antigas**: perder o histórico
  por uma indisponibilidade momentânea destruiria o caso de regressão.
- `PARSER_VERSAO` foi para **2**.

### Infra
- O container de OCR passa a limitar threads (`OMP_NUM_THREADS=2`), serializar a
  inferência e recusar rajada rápido em vez de enfileirar até o timeout — numa
  VPS onde API, Postgres, Redis e MinIO dividem a máquina, cada leitura roubava
  CPU do banco.
- Aquecimento do motor no start: a primeira inferência custa 2 a 4x o normal, e
  quem pagava era sempre a primeira etiqueta do dia do porteiro.
- `onnxruntime` travado em `<1.20`: o ORT muda default de threading entre
  minors, e uma minor nova num rebuild alterava a latência sem mudança de código.

---

## 0.19.0 — 2026-07-28

**A leitura de etiqueta chegou à portaria.** No "Escanear" do cadastro de
encomenda, o porteiro agora pode fotografar a etiqueta inteira: o OCR lê e os
campos que o parser entendeu já vêm preenchidos. O resto ele completa à mão.

### Adicionado
- **`POST /etiquetas/ler`** (`porteiro`, `sindico`): foto → OCR → parser →
  de-para com o cadastro do condomínio. Devolve os campos lidos, o apartamento
  que casou, o morador destinatário e quantas linhas o OCR conseguiu ler.
- **"Fotografar a etiqueta"** dentro do modal de scan, ao lado do leitor de
  código de barras — que continua ali, e continua melhor para código de rastreio.
- Preenche apartamento, destinatário, transportadora e rastreio; **a própria
  foto vira a foto do pacote** quando ainda não há nenhuma.

### Regras
- **Nada é sobrescrito**: campo já preenchido pelo porteiro fica como está.
- **Nada é salvo sozinho** — a leitura preenche, o porteiro revisa e confirma.
- **Unidade não identificada cai no cadastro manual** com bloco e número
  pré-preenchidos, nunca num apartamento "mais provável". Em condomínio de
  múltiplos blocos o mesmo número existe em vários: chutar seria entregar no
  bloco errado.
- **Morador só casa com nome idêntico ou primeiro+último nome batendo**, entre
  os moradores daquela unidade. Na dúvida, o porteiro escolhe — notificar o
  morador errado é pior que digitar o nome.
- **A administradora não tem a leitura** (só porteiro e síndico). Ela registra
  encomenda, mas isto foi definido como ferramenta de portaria; o botão fica
  escondido para ela, em vez de aparecer e dar 403.

### Nota
- O parser ainda está em calibração: quanto mais amostras conferidas em
  `/admin/etiquetas`, mais campos ele acerta. Espere preencher pouco no começo.

## 0.18.2 — 2026-07-28

Rodada de acertos na importação e na listagem de Apartamentos, depois de importar
um condomínio de verdade (122 unidades) e ver onde furava.

### Corrigido
- **A importação CSV não enviava o arquivo** (bug pré-existente): o diálogo usava
  `api.post`, que faz `JSON.stringify` no corpo e manda `application/json` — o
  `FormData` virava `"{}"` e o backend respondia "Nenhum arquivo enviado". Agora
  usa `api.upload` (multipart de verdade). Valia para os dois imports.
- **A busca de apartamentos não achava unidades que existiam.** A listagem vem
  cortada em 50, mas a tela filtrava **no cliente** — então buscar "501" só
  procurava entre as 50 já carregadas e dizia "nenhum encontrado" mesmo com a
  unidade no banco. Agora a busca vai ao **servidor** (com debounce), que casa por
  número, bloco e identificador. Mesmo padrão que o cadastro de morador já usava.

### Adicionado
- **Botão "Baixar modelo"** no diálogo de importação, nas duas telas. Gera o CSV
  no próprio navegador, com o **cabeçalho exato que o backend espera** e linhas de
  exemplo (com BOM, para o Excel abrir os acentos certos).
- **Total de unidades na tela de Apartamentos** (`GET /apartamentos/count`): a
  listagem é cortada em 50, então sem essa contagem não dava para saber quantas
  unidades o condomínio tem de verdade. Quando há mais que 50, a tela avisa que
  está mostrando as primeiras e que a busca encontra as demais.

### Por quê
- **O modelo mora ao lado do envio** (`MODELOS` em `ImportDialog.tsx`): o parser
  lê a coluna pelo nome, então cabeçalho do modelo e cabeçalho esperado não podem
  divergir — trocar um sem o outro quebraria todas as linhas em silêncio. Colunas:
  apartamentos `bloco,numero,observacoes,valor_condominio`; moradores
  `apartamento_identificador,nome,telefone,documento,email,principal,receber_whatsapp`.

## 0.18.1 — 2026-07-28

### Corrigido
- **Enviar amostra de etiqueta falhava com "Envie ao menos um arquivo no campo
  files"** em `/admin/etiquetas`. O `onChange` do input limpava
  `e.target.value` logo depois de chamar `mutate()`, mas `e.target.files` é uma
  lista **viva**: zerar o input esvaziava a mesma lista que o upload ainda ia
  ler, e o `FormData` subia sem arquivo. Agora os arquivos são copiados para um
  `File[]` antes da limpeza. (Zerar o input continua necessário — sem isso o
  `onChange` não dispara ao reenviar o mesmo arquivo.)

## 0.18.0 — 2026-07-28

Primeiro passo da leitura de etiqueta por foto: a infraestrutura de OCR e o
banco de amostras que vai calibrar o parser. **A leitura na portaria ainda não
está no ar** — ela depende de o parser acertar, e o parser só acerta depois de
ver etiqueta de verdade.

### Adicionado
- **Serviço de OCR próprio** (`ocr/`): RapidOCR (modelos PP-OCRv4 em ONNX
  Runtime) num container à parte, com
  `POST /ocr`. Roda dentro do servidor — nenhuma foto de etiqueta, que tem nome
  e endereço de morador, sai da nossa infra. Registrado no `docker-compose.yml`
  da raiz e no `deploy/`, então sobe sozinho no `./deploy.sh`.
- **Parser de etiqueta** (`src/modules/etiquetas/parser/`): transforma as linhas
  do OCR em destinatário, bloco, unidade, andar, transportadora, rastreio e CEP.
  Com testes unitários travando as armadilhas conhecidas.
- **Banco de amostras** em `/admin/etiquetas` (superadmin): sobe fotos em lote,
  mostra o que o OCR leu, permite marcar o gabarito de cada etiqueta e roda o
  parser contra tudo, com **placar de acerto por campo e por transportadora**.
  É a ferramenta que torna a melhoria do parser mensurável em vez de achismo.
- Tabela `etiqueta_amostras` (migration 026) e variáveis `OCR_BASE_URL` /
  `OCR_TIMEOUT_MS`.

### Notas
- Sem `OCR_BASE_URL` o módulo responde 503 e o resto da API não sente — o
  container de OCR pode ficar de fora num servidor apertado.
- **PaddleOCR foi a primeira escolha e não funcionou**: a wheel do PaddlePaddle
  aborta com `double free or corruption` na inicialização em parte dos
  servidores, e ainda pesava ~2 GB para servir um modelo de 15 MB. O RapidOCR
  usa **os mesmos modelos** convertidos para ONNX, embutidos na wheel (build sem
  download, ~400 MB de imagem, ~300–500 MB de RAM).
- `rapidocr-onnxruntime` está travado em **1.4.x** e exige **Python < 3.13** — é
  por isso que o Dockerfile usa 3.11. Ver `ocr/README.md`.
## 0.17.0 — 2026-07-28

O morador passa a poder se cadastrar sozinho por um **QR Code**, sem baixar app
nem ter login. O síndico (ou a administradora) gera o link em `/moradores`, ao
lado de "Importar CSV".

### Adicionado
- **Página pública de autocadastro** (`/cadastro/:token`, fora do login): o
  morador preenche nome, WhatsApp e escolhe a **própria unidade** entre as que o
  condomínio já cadastrou. Fluxo em três passos — preenche → **revisa** (confere
  bloco/unidade) → confirma → sucesso. O passo de revisão existe para pegar o
  erro de unidade antes de gravar.
- **Diálogo do link/QR** em `/moradores` (`QrAutocadastroDialog`): mostra o QR,
  copia o link, baixa o PNG e **gera um link novo** (revoga o anterior, com
  confirmação — para o caso de o link vazar).
- **Rotas**: públicas `GET|POST /public/autocadastro/:token` (o condomínio vem do
  token, nunca do corpo) e, para a gestão, `GET /moradores/autocadastro-link` +
  `POST .../rotate` (`@Roles('admin','sindico')`).
- Coluna `tenants.autocadastro_token` (UNIQUE, migration 025) e o helper
  `apiPublic` no front (requests sem `Authorization`/`X-Tenant-Id`).

### Segurança
- **O `tenantId` sai do token, resolvido no servidor** — o corpo não escolhe
  condomínio. Prova em `test/multitenant.e2e-spec.ts`: o token de um condomínio
  não cria morador em unidade de outro, token inválido/revogado responde **404
  genérico**, e a gestão do link exige login.
- **Escrita anônima com `@Throttle`** (5 cadastros/min por IP).
- **`principal` e `receber_whatsapp` ficam fora da mão de quem se cadastra** — são
  decisão da gestão; o DTO público nem os expõe. Quem cria de fato é o
  `MoradoresService.criar`, sem duplicar regra.

### Decisões
- **Cadastro ativo na hora** (sem fila de aprovação): a rede contra "bloco
  errado" é o passo de revisão na tela. O link revogável + o rate limit seguram o
  abuso.
- **Vale para todo condomínio** — não é módulo opcional.
- **Botão só aparece no contexto do condomínio** (`basePath === ''`): na tela do
  superadmin, que reaproveita o mesmo manager, a rota `@TenantId` não existe.

### Dependência
- `qrcode` no front (geração do QR). **Após este pull, `npm install` em `web/`.**

## 0.16.2 — 2026-07-27

Registrar encomenda ficou mais rápido no campo **Transportadora** e a
**Descrição** deixou de ser uma linha só.

### Adicionado
- **Transportadora agora tem sugestões** — 28 das que mais aparecem numa
  portaria (Correios, Mercado Livre, Shopee, Amazon, Loggi, Jadlog, J&T,
  Braspress, Azul Cargo, Rodonaves, DHL/FedEx/UPS, iFood/Rappi, "Motoboy /
  entrega particular"…), filtrando conforme se digita. Siglas também acham:
  "spx" chega em Shopee, "sedex" em Correios, "ml" em Mercado Livre.
- **`Combobox`** (`components/ui/combobox.tsx`), peça nova: campo de texto com
  sugestões. Teclado completo (↓/↑, Enter, Esc), alvo de toque de 48px na lista,
  e a lista **abre para cima** quando não cabe embaixo — o campo fica no meio de
  um formulário longo e, no celular, o teclado comeria a lista.
- **`lib/transportadoras.ts`**: a lista, com sigla de busca por item.

### Alterado
- **Descrição virou `Textarea` de 3 linhas.** Era um `Input` de uma linha, onde
  "caixa grande, frágil, deixar na portaria" sumia da vista ao digitar.

### Por quê
- **A lista sugere, não obriga.** O que for digitado fora dela continua valendo,
  com um aviso discreto ("Fora da lista — será registrado como você digitou").
  Lista fechada faria o porteiro que recebeu de uma transportadora regional
  escolher a errada ou deixar vazio — os dois piores desfechos para quem depois
  lê o relatório.
- **O ganho real é no relatório.** `/relatorios` agrupa as encomendas por
  transportadora; com digitação livre, "Correios", "correios" e "CORREIOS" eram
  três linhas. As sugestões fazem o caminho comum cair sempre na mesma grafia.
- **O leitor de código e a lista não podem divergir.** `detectarTransportadora()`
  preenche o campo sozinho ao escanear o pacote. Se devolvesse "Azul Cargo
  Express" com a lista dizendo "Azul Cargo", o mesmo pacote teria duas grafias
  conforme fosse escaneado ou digitado — e o relatório voltaria a se dividir.
  O detector passou a devolver `TransportadoraNome`, tipo derivado da lista:
  **nome fora dela não compila** (verificado quebrando de propósito).

## 0.16.1 — 2026-07-27

Todo texto do painel passa a sair de uma **escala tipográfica** única. Antes o
tamanho era decidido tela a tela: título de tela em três medidas diferentes,
título de card em quatro, número de KPI em quatro, e o mesmo papel de "texto
secundário" espalhado entre `text-sm`, `text-xs`, `text-[11px]` e `text-[10px]`.
Duas telas escritas em meses diferentes não saíam do mesmo tamanho.

### Adicionado
- **Escala tipográfica em `web/src/styles.css`** — uma classe por papel, cada
  uma já com a medida do celular e a do desktop:

  | Classe | Celular | Desktop | Papel |
  |---|---|---|---|
  | `txt-numero` | 30px | 36px | KPI, número em destaque |
  | `txt-numero-sm` | 20px | 24px | valor numérico em linha (total, contador) |
  | `txt-titulo` | 24px | 30px | título da tela |
  | `txt-secao` | 18px | 20px | título de card, diálogo, seção |
  | `txt-subtitulo` | 16px | 18px | nome do item no card, subtítulo de bloco |
  | `txt-corpo` | 16px | 14px | texto padrão, campo, botão, tabela |
  | `txt-apoio` | 14px | 14px | descrição, dica, texto secundário |
  | `txt-nota` | 12px | 12px | chrome: badge, legenda de gráfico, atalho |
  | `eyebrow` | 11px | 11px | rótulo mono maiúsculo (já existia) |

- **A regra virou documentação e skill**: seção "Escala tipográfica" no
  `CLAUDE.md` raiz, tabela + checklist em `web/src/CLAUDE.md`, e a skill
  `tela-frontend` agora manda escolher a classe pelo papel antes de escrever a
  tela. Regra 20 da lista de "Regras que DEVEM ser seguidas".

### Alterado
- **21 páginas e ~40 componentes migrados** — 423 linhas trocadas
  automaticamente e o resto a mão. Não sobrou nenhum `text-sm`, `text-lg`,
  `md:text-2xl` nem `text-[11px]` em `web/src/**/*.tsx`.
- **Os componentes de `components/ui/` passaram a carregar a classe certa**
  (`CardTitle`, `DialogTitle`, `Label`, `Input`, `Button`, `Badge`, `Table`,
  `TabsTrigger`, `PageHeader`, `StatCard`, `EmptyState`…). Com isso os overrides
  repetidos nas telas (`<Label className="text-base">` em 30 lugares) saíram —
  era por ali que a divergência voltava.
- **Texto secundário que estava em 12px subiu para 14px.** Descrição, dica e
  mensagem de erro em lista eram `text-xs`; pelo público do sistema, 12px só
  serve para chrome (badge, legenda de gráfico), não para frase que precisa ser
  lida. O que sobrou em `txt-nota` é só chrome.

### Por quê
- **O corpo encolhe do celular (16px) para o desktop (14px) de propósito.** No
  celular o porteiro está em pé, com o aparelho na mão e muitas vezes com
  presbiopia — 16px é o mínimo confortável, e é também o que impede o iOS de dar
  zoom ao focar um campo. No desktop a mesma pessoa está sentada, mais perto e
  com mais informação de uma vez. O `Input` já fazia isso (`text-base
  md:text-sm`); a escala só estendeu a regra para o resto do painel.
- **`txt-apoio` não encolhe** porque já é secundário pela cor; encolher também o
  levaria a 12px no desktop.
- As classes definem **só tamanho e entrelinha**. Peso, cor e família continuam
  utilitários à parte, e utilitário do Tailwind ainda vence a classe (camada
  `utilities` vem depois de `components`) — a saída de emergência existe, mas
  pede comentário. Hoje há uma única exceção: `file:text-sm` no `Input`, porque
  variante do Tailwind alcança utilitário e não classe da escala.

## 0.16.0 — 2026-07-27

A administradora passa a configurar os condomínios da carteira dela, sem
precisar pedir ao suporte. Antes só o superadmin tinha essa tela.

### Adicionado
- **Tela "Configurar condomínio"** (`/meus-condominios/:id`), aberta pelo botão
  **Configurar** no card da carteira. Cinco abas, como a do superadmin: Dados
  gerais, Configurações, Unidades, Moradores e Acessos.
- **A administradora edita o operacional**: cadastro (nome, CNPJ, endereço,
  contatos), tipo de condomínio, estrutura de blocos e janela de envio do
  WhatsApp. `PATCH /minha-administradora/condominios/:tenantId` agora aceita
  `configJson` com esses quatro campos.
- As peças visuais da tela de condomínio saíram de `SuperAdminTenant.tsx` para
  `components/condominio/condominio-shared.tsx` — as duas telas mostram o mesmo
  condomínio, muda só o que cada perfil pode salvar.

### Segurança
- **Plano, ativar/desativar e módulos contratados continuam só no superadmin.**
  `ativo` é o que mais importa: condomínio inativo sai da conta da assinatura
  (que conta apartamento ativo **de condomínio ativo**), então esse botão na mão
  de quem paga a fatura seria um jeito de baixar a própria conta. Módulo e plano
  aparecem na tela, de leitura — esconder faria o cliente achar que o recurso
  não existe.
- **A janela de envio respeita a mesma faixa da tela `/whatsapp`** (08:00–21:00,
  início antes do fim). Sem isso a rota nova seria o desvio para o condomínio
  passar a enviar de madrugada, que é o que queima o número.
- Campo fora do permitido responde **400** pelo `forbidNonWhitelisted` — não é
  ignorado em silêncio. Coberto por 8 casos novos em `test/multitenant.e2e-spec.ts`.

### Corrigido
- Salvar a configuração operacional **não apaga o resto do `config_json`** (os
  modelos de mensagem, o ritmo de envio e os módulos): o merge descarta chave
  ausente, mesma disciplina do `AdminService`. Invalida o cache do
  `TenantConfigService`, senão a mudança de estrutura de blocos só valeria
  depois do TTL.

---

## 0.15.0 — 2026-07-27

Assinatura do sistema — **fase 4, primeira metade**: o cliente passa a ser
avisado do vencimento. Antes, a fatura só era descoberta por quem ia olhar.

### Adicionado
- **Aviso de vencimento no painel**: faixa no topo da tela Assinatura a partir de
  **3 dias** do vencimento, mudando de tom no dia e depois de vencer — e um ponto
  colorido no item "Assinatura" do menu, para o aviso não depender de o cliente
  abrir a tela. Vale para o síndico de condomínio direto e para a administradora.
- A resposta de `GET /assinatura` e `GET /minha-administradora/assinatura` agora
  traz `aviso`: a fatura mais urgente, a distância até o vencimento e o total em
  aberto. `null` quando não há o que avisar.
- **A faixa de fatura vencida explica a baixa manual** ("já pagou? o registro
  pode levar até um dia útil"), que hoje é feita à mão pelo superadmin — sem essa
  linha, quem acabou de pagar abre chamado achando que o pagamento se perdeu.

### Decisões
- **O aviso não sai por WhatsApp.** A fila de disparo é do condomínio para o
  morador: `notificacoes.tenant_id` é `NOT NULL`, a sessão do OpenWA é uma por
  condomínio e a cota diária existe para proteger aquele número. Cobrar a
  assinatura por ali gastaria a cota das encomendas — e, para cliente
  administradora, não há sequer um número a usar. Aviso por WhatsApp depende de
  uma sessão própria da plataforma, que fica para a segunda metade da fase 4,
  junto do gateway de pagamento.
- **Quem decide se venceu é a data, não o `status`.** A fatura só vira `vencida`
  no banco quando alguém consulta; ler o status faria a tela mostrar "em aberto"
  numa fatura que venceu ontem.
- **A fatura em destaque é a de vencimento mais antigo**, mesmo havendo outras:
  é a que corre há mais tempo. Pela mais recente, uma fatura distante esconderia
  a que vence hoje.

### Corrigido
- `diaAnterior()` e a nova contagem de dias passam por meia-noite **UTC**: em
  fuso com horário de verão, dois dias vizinhos distam 23 ou 25 horas e a
  divisão truncava justamente na virada.

---

## 0.14.0 — 2026-07-27

Assinatura do sistema — **fase 3 de 4**: o cliente enxerga a própria conta, e a
plataforma ganhou tela. A cobrança deixou de existir só na API.

### Adicionado
- **Tela "Assinatura" para o cliente** (`/assinatura`): quanto paga neste mês, a
  conta aberta (quantidade × preço = valor), o preço especial quando existe e o
  histórico de faturas com status e vencimento. Uma tela só para os dois perfis —
  a administradora vê a carteira inteira, com a composição condomínio a
  condomínio; o síndico vê o próprio condomínio.
- **O síndico de condomínio de carteira é avisado de quem paga** em vez de cair
  numa tela vazia: a cobrança é com a administradora dele, e a tela diz isso.
- **Tela "Assinaturas" do superadmin** (`/admin/assinaturas`): cards de faturado,
  recebido, em aberto e vencido; faturas da competência com baixa e cancelamento;
  prévias de todos os clientes; e a tabela de preços editável.
- **Rotas do cliente**: `GET /minha-administradora/assinatura` e `GET /assinatura`,
  ambas só de leitura — dar baixa e mexer em preço continua sendo do superadmin.
- `fmtMoeda` / `fmtData` / `fmtCompetencia` saíram de dentro do módulo Vagas para
  `web/src/lib/formato.ts`, para as telas financeiras formatarem igual.

### Segurança
- **Fatura de outro cliente responde 404, não 403**: quem não é dono dela não
  pode nem descobrir que ela existe. O id do cliente nunca vem da URL — sai do
  usuário logado. Coberto por `test/assinaturas-cliente.e2e-spec.ts`, que também
  prova que o porteiro não vê a conta do condomínio.

---

## 0.13.0 — 2026-07-27

Assinatura do sistema — **fase 2 de 4**: as rotas do superadmin. Ainda sem tela;
por enquanto o caminho é a API (ou `npm run assinatura:previa`).

### Adicionado
- **`/admin/assinaturas`**, só para o superadmin: tabela de preços, preço
  especial, prévia por cliente, faturas do mês e o resumo do que foi faturado,
  recebido e está em aberto.
- **Emitir as faturas da competência** (`POST /faturas/gerar`), uma por cliente —
  condomínio direto ou administradora com a carteira somada. Rodar duas vezes não
  duplica; cliente sem apartamento ativo volta em `ignorados`, com o motivo, em
  vez de virar uma fatura de R$ 0,00.
- **Vencimento no mês seguinte** (padrão dia 10), porque a assinatura é pós-paga:
  a contagem de apartamentos só fecha quando o mês acaba. Dia 31 em mês de 30 cai
  no último dia, nunca transborda.
- **Baixa e cancelamento manuais** da fatura, enquanto não há conciliação
  automática. Cancelada sai dos totais — não foi cobrada e não é dívida.
- **Preço especial pela API**: criar uma condição encerra a anterior na véspera,
  na mesma transação, e o histórico fica. Condição em condomínio de carteira é
  recusada — quem paga por ele é a administradora.
- **Trocar a tabela de preços** substitui a lista inteira numa transação, exigindo
  tetos crescentes e a última faixa sem teto. Nada disso toca fatura emitida — há
  teste provando que mexer no preço não reescreve o passado.

---

## 0.12.0 — 2026-07-27

Assinatura do sistema — **fase 1 de 4**: dados e cálculo, ainda sem rotas nem
telas.

### Adicionado
- **Cálculo da assinatura por apartamento, em faixas** (migration 024):
  3,99 até 50 · 3,49 de 51 a 200 · 2,99 acima de 200. A faixa encontrada vale
  para todos os apartamentos — não é escalonado por trecho.
- **Quem paga sai do vínculo**: condomínio sem administradora paga o próprio;
  condomínio de carteira entra na fatura da administradora, que soma a carteira
  inteira para achar a faixa (desconto por volume). Nenhum condomínio é cobrado
  duas vezes.
- **Preço especial** por condomínio ou por administradora, em três modos (preço
  por apartamento, valor fixo mensal ou tabela) mais desconto percentual, com
  vigência e histórico.
- Estrutura da fatura mensal e da composição por condomínio, com a fotografia do
  que foi cobrado (quantidade, modo, preço) — mudar a tabela de preços não
  reescreve fatura emitida.
- `npm run assinatura:previa` imprime quanto cada cliente pagaria hoje, para
  conferir o cálculo sem depender de tela.

---

## 0.11.0 — 2026-07-27

Rodada de escala no disparo de notificações. O gargalo era estrutural: um único
worker sequencial para a plataforma inteira, com teto de ~40 mensagens/minuto
somadas todas as instâncias de WhatsApp.

### Alterado
- **Envio paralelo entre condomínios, serial dentro de cada um.** O worker passa
  a processar `NOTIFICATION_CONCURRENCY` jobs (padrão 15) com uma trava no Redis
  por condomínio. Antes era `concurrency: 1` global — um gateway lento em um
  condomínio segurava a fila de todos.
- **Timeout de 15s nas chamadas ao gateway** (`OPENWA_TIMEOUT_MS`). Sem ele o
  Node esperava até 5 minutos e o worker ficava preso nesse tempo.
- **Cache de JID do destinatário (30 dias) e do status da sessão (30s)**: o
  envio caiu de 3–4 chamadas HTTP ao gateway para 1. O `UPDATE tenants` por
  mensagem só acontece quando o status muda.
- **Disparo em massa em lote** (`agendarEmLote`): um aviso para o prédio inteiro
  virou um `INSERT` e um `addBulk`, em vez de centenas de idas ao banco dentro
  do request do síndico. Cobrança de condomínio também deixou de fazer uma
  consulta de moradores por apartamento.
- Uma conexão Redis compartilhada (`common/redis`) no lugar de uma por serviço.

### Corrigido
- **Reserva de horário de envio agora é atômica** (script Lua). Duas encomendas
  registradas no mesmo segundo — ou duas réplicas da API — recebiam o mesmo
  horário e saíam juntas pelo mesmo número, que é exatamente o padrão de rajada
  que faz o WhatsApp bloquear.
- **Limite diário conta o dia em que a mensagem sai**, não o dia em que foi
  criada. Com fila acumulada, o adiado para amanhã contava hoje e não contava
  amanhã, deixando o número furar o próprio limite.
- **Aviso respeita o opt-out do morador** (`receber_whatsapp`). A regra estava
  na documentação do módulo mas não no código: a consulta só filtrava `ativo`.

### Adicionado
- `WORKER_ENABLED=false` desliga o consumo da fila numa instância, para escalar a
  API na horizontal sem multiplicar os workers de envio.
- Índices `(tenant_id, created_at)` e `(tenant_id, enviada_at)` em `notificacoes`
  (migration 023).
- Log do tempo de cada envio, para medir o teto real em vez de estimá-lo.

---

## 0.10.0 — 2026-07-27

### Adicionado
- **Mensagem de retirada personalizável**: em `/whatsapp`, o síndico (e a
  administradora) agora edita dois modelos — o de chegada da encomenda e o novo
  de confirmação de retirada — com variáveis, prévia e restauração do padrão.
- Os mesmos dois modelos ficam editáveis em `/admin/whatsapp` (superadmin).
- **Regras de envio editáveis pelo síndico** (card novo em `/whatsapp`): espera
  entre mensagens (mínimo 60s, só para cima), janela de envio (dentro de
  08:00–21:00) e limite diário (20 a 300). Os limites vêm do backend e a tela
  mostra quantas mensagens cabem por dia no ritmo escolhido. Acima dessas
  faixas, só o superadmin em `/admin/whatsapp`.

### Corrigido
- **A sidebar era desmontada e remontada a cada troca de rota** — piscava e
  perdia a rolagem do menu, quando só o conteúdo principal deveria mudar. Causa:
  `SidebarBody` era declarado dentro do `Layout`, virando uma função nova a cada
  render; o React trata isso como outro componente e refaz o DOM inteiro. Mesmo
  problema corrigido no `TabButton` de `DetalheEncomenda`.

### Alterado
- Os campos de mensagem **abrem preenchidos com o texto que o morador recebe
  hoje** (o do condomínio, ou o padrão do sistema). Antes abriam em branco, e
  mudar uma palavra exigia reescrever a mensagem inteira. Campo vazio continua
  significando "usar o padrão".
- O texto de retirada saiu de `whatsapp/templates.ts` (fixo) para
  `notificacoes/message-template.ts` (personalizável). As variáveis `{{data}}` e
  `{{hora}}` dele são as da retirada, não as do recebimento.

---

## 0.9.0 — 2026-07-27

### Adicionado
- **Controle de versão do app**: a versão aparece na sidebar, junto do condomínio.
- **Atualização automática (web e PWA)**: o app procura build novo a cada minuto,
  ao voltar ao primeiro plano e ao reconectar. Quando encontra, recarrega sozinho
  em momento seguro — na troca de tela ou com o app ocioso — nunca no meio de um
  cadastro. Enquanto espera, oferece "Atualizar agora".
- `GET /api/health` agora informa a versão da API.
- `npm run versao` sobe o número nos dois `package.json` de uma vez.

### Corrigido
- Diálogos de cadastro (vaga, equipe, morador, apartamento e todos os demais)
  eram cortados em cima e embaixo no celular. Agora têm margem de 1rem em volta,
  altura em `dvh` e rolagem interna.

---

## Histórico anterior (reconstruído dos commits)

O versionamento passou a existir na 0.9.0. As versões abaixo são uma leitura do
histórico do Git, agrupando os 30 commits por marco — servem de linha do tempo,
não existiram como release.

| Versão | Data | Marco | Commits |
|---|---|---|---|
| 0.1.0 | 2026-05-12 | Base do sistema: backend NestJS + frontend React + deploy | `3a9af65` |
| 0.1.1 | 2026-05-12 | Ajustes de deploy (Render, migrations no start, build TS) | `09bcd01`…`ece30b7` |
| 0.2.0 | 2026-05-12 | Gestão de usuários (síndico cria porteiro, superadmin gerencia condomínios) | `0a84f91`, `19b0983` |
| 0.3.0 | 2026-05-12 | Leitor de QR/código de barras na portaria + cadastro de apartamento no lançamento | `d135e1b`, `b6d751a` |
| 0.3.1 | 2026-05-12 | Correções do scanner (overflow no celular, tela branca ao parar a câmera) | `89f4846`, `392bb56` |
| 0.4.0 | 2026-07-22/23 | Rodada de melhorias: logins, ajustes visuais e deploy local de desenvolvimento | `e9e9033`…`212dbd6` |
| 0.5.0 | 2026-07-24 | Notificação por WhatsApp via OpenWA (sessão por condomínio, Docker Compose) | `bac3b04`…`5dab0f6` |
| 0.6.0 | 2026-07-24 | Dashboard | `88a3616`, `c195f7f` |
| 0.7.0 | 2026-07-24/25 | Atualização das libs (NestJS 11, React 19, Vite 7, Tailwind 4) e relatórios | `1e045e3`, `4c37370` |
| 0.8.0 | 2026-07-25 | Módulo de Vagas, padronização do projeto e melhorias de qualidade de vida | `533b5ad`, `0a5e87a` |
