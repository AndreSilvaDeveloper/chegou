# Changelog — Chegou 📦

Formato da versão: **MAIOR.RECURSO.CORREÇÃO** (ver "Versionamento" no `CLAUDE.md`).

- **MAIOR** — virada de versão do produto (quebra de compatibilidade, marco grande)
- **RECURSO** — funcionalidade grande nova (módulo, tela, integração)
- **CORREÇÃO** — bug corrigido, ajuste visual, refino

Quem mexe no sistema sobe a versão (`npm run versao correcao|recurso|maior`) e
escreve aqui o que mudou, no mesmo commit.

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
