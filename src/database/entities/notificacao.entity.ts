import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Tenant } from './tenant.entity';
import { Morador } from './morador.entity';
import { WhatsappMessage } from './whatsapp-message.entity';

export enum TipoNotificacao {
  ENCOMENDA = 'encomenda',
  COBRANCA_VAGA = 'cobranca_vaga',
  COBRANCA_CONDOMINIO = 'cobranca_condominio',
  AVISO = 'aviso',
  LEMBRETE = 'lembrete',
}

export enum StatusNotificacao {
  PENDENTE = 'pendente',
  AGENDADA = 'agendada',
  ENVIANDO = 'enviando',
  ENVIADA = 'enviada',
  FALHA = 'falha',
  CANCELADA = 'cancelada',
}

@Entity('notificacoes')
export class Notificacao {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ type: 'varchar', length: 30 })
  tipo!: TipoNotificacao;

  @Column({ type: 'integer', default: 5 })
  prioridade!: number;

  @Column({ name: 'destinatario_telefone', type: 'varchar', length: 20 })
  destinatarioTelefone!: string;

  @Column({ name: 'destinatario_nome', type: 'varchar', length: 200, nullable: true })
  destinatarioNome!: string | null;

  @Column({ name: 'morador_id', type: 'uuid', nullable: true })
  moradorId!: string | null;

  @ManyToOne(() => Morador, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'morador_id' })
  morador!: Morador | null;

  @Column({ name: 'referencia_tipo', type: 'varchar', length: 40, nullable: true })
  referenciaTipo!: string | null;

  @Column({ name: 'referencia_id', type: 'uuid', nullable: true })
  referenciaId!: string | null;

  @Column({ type: 'text' })
  conteudo!: string;

  @Column({ name: 'variaveis_json', type: 'jsonb', default: {} })
  variaveisJson!: Record<string, any>;

  @Column({ type: 'varchar', length: 20, default: StatusNotificacao.PENDENTE })
  status!: StatusNotificacao;

  @Column({ type: 'timestamptz', name: 'agendada_para', nullable: true })
  agendadaPara!: Date | null;

  @Column({ type: 'timestamptz', name: 'enviada_at', nullable: true })
  enviadaAt!: Date | null;

  @Column({ type: 'integer', default: 0 })
  tentativas!: number;

  @Column({ name: 'max_tentativas', type: 'integer', default: 3 })
  maxTentativas!: number;

  @Column({ name: 'erro_mensagem', type: 'text', nullable: true })
  erroMensagem!: string | null;

  @Column({ name: 'whatsapp_message_id', type: 'uuid', nullable: true })
  whatsappMessageId!: string | null;

  @ManyToOne(() => WhatsappMessage, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'whatsapp_message_id' })
  whatsappMessage!: WhatsappMessage | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
