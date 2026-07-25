import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { VagaLocacao } from './vaga-locacao.entity';
import { Notificacao } from './notificacao.entity';
import { numericTransformer } from './numeric.transformer';

export enum StatusCobranca {
  PENDENTE = 'pendente',
  ENVIADA = 'enviada',
  PAGA = 'paga',
  VENCIDA = 'vencida',
  CANCELADA = 'cancelada',
}

export enum CobrancaProvider {
  /** Controle interno: registra e avisa, sem emitir boleto. */
  MANUAL = 'manual',
  /** Reservado — integração ainda não implementada. */
  ASAAS = 'asaas',
}

/** Cobrança mensal do aluguel de uma vaga (uma por locação por competência). */
@Entity('vagas_cobrancas')
export class VagaCobranca {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ name: 'locacao_id', type: 'uuid' })
  locacaoId!: string;

  @ManyToOne(() => VagaLocacao)
  @JoinColumn({ name: 'locacao_id' })
  locacao!: VagaLocacao;

  /** Mês de referência, sempre no dia 1 (YYYY-MM-01). */
  @Column({ type: 'date' })
  competencia!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, transformer: numericTransformer })
  valor!: number;

  @Column({ type: 'date' })
  vencimento!: string;

  @Column({ type: 'varchar', length: 20, default: StatusCobranca.PENDENTE })
  status!: StatusCobranca;

  @Column({ name: 'notificacao_id', type: 'uuid', nullable: true })
  notificacaoId!: string | null;

  @ManyToOne(() => Notificacao, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'notificacao_id' })
  notificacao!: Notificacao | null;

  @Column({ name: 'enviada_whatsapp_at', type: 'timestamptz', nullable: true })
  enviadaWhatsappAt!: Date | null;

  @Column({ name: 'enviada_email_at', type: 'timestamptz', nullable: true })
  enviadaEmailAt!: Date | null;

  @Column({ name: 'pago_at', type: 'timestamptz', nullable: true })
  pagoAt!: Date | null;

  @Column({
    name: 'valor_pago',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  valorPago!: number | null;

  @Column({ type: 'varchar', length: 20, default: CobrancaProvider.MANUAL })
  provider!: CobrancaProvider;

  // ---- Campos do provedor externo (reservados para o Asaas) ----

  @Column({ name: 'asaas_payment_id', type: 'varchar', length: 60, nullable: true })
  asaasPaymentId!: string | null;

  @Column({ name: 'boleto_url', type: 'text', nullable: true })
  boletoUrl!: string | null;

  @Column({ name: 'linha_digitavel', type: 'varchar', length: 80, nullable: true })
  linhaDigitavel!: string | null;

  @Column({ name: 'pix_copia_cola', type: 'text', nullable: true })
  pixCopiaCola!: string | null;

  @Column({ name: 'provider_payload', type: 'jsonb', nullable: true })
  providerPayload!: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  observacoes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
