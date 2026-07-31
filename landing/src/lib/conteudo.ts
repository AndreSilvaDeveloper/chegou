/**
 * TODO o texto da página, num lugar só.
 *
 * Os componentes ficam responsáveis por COMO as coisas aparecem; este arquivo,
 * por O QUE elas dizem. É o que permite revisar a copy inteira sem abrir um
 * único `.tsx`, e o que impede um texto de ficar escondido no meio de markup.
 *
 * `**assim**` vira negrito de destaque na renderização (ver `ui/Texto.tsx`).
 * Guardar marcação simples em vez de JSX mantém este arquivo como dado — quem
 * escreve a copy não precisa saber React.
 */

export const MARCA = {
  nome: 'CONDO',
  sufixo: 'avisa',
  completo: 'CONDO avisa',
  descricao:
    'Central de portaria para condomínios. A encomenda chega, o morador sabe — e o porteiro volta sua atenção para o essencial.',
  // TODO: trocar pelo e-mail real antes de publicar.
  email: 'contato@condoavisa.com.br',
} as const;

export const NAVEGACAO = [
  { id: 'problema', rotulo: 'O problema' },
  { id: 'funciona', rotulo: 'Como funciona' },
  { id: 'diferenca', rotulo: 'A diferença' },
  { id: 'preco', rotulo: 'Preço' },
  { id: 'duvidas', rotulo: 'Dúvidas' },
] as const;

export const HERO = {
  selo: 'Central de portaria · **o morador não baixa nada**',
  tituloLinha1: 'Chegou.',
  tituloLinha2: 'E o morador já sabe.',
  subtitulo:
    'O porteiro registra a encomenda em segundos. O morador recebe a mensagem **no WhatsApp do próprio condomínio**, com um código de 4 dígitos para retirar. Sem aplicativo, sem senha, sem cadastro — nem hoje, nem nunca.',
  acaoPrimaria: 'Agendar uma demonstração',
  acaoSecundaria: 'Ver como funciona',
  provas: ['Sem app para o morador', 'Sem fidelidade', 'Preço na tabela, não na reunião'],
} as const;

/** Os recados que giram em volta da caixa. Cada um é um momento real do fluxo. */
export const BALOES = [
  { icone: 'relogio', titulo: 'Registrada em 20s', apoio: 'pelo porteiro, no celular' },
  { icone: 'etiqueta', titulo: 'Etiqueta lida por foto', apoio: 'apartamento A-302' },
  { icone: 'mensagem', titulo: 'Marina foi avisada', apoio: 'no WhatsApp do condomínio' },
  { icone: 'codigo', titulo: 'Código 4821', apoio: 'gerado para a retirada' },
  { icone: 'escudo', titulo: 'Retirada confirmada', apoio: 'às 14:41, com código' },
] as const;

export const PROBLEMA = {
  eyebrow: 'O que acontece hoje',
  titulo: 'A portaria virou depósito — e ninguém decidiu isso.',
  apoio:
    'O comércio eletrônico multiplicou os volumes e a portaria absorveu o impacto sem ganhar uma pessoa a mais. O resultado aparece sempre nos mesmos quatro lugares.',
  dores: [
    {
      icone: 'pessoas',
      titulo: 'Sobrecarga na portaria',
      texto:
        'Horas por dia recebendo, empilhando, procurando e entregando pacote. Cada minuto disso é um minuto afastado da sua atribuição principal: **o controle de acesso**.',
    },
    {
      icone: 'duvida',
      titulo: '"Mas eu nem sabia que tinha chegado"',
      texto:
        'Sem aviso, o pacote dorme na portaria. Ele acumula, atrapalha a circulação e vira o próximo item extraviado — a maior parte do sumiço começa como pacote esquecido.',
    },
    {
      icone: 'alerta',
      titulo: 'Sumiu. E agora, de quem é a culpa?',
      texto:
        'Sem registro de quem entregou e de quem retirou, a discussão é palavra contra palavra. Sobra para o porteiro, respinga no síndico e o condomínio às vezes paga a conta.',
    },
    {
      icone: 'mensagem',
      titulo: 'O grupo do condomínio explode',
      texto:
        '"Chegou alguma coisa pra mim?" às onze da noite. Cada reclamação no grupo dá ao prédio inteiro a impressão de que a gestão está desorganizada — mesmo quando não está.',
    },
  ],
  /* A frase tem uma dobradiça no meio: nega uma coisa e afirma outra. Guardar
     as duas metades separadas deixa a forma mostrar isso — a negação recua, a
     afirmação avança. Numa string só, as duas teriam o mesmo peso. */
  viravolta: {
    eyebrow: 'A virada',
    nega: 'Nenhum desses quatro é problema de esforço.',
    afirma: 'Os quatro são problema de **aviso**.',
  },
} as const;

export const COMO_FUNCIONA = {
  eyebrow: 'Como funciona',
  titulo: 'Três passos. O morador participa de um.',
  apoio:
    'Do balcão à retirada, sem caderno, sem ligação e sem ninguém precisar aprender um sistema novo.',
  passos: [
    {
      tempo: '≈ 20 segundos',
      titulo: 'O porteiro registra',
      texto:
        'Ele escolhe a unidade e pronto. Se preferir, **fotografa a etiqueta**: o sistema lê o destinatário, o bloco, o apartamento e a transportadora, e devolve tudo preenchido para ele só conferir.',
    },
    {
      tempo: 'na hora',
      titulo: 'O morador é avisado',
      texto:
        'A mensagem sai do **número do próprio condomínio**, com o código de 4 dígitos. Ele não instala nada, não cria senha e não precisa lembrar de nada — a mensagem chega onde ele já está.',
    },
    {
      tempo: 'com prova',
      titulo: 'A retirada fica registrada',
      texto:
        'Ele desce, informa o código, e o porteiro dá baixa. Fica gravado quem retirou, quando, e com qual código — e o morador recebe a confirmação da retirada no mesmo lugar.',
    },
  ],
} as const;

/**
 * Os cinco diferenciais. Cada um tem DUAS versões do mesmo assunto:
 * `chamada` é a frente do cartão — a frase curta que se lê de relance;
 * `cena` é o desenho animado que acompanha essa frente;
 * `texto` (e os `itens`) são o verso, que aparece ao virar.
 */
export const DIFERENCA = {
  eyebrow: 'A diferença',
  titulo: 'Cinco decisões que quase ninguém toma.',
  apoio:
    'Todo sistema de portaria promete organizar encomenda. A diferença está nas escolhas que aparecem no terceiro mês de uso.',
  tijolos: [
    {
      largo: true,
      destaque: true,
      icone: 'celular',
      titulo: 'Zero adesão a conquistar',
      cena: 'pronto',
      chamada: 'Se o morador tem WhatsApp, já está pronto',
      texto:
        'O que mata aplicativo de condomínio não é o aplicativo: é a adesão. Metade do prédio nunca baixa, e o síndico passa o ano cobrando cadastro. Aqui não existe essa etapa — se o morador tem WhatsApp, ele já está pronto. **Não há nada para ele instalar, hoje ou depois.**',
      itens: [
        'Funciona no primeiro dia, para 100% das unidades',
        'Nada muda quando o morador troca de celular',
      ],
    },
    {
      largo: true,
      icone: 'mensagem',
      titulo: 'O número é do condomínio, não da plataforma',
      cena: 'linha',
      chamada: 'A mensagem chega com o nome do prédio',
      texto:
        'Cada condomínio tem a própria linha. A mensagem chega com o nome do prédio, não de uma empresa que o morador nunca ouviu falar — e é por esse mesmo número que ele responde quando quer perguntar algo. Um disparo genérico de número desconhecido é o que o morador silencia na primeira semana.',
    },
    {
      icone: 'etiqueta',
      titulo: 'A etiqueta se lê sozinha',
      cena: 'leitura',
      chamada: 'Fotografe o pacote e confira os campos',
      texto:
        'O porteiro fotografa o pacote e os campos vêm preenchidos. Nada é salvo sem ele conferir — e nenhuma foto sai do servidor do condomínio.',
    },
    {
      icone: 'cadeado',
      titulo: 'O envio tem ritmo — e isso protege o número',
      cena: 'ritmo',
      chamada: 'Sem rajada, a linha não é bloqueada',
      texto:
        'Disparo em rajada é o que faz o WhatsApp bloquear uma linha. As mensagens saem espaçadas, dentro do horário que o síndico definir, com teto diário. Um aviso para o prédio inteiro não queima a linha da portaria.',
    },
    {
      icone: 'escudo',
      titulo: 'Os dados ficam no servidor do condomínio',
      cena: 'dentro',
      chamada: 'Nenhuma foto sai para serviço de terceiro',
      texto:
        'Etiqueta tem nome e endereço de quem mora ali. Nada é enviado para serviço de terceiro — nem a foto, nem a leitura. É a diferença entre confiar e ter certeza.',
    },
  ],
} as const;

/**
 * As quatro leituras do painel.
 *
 * `rotulo` é o nome da grandeza — é ele que faz a linha ler como instrumento.
 * `cena` é a face do mostrador, ao lado do valor.
 */
export const NUMEROS = {
  eyebrow: 'Onde o ganho aparece',
  titulo: 'O que muda quando o aviso é automático.',
  itens: [
    {
      rotulo: 'Tempo de registro',
      cena: 'cronometro',
      valor: '20s',
      texto: 'para registrar uma encomenda, da chegada ao aviso enviado',
    },
    {
      rotulo: 'Apps para o morador',
      cena: 'vazio',
      valor: '0',
      texto: 'aplicativos que o morador precisa instalar para ser avisado',
    },
    {
      rotulo: 'Dígitos do código',
      cena: 'codigo',
      valor: '4',
      texto: 'dígitos que provam quem retirou — e encerram a discussão',
    },
    {
      rotulo: 'Número por prédio',
      cena: 'unica',
      valor: '1',
      texto: 'linha de WhatsApp por condomínio, com o nome do prédio',
    },
  ],
} as const;

export const PERFIS = {
  eyebrow: 'Para quem trabalha no prédio',
  titulo: 'Três pessoas diferentes. Três telas diferentes.',
  apoio:
    'Um sistema que serve o síndico mas atrapalha o porteiro não é usado. Cada perfil vê o que precisa e nada além.',
  itens: [
    {
      icone: 'capacete',
      papel: 'Porteiro',
      titulo: 'Registrar e entregar',
      texto:
        'Botão grande, letra grande, uma coisa por tela. Feito para ser usado em pé, com o celular numa mão e o pacote na outra — inclusive no sol da portaria, onde tela clarinha some.',
      itens: [
        'Escanear código ou fotografar a etiqueta',
        'Dar baixa com o código do morador',
        'Consultar de quem é a vaga, quem mora onde',
      ],
    },
    {
      icone: 'predio',
      papel: 'Síndico',
      titulo: 'Enxergar e responder',
      texto:
        'Quando alguém reclama, a resposta está na tela: quem registrou, quando o aviso saiu, quem retirou. Chega de arbitrar discussão sem informação.',
      itens: [
        'Avisos para o prédio, um bloco ou uma unidade',
        'Moradores, unidades, equipe e vagas de garagem',
        'Relatórios de volume, tempo de retirada e produtividade',
      ],
    },
    {
      icone: 'pasta',
      papel: 'Administradora',
      titulo: 'Gerir a carteira',
      texto:
        'Todos os condomínios sob sua gestão num lugar só, com troca de prédio em um clique — e uma conta única no fim do mês, não uma por condomínio.',
      itens: [
        'Cadastrar e configurar condomínios da carteira',
        'Desconto por volume somando a carteira inteira',
        'Fatura única, com a composição por prédio',
      ],
    },
  ],
} as const;

export const PRECO = {
  eyebrow: 'Preço',
  titulo: 'Por apartamento. Na tabela, não na reunião.',
  apoio:
    'A faixa vale para todos os apartamentos — não é somada por trecho. Unidade desativada sai da conta sozinha, no mês seguinte.',
  faixas: [
    { rotulo: 'Até 50 apartamentos', valor: 'R$ 3,99' },
    { rotulo: 'De 51 a 200 apartamentos', valor: 'R$ 3,49' },
    { rotulo: 'Acima de 200 apartamentos', valor: 'R$ 2,99' },
  ],
  exemplo: {
    texto:
      '**Um prédio de 120 unidades** cai na faixa de R$ 3,49 — e os 120 apartamentos pagam esse valor, não uma mistura de faixas.',
    conta: '120 × R$ 3,49',
    total: 'R$ 418,80/mês',
  },
  inclui: {
    titulo: 'Vem tudo junto',
    itens: [
      'Encomendas ilimitadas, sem cobrança por mensagem',
      'Usuários ilimitados — todos os porteiros, todos os turnos',
      'Leitura de etiqueta por foto',
      'Avisos, moradores, equipe e relatórios',
      'Atualizações automáticas, sem parar a portaria',
    ],
  },
  administradoras: {
    eyebrow: 'Administradoras',
    texto:
      'A carteira soma para o desconto. Três condomínios de 40 unidades somam 120 — e **todos os três pagam R$ 3,49**, mesmo que sozinho cada um ficasse na faixa de R$ 3,99.',
  },
  rodape:
    'Módulos de garagem e avisos entram conforme o condomínio contrata. Fale com a gente para o que fugir da tabela.',
} as const;

export const DUVIDAS = {
  eyebrow: 'Antes de perguntar',
  titulo: 'As dúvidas que todo síndico traz.',
  itens: [
    {
      pergunta: 'E se o WhatsApp bloquear o número do condomínio?',
      resposta:
        'É a pergunta certa, e a razão de metade da engenharia do produto. O que faz uma linha ser bloqueada é **rajada**: cinquenta mensagens idênticas saindo no mesmo minuto. Aqui as mensagens saem espaçadas e com variação, só dentro do horário que o síndico definir, com teto diário — e cada condomínio tem a própria linha, então o volume de um prédio nunca afeta o outro. Um aviso para 200 moradores é distribuído ao longo do dia, não disparado de uma vez.',
    },
    {
      pergunta: 'E o morador que não tem WhatsApp?',
      resposta:
        'Ele continua retirando normalmente, apresentando um documento — a baixa é registrada do mesmo jeito. E qualquer morador pode pedir para não receber mensagem: o sistema respeita e o porteiro vê isso no cadastro.',
    },
    {
      pergunta: 'Quanto tempo o porteiro leva para aprender?',
      resposta:
        'Uma troca de turno. A tela dele tem três botões: registrar, procurar, dar baixa. Tudo foi dimensionado para quem trabalha em pé e muitas vezes precisa de letra maior — **botão grande, um campo por linha, nome sempre ao lado do ícone**. Não existe menu escondido nem gesto para decorar.',
    },
    {
      pergunta: 'Precisa instalar alguma coisa na portaria?',
      resposta:
        'Não. Funciona no navegador do computador da portaria e no celular. Se quiser, o porteiro adiciona à tela inicial e ele abre como aplicativo — sem passar por loja. As atualizações chegam sozinhas, e nunca no meio de um cadastro.',
    },
    {
      pergunta: 'E os dados dos moradores? E a LGPD?',
      resposta:
        'Tudo fica em servidor próprio, inclusive a leitura das etiquetas — que carregam nome e endereço de quem mora ali. **Nenhuma foto é enviada para serviço de terceiro.** Cada condomínio enxerga apenas os próprios dados, e toda ação de gestão fica registrada com autor e horário.',
    },
    {
      pergunta: 'Já usamos uma planilha e um grupo de WhatsApp. Vale a troca?',
      resposta:
        'A planilha registra o que chegou; ela não avisa ninguém, e é aí que o pacote começa a dormir na portaria. O grupo avisa, mas avisa o prédio inteiro sobre a encomenda de uma pessoa — e é onde a reclamação nasce. A troca resolve os dois de uma vez: **aviso individual, registro automático.** A importação do cadastro de unidades e moradores é feita por arquivo, então a virada leva uma tarde.',
    },
  ],
} as const;

export const CHAMADA = {
  eyebrow: 'Comece pelo próximo pacote',
  tituloLinha1: 'A próxima encomenda pode',
  tituloLinha2: 'avisar sozinha.',
  apoio:
    'Mostramos o sistema funcionando com o seu condomínio no lugar do exemplo — unidades, blocos e a mensagem do jeito que o seu morador vai receber. Leva 20 minutos.',
  acaoPrimaria: 'Agendar demonstração',
  acaoSecundaria: 'Ver o preço de novo',
  nota: 'Sem cartão de crédito · Sem fidelidade · Cancelamento a qualquer momento',
} as const;

export const RODAPE = {
  colunas: [
    {
      titulo: 'Produto',
      links: [
        { href: '#problema', rotulo: 'O problema' },
        { href: '#funciona', rotulo: 'Como funciona' },
        { href: '#diferenca', rotulo: 'A diferença' },
        { href: '#preco', rotulo: 'Preço' },
      ],
    },
    {
      titulo: 'Contato',
      links: [
        { href: '#duvidas', rotulo: 'Dúvidas frequentes' },
        { href: `mailto:${MARCA.email}`, rotulo: MARCA.email },
        { href: '#chamada', rotulo: 'Agendar demonstração' },
      ],
    },
  ],
  assinatura: 'Feito para quem trabalha em pé.',
} as const;

/** Link de agendamento, montado uma vez para as duas chamadas da página. */
export const LINK_DEMO = `mailto:${MARCA.email}?subject=${encodeURIComponent(
  `Quero uma demonstração do ${MARCA.completo}`,
)}`;
