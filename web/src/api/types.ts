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
  plano: string;
  ativo: boolean;
  configJson?: TenantConfig;
  createdAt: string;
  updatedAt: string;
}

export type TipoVaga = 'carro' | 'moto' | 'grande' | 'pcd';

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
  createdAt: string;
  updatedAt: string;
}

export type StatusLocacao = 'ativa' | 'encerrada' | 'inadimplente';

export interface VagaLocacao {
  id: string;
  tenantId: string;
  vagaId: string;
  vaga?: Vaga;
  moradorId: string | null;
  morador?: Morador | null;
  valorMensal: number | string;
  diaVencimento: number;
  dataInicio: string;
  dataFim: string | null;
  status: StatusLocacao;
  observacoes: string | null;
  createdAt: string;
  updatedAt: string;
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

/** Config de disparo/template do próprio condomínio (endpoint do síndico). */
export interface WhatsappTenantConfig {
  templateEncomenda: string;
  templatePadrao: string;
  variaveis: TemplateVariavel[];
  intervaloSegundos: number;
  jitterSegundos: number;
  limiteDiario: number;
  horarioEnvioInicio: string;
  horarioEnvioFim: string;
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
}

export interface AdminWhatsappResponse {
  variaveis: TemplateVariavel[];
  templatePadrao: string;
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
