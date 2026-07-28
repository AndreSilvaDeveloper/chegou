export type EncomendaStatus = 'aguardando' | 'notificado' | 'retirada' | 'cancelada' | 'devolvida';

export type EncomendaTipo = 'caixa' | 'envelope';

export type WaStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';

export interface NotificacaoResumo {
  status: WaStatus;
  errorMessage: string | null;
  templateName: string | null;
  criadaEm: string;
}

export interface Apartamento {
  id: string;
  tenantId: string;
  bloco: string | null;
  numero: string;
  identificador: string;
  observacoes: string | null;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Morador {
  id: string;
  tenantId: string;
  apartamentoId: string;
  apartamento?: Apartamento;
  nome: string;
  telefoneE164: string | null;
  documento: string | null;
  email: string | null;
  principal: boolean;
  receberWhatsapp: boolean;
  ativo: boolean;
}

export interface Encomenda {
  id: string;
  tenantId: string;
  apartamentoId: string;
  apartamento?: Apartamento;
  moradorDestinoId: string | null;
  moradorDestino?: Morador | null;
  /** Nome do destinatário (morador destino ou principal do apartamento). */
  destinatarioNome?: string | null;
  tipo: EncomendaTipo | null;
  descricao: string | null;
  transportadora: string | null;
  codigoRastreio: string | null;
  fotoUrl: string | null;
  observacoes: string | null;
  codigoRetirada: string;
  status: EncomendaStatus;
  notificadaAt: string | null;
  retiradaAt: string | null;
  canceladaAt: string | null;
  retiradaDocumento: string | null;
  cancelamentoMotivo: string | null;
  notificacao?: NotificacaoResumo | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListarEncomendasResponse {
  items: Encomenda[];
  total: number;
  page: number;
  limit: number;
}

export type UserRole = 'superadmin' | 'sindico' | 'admin' | 'porteiro';

export interface Usuario {
  id: string;
  tenantId: string | null;
  nome: string;
  email: string;
  role: UserRole;
  telefone: string | null;
  ativo: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VolumePonto {
  label: string;
  recebidas: number;
  retiradas: number;
  pendentes: number;
}

export interface DashboardData {
  cards: {
    totalMes: number;
    totalMesAnterior: number;
    variacao: number | null;
    aguardando: number;
    retiradosHoje: number;
    tempoMedioHoras: number | null;
  };
  semana: VolumePonto[];
  meses: VolumePonto[];
}

// ---- Relatórios (/relatorios) ----

export interface RelatorioPeriodo {
  desde: string;
  ate: string;
  dias: number;
  granularidade: 'dia' | 'semana' | 'mes';
  anteriorDesde: string;
  anteriorAte: string;
  bloco: string | null;
}

export interface RelatorioFaixa {
  key: string;
  label: string;
  total: number;
}

export interface RelatorioSeriePonto {
  label: string;
  data: string;
  recebidas: number;
  retiradas: number;
  pendentes: number;
  canceladas: number;
}

export interface RelatorioEncomendas {
  periodo: RelatorioPeriodo;
  blocos: string[];
  resumo: {
    recebidas: number;
    retiradas: number;
    pendentes: number;
    canceladas: number;
    devolvidas: number;
    notificadas: number;
    comFoto: number;
    taxaRetirada: number;
    taxaNotificacao: number;
    tempoMedioHoras: number | null;
    tempoMedianoHoras: number | null;
    tempoP90Horas: number | null;
    minutosAteNotificar: number | null;
    estoqueAtual: number;
    porStatus: { status: EncomendaStatus; label: string; total: number }[];
    anterior: {
      recebidas: number;
      retiradas: number;
      canceladas: number;
      taxaRetirada: number;
      tempoMedioHoras: number | null;
    };
    variacao: {
      recebidas: number | null;
      retiradas: number | null;
      taxaRetirada: number | null;
      tempoMedio: number | null;
    };
  };
  serie: RelatorioSeriePonto[];
  tempoRetirada: RelatorioFaixa[];
  aging: RelatorioFaixa[];
  pendentesAntigas: {
    id: string;
    identificador: string;
    status: EncomendaStatus;
    destinatario: string | null;
    descricao: string | null;
    transportadora: string | null;
    criadaEm: string;
    horas: number;
  }[];
  porHora: { hora: number; label: string; recebidas: number }[];
  porDiaSemana: { dia: number; label: string; nome: string; recebidas: number }[];
  topApartamentos: {
    id: string;
    identificador: string;
    bloco: string | null;
    total: number;
    pendentes: number;
    tempoMedioHoras: number | null;
  }[];
  porBloco: { bloco: string; total: number; apartamentos: number }[];
  transportadoras: { nome: string; total: number; tempoMedioHoras: number | null }[];
  porTipo: { tipo: string; label: string; total: number }[];
  operadores: { id: string; nome: string; role: UserRole; recebidas: number; retiradas: number }[];
}

export interface RelatorioWhatsapp {
  periodo: { desde: string; ate: string; dias: number; granularidade: 'dia' | 'semana' | 'mes' };
  resumo: {
    total: number;
    enviadas: number;
    falhas: number;
    naFila: number;
    agendadas: number;
    canceladas: number;
    taxaEntrega: number | null;
    minutosNaFila: number | null;
    tentativasMedia: number | null;
  };
  serie: { label: string; data: string; enviadas: number; falhas: number; naFila: number }[];
  porTipo: { tipo: TipoNotificacao; total: number; enviadas: number; falhas: number }[];
  erros: { erro: string; total: number }[];
  porHora: { hora: number; label: string; enviadas: number }[];
  alcance: {
    moradores: number;
    alcancaveis: number;
    semTelefone: number;
    optOut: number;
    percentual: number | null;
    apartamentosSemPrincipal: number;
  };
}

export interface RelatorioVagas {
  resumo: {
    totalVagas: number;
    vinculadas: number;
    ocupadas: number;
    livres: number;
    taxaOcupacao: number;
    locacoesAtivas: number;
    inadimplentes: number;
    encerradas: number;
    receitaMensal: number;
    receitaEmRisco: number;
  };
  /** Histórico financeiro acumulado — todas as competências já geradas. */
  financeiro: {
    cobrancas: number;
    valorCobrado: number;
    valorRecebido: number;
    valorEmAberto: number;
    valorVencido: number;
    cobrancasVencidas: number;
  };
  /** O que cada vaga já rendeu, incluindo contratos encerrados. */
  historicoPorVaga: {
    numero: string;
    tipo: TipoVaga;
    contratos: number;
    desde: string | null;
    recebido: number;
    emAberto: number;
  }[];
  porTipo: { tipo: TipoVaga; total: number; ocupadas: number; livres: number }[];
  serie: { label: string; data: string; novas: number; valor: number }[];
  contratos: {
    id: string;
    numero: string;
    tipo: TipoVaga;
    status: StatusLocacao;
    valor: number;
    diaVencimento: number;
    dataInicio: string;
    morador: string | null;
    apartamento: string | null;
  }[];
}

export type TenantTipo = 'residencial' | 'comercial' | 'misto';
export type TenantEstruturaBlocos = 'unico' | 'multiplos';

export interface TenantConfig {
  tipo?: TenantTipo;
  estruturaBlocos?: TenantEstruturaBlocos;
  moduloVagas?: boolean;
  moduloAvisos?: boolean;
  horarioEnvioInicio?: string;
  horarioEnvioFim?: string;
}

export interface Tenant {
  id: string;
  nome: string;
  slug: string;
  cnpj: string | null;
  cidade: string | null;
  estado: string | null;
  endereco?: string | null;
  telefoneContato?: string | null;
  emailContato?: string | null;
  plano: string;
  ativo: boolean;
  /** Carteira a que o condomínio pertence — null = direto com o superadmin. */
  administradoraId?: string | null;
  configJson?: TenantConfig;
  createdAt: string;
  updatedAt: string;
}

/** Empresa que administra uma carteira de condomínios. */
export interface Administradora {
  id: string;
  nome: string;
  cnpj: string | null;
  emailContato: string | null;
  telefoneContato: string | null;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdministradoraComResumo extends Administradora {
  qtdCondominios: number;
  qtdUsuarios: number;
}

export interface AdministradoraDetalhe extends Administradora {
  condominios: Tenant[];
  usuarios: UsuarioAdministradora[];
}

export interface UsuarioAdministradora {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  ativo: boolean;
  role: 'admin';
  createdAt: string;
}

export type TipoVaga = 'carro' | 'moto' | 'grande' | 'pcd';

/**
 * Situação derivada pelo backend:
 * - `vinculada`: pertence a um apartamento, fora do pool de locação
 * - `livre`: pode ser alugada
 * - `alugada`: tem contrato vigente
 */
export type SituacaoVaga = 'livre' | 'vinculada' | 'alugada' | 'inativa';

export interface Vaga {
  id: string;
  tenantId: string;
  numero: string;
  tipo: TipoVaga;
  localizacao: string | null;
  apartamentoId: string | null;
  apartamento?: Apartamento | null;
  observacoes: string | null;
  ativo: boolean;
  situacao: SituacaoVaga;
  alugavel: boolean;
  createdAt: string;
  updatedAt: string;
}

export type StatusLocacao = 'ativa' | 'encerrada' | 'inadimplente';
export type LocatarioTipo = 'morador' | 'externo';

export interface VagaLocacao {
  id: string;
  tenantId: string;
  vagaId: string;
  vaga?: Vaga;

  locatarioTipo: LocatarioTipo;
  moradorId: string | null;
  morador?: Morador | null;
  locatarioNome: string | null;
  locatarioDocumento: string | null;
  locatarioTelefoneE164: string | null;
  locatarioEmail: string | null;

  valorMensal: number;
  diaVencimento: number;
  dataInicio: string;
  dataFim: string | null;
  status: StatusLocacao;

  contratoUrl: string | null;
  contratoNomeArquivo: string | null;
  contratoEnviadoAt: string | null;

  observacoes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VagaPreco {
  tenantId: string;
  tipo: TipoVaga;
  valorMensal: number;
}

export type StatusCobranca = 'pendente' | 'enviada' | 'paga' | 'vencida' | 'cancelada';
export type CobrancaProvider = 'manual' | 'asaas';

export interface VagaCobranca {
  id: string;
  tenantId: string;
  locacaoId: string;
  locacao?: VagaLocacao;
  /** Mês de referência, sempre no dia 1 (YYYY-MM-01). */
  competencia: string;
  valor: number;
  vencimento: string;
  status: StatusCobranca;
  notificacaoId: string | null;
  enviadaWhatsappAt: string | null;
  enviadaEmailAt: string | null;
  pagoAt: string | null;
  valorPago: number | null;
  /** `manual` = controle interno; `asaas` ainda não emite boleto. */
  provider: CobrancaProvider;
  boletoUrl: string | null;
  linhaDigitavel: string | null;
  pixCopiaCola: string | null;
  observacoes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TotaisCobranca {
  cobrancas: number;
  valorCobrado: number;
  valorRecebido: number;
  valorEmAberto: number;
  valorVencido: number;
}

/** Histórico completo de uma vaga: contratos, cobranças e pagamentos. */
export interface HistoricoVaga {
  vaga: Vaga;
  locacoes: (VagaLocacao & { cobrancas: VagaCobranca[]; totais: TotaisCobranca })[];
  resumo: TotaisCobranca & { totalContratos: number; contratosVigentes: number };
}

export interface ResultadoGeracaoCobrancas {
  competencia: string;
  criadas: number;
  jaExistiam: number;
  ignoradas: { locacaoId: string; vaga: string; motivo: string }[];
  cobrancas: VagaCobranca[];
}

export interface ResumoCobrancas {
  competencia: string | null;
  totalCobrancas: number;
  emAberto: number;
  valorEmAberto: number;
  vencidas: number;
  valorVencido: number;
  pagas: number;
  valorRecebido: number;
}

export interface ResultadoEnvioCobranca {
  cobranca: VagaCobranca;
  envio: {
    whatsapp: 'enviado' | 'sem_telefone' | 'opt_out';
    email: 'enviado' | 'sem_email' | 'indisponivel';
  };
}

export type TipoAviso = 'geral' | 'urgente' | 'manutencao' | 'evento' | 'financeiro';
export type DestinatarioAviso = 'todos' | 'bloco' | 'apartamento';

export interface Aviso {
  id: string;
  tenantId: string;
  titulo: string;
  conteudo: string;
  tipo: TipoAviso;
  criadoPorId: string;
  criadoPor?: Usuario;
  destinatario: DestinatarioAviso;
  destinatarioFiltro: any;
  enviarWhatsapp: boolean;
  enviadaAt: string | null;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---- Conexão WhatsApp (OpenWA) ----
export type WhatsappConnectionState = 'connected' | 'connecting' | 'qr' | 'disconnected' | 'error';

export interface WhatsappConnection {
  configured: boolean;
  provisioned: boolean;
  sessionId: string | null;
  sessionName: string | null;
  rawStatus: string | null;
  state: WhatsappConnectionState;
  connected: boolean;
  phone: string | null;
  pushName: string | null;
  lastError: string | null;
}

export interface WhatsappQr {
  state: WhatsappConnectionState;
  rawStatus: string | null;
  connected: boolean;
  qrCode: string | null;
}

export interface TemplateVariavel {
  token: string;
  descricao: string;
  exemplo: string;
}

/** Config de disparo/modelos de mensagem do próprio condomínio (endpoint do síndico). */
export interface WhatsappTenantConfig {
  /** Texto salvo pelo condomínio; vazio = está usando o padrão do sistema. */
  templateEncomenda: string;
  templatePadrao: string;
  variaveis: TemplateVariavel[];
  templateRetirada: string;
  templatePadraoRetirada: string;
  variaveisRetirada: TemplateVariavel[];
  intervaloSegundos: number;
  jitterSegundos: number;
  limiteDiario: number;
  horarioEnvioInicio: string;
  horarioEnvioFim: string;
  /** Faixas que o condomínio pode escolher; vêm do backend, não replique aqui. */
  limites: {
    intervaloMinimoSegundos: number;
    janelaMinima: string;
    janelaMaxima: string;
    limiteDiarioMinimo: number;
    limiteDiarioMaximo: number;
  };
}

/** Linha do painel WhatsApp do super admin (por condomínio). */
export interface AdminWhatsappCondominio {
  id: string;
  nome: string;
  slug: string;
  ativo: boolean;
  provisionado: boolean;
  status: string | null;
  conectado: boolean;
  numero: string | null;
  disparosEncomenda: number;
  disparosAviso: number;
  intervaloSegundos: number;
  jitterSegundos: number;
  limiteDiario: number;
  horarioEnvioInicio: string;
  horarioEnvioFim: string;
  templateEncomenda: string;
  templateRetirada: string;
}

export interface AdminWhatsappResponse {
  variaveis: TemplateVariavel[];
  templatePadrao: string;
  variaveisRetirada: TemplateVariavel[];
  templatePadraoRetirada: string;
  condominios: AdminWhatsappCondominio[];
}

export type TipoNotificacao = 'encomenda' | 'cobranca_vaga' | 'cobranca_condominio' | 'aviso' | 'lembrete';
export type StatusNotificacao = 'pendente' | 'agendada' | 'enviando' | 'enviada' | 'falha' | 'cancelada';

export interface Notificacao {
  id: string;
  tenantId: string;
  tipo: TipoNotificacao;
  prioridade: number;
  destinatarioTelefone: string;
  destinatarioNome: string | null;
  moradorId: string | null;
  morador?: Morador | null;
  referenciaTipo: string | null;
  referenciaId: string | null;
  conteudo: string;
  variaveisJson: any;
  status: StatusNotificacao;
  agendadaPara: string | null;
  enviadaAt: string | null;
  tentativas: number;
  maxTentativas: number;
  erroMensagem: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Assinatura — o que o cliente paga pelo Chegou
// ---------------------------------------------------------------------------

export type ModoAssinatura = 'tabela' | 'preco_apartamento' | 'valor_fixo';
export type StatusFatura = 'aberta' | 'paga' | 'vencida' | 'cancelada';

/** Uma linha da tabela de preços. `ateQuantidade: null` = última faixa, sem teto. */
export interface AssinaturaFaixa {
  ateQuantidade: number | null;
  precoApartamento: number;
  ordem: number;
}

/** Quem recebe a fatura: um condomínio direto ou uma administradora. */
export interface SacadoAssinatura {
  tipo: 'condominio' | 'administradora';
  id: string;
  nome: string;
}

export interface ItemAssinatura {
  tenantId: string;
  nome: string;
  apartamentos: number;
  subtotal: number;
}

export interface ResultadoAssinatura {
  quantidadeApartamentos: number;
  modo: ModoAssinatura;
  /** Preço por apartamento cobrado. `null` quando o modo é valor fixo. */
  precoAplicado: number | null;
  /** A faixa usada — só quando o preço veio da tabela. Explica o valor na tela. */
  faixa: AssinaturaFaixa | null;
  valorBruto: number;
  desconto: number;
  valor: number;
  itens: ItemAssinatura[];
}

export interface PreviaAssinatura {
  sacado: SacadoAssinatura;
  resultado: ResultadoAssinatura;
  condicao: {
    id: string;
    modo: ModoAssinatura;
    descontoPercentual: number | null;
    observacao: string | null;
  } | null;
}

export interface AssinaturaFaturaItem {
  id: string;
  tenantId: string | null;
  /** Gravado na fatura: excluir o condomínio não apaga o que foi cobrado. */
  condominioNome: string;
  apartamentos: number;
  subtotal: number;
}

export interface AssinaturaFatura {
  id: string;
  tenantId: string | null;
  administradoraId: string | null;
  sacado: SacadoAssinatura;
  /** Mês de referência, sempre no dia 1 (YYYY-MM-01). */
  competencia: string;
  quantidadeApartamentos: number;
  modo: ModoAssinatura;
  precoAplicado: number | null;
  valorBruto: number;
  desconto: number;
  valor: number;
  status: StatusFatura;
  vencimento: string;
  pagaEm: string | null;
  formaPagamento: string | null;
  observacao: string | null;
  itens: AssinaturaFaturaItem[];
  createdAt: string;
  updatedAt: string;
}

/** Preço especial negociado com um cliente. */
export interface AssinaturaCondicao {
  id: string;
  tenantId: string | null;
  tenant?: { id: string; nome: string } | null;
  administradoraId: string | null;
  administradora?: { id: string; nome: string } | null;
  modo: ModoAssinatura;
  precoApartamento: number | null;
  valorFixo: number | null;
  descontoPercentual: number | null;
  vigenteDe: string;
  vigenteAte: string | null;
  observacao: string | null;
  ativo: boolean;
}

export interface ResumoAssinatura {
  competencia: string | null;
  totalFaturas: number;
  valorFaturado: number;
  emAberto: number;
  valorEmAberto: number;
  vencidas: number;
  valorVencido: number;
  pagas: number;
  valorRecebido: number;
}

export interface ResultadoGeracaoFaturas {
  competencia: string;
  criadas: number;
  jaExistiam: number;
  ignorados: { sacado: SacadoAssinatura; motivo: string }[];
  faturas: AssinaturaFatura[];
}

/** Quem paga por um condomínio. */
export type ResponsavelPeloCondominio =
  | { via: 'condominio'; tenantId: string; nome: string }
  | { via: 'administradora'; administradoraId: string; nome: string };

/** Em que ponto do vencimento a fatura mais urgente está. */
export type SituacaoVencimento = 'vence_em_breve' | 'vence_hoje' | 'vencida';

/** O aviso de vencimento mostrado ao cliente. */
export interface AvisoVencimento {
  situacao: SituacaoVencimento;
  /** A fatura em destaque: a mais urgente das que estão em aberto. */
  faturaId: string;
  competencia: string;
  vencimento: string;
  valor: number;
  /** Dias até vencer. Negativo é atraso: `-2` é "venceu anteontem". */
  diasParaVencer: number;
  /** Soma de tudo em aberto, não só da fatura em destaque. */
  totalEmAberto: number;
  quantidadeEmAberto: number;
}

/** A assinatura vista pelo próprio cliente. */
export interface MinhaAssinatura {
  /** Só a visão do condomínio traz. */
  responsavel?: ResponsavelPeloCondominio;
  /** `null` quando quem paga é a administradora do condomínio. */
  conta: PreviaAssinatura | null;
  faturas: AssinaturaFatura[];
  /** `null` quando não há vencimento por perto nem atraso. */
  aviso: AvisoVencimento | null;
}

// ---- Autocadastro de morador (QR Code) ----

/** Unidade como a página pública de autocadastro precisa dela. */
export interface UnidadeAutocadastro {
  id: string;
  bloco: string | null;
  numero: string;
  identificador: string;
}

/** Resposta pública de `GET /public/autocadastro/:token`. */
export interface DadosAutocadastro {
  condominioNome: string;
  estruturaBlocos: 'unico' | 'multiplos';
  unidades: UnidadeAutocadastro[];
}
