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
