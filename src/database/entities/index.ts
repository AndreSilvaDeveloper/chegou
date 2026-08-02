export { Administradora } from './administradora.entity';
export { Tenant } from './tenant.entity';
export { User, type UserRole } from './user.entity';
export { Apartamento } from './apartamento.entity';
export { Morador } from './morador.entity';
export { Encomenda, type EncomendaStatus } from './encomenda.entity';
export {
  WhatsappMessage,
  type WaDirection,
  type WaMessageType,
  type WaStatus,
} from './whatsapp-message.entity';
export { AuditLog } from './audit-log.entity';
// Atenção: o DatabaseModule registra `Object.values(entities)` como entidades
// do TypeORM — este index só pode exportar classes de entidade. Enums e
// constantes ficam nos arquivos de origem, importados direto de lá.
export { Vaga } from './vaga.entity';
export { VagaLocacao } from './vaga-locacao.entity';
export { VagaPreco } from './vaga-preco.entity';
export { VagaCobranca } from './vaga-cobranca.entity';
export { Funcionario } from './funcionario.entity';
export { Notificacao } from './notificacao.entity';
export { Aviso } from './aviso.entity';
export {
  EtiquetaAmostra,
  type CamposEtiqueta,
  type LinhaOcr,
} from './etiqueta-amostra.entity';
export { AssinaturaFaixa } from './assinatura-faixa.entity';
export { AssinaturaCondicao } from './assinatura-condicao.entity';
export { AssinaturaFatura } from './assinatura-fatura.entity';
export { AssinaturaFaturaItem } from './assinatura-fatura-item.entity';
export { AssinaturaClienteGateway } from './assinatura-cliente-gateway.entity';
export { AssinaturaWebhookEvento } from './assinatura-webhook-evento.entity';
export { AssinaturaPoliticaAcesso } from './assinatura-politica-acesso.entity';
export { AssinaturaCupomCliente } from './assinatura-cupom-cliente.entity';
