export type EncomendaStatus = 'aguardando' | 'notificado' | 'retirada' | 'cancelada' | 'devolvida';

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
