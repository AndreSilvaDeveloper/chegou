import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Tenant } from './tenant.entity';
import { Vaga } from './vaga.entity';
import { Morador } from './morador.entity';
import { numericTransformer } from './numeric.transformer';

export enum StatusLocacao {
  ATIVA = 'ativa',
  ENCERRADA = 'encerrada',
  INADIMPLENTE = 'inadimplente',
}

/** Vigente = ocupa a vaga. Uma vaga só pode ter uma locação vigente por vez. */
export const STATUS_LOCACAO_VIGENTES = [StatusLocacao.ATIVA, StatusLocacao.INADIMPLENTE] as const;

export enum LocatarioTipo {
  /** Morador cadastrado no condomínio. */
  MORADOR = 'morador',
  /** Pessoa de fora — dados guardados na própria locação. */
  EXTERNO = 'externo',
}

@Entity('vagas_locacao')
export class VagaLocacao {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ name: 'vaga_id', type: 'uuid' })
  vagaId!: string;

  @ManyToOne(() => Vaga)
  @JoinColumn({ name: 'vaga_id' })
  vaga!: Vaga;

  // ---- Locatário ----

  @Column({ name: 'locatario_tipo', type: 'varchar', length: 10, default: LocatarioTipo.MORADOR })
  locatarioTipo!: LocatarioTipo;

  @Column({ name: 'morador_id', type: 'uuid', nullable: true })
  moradorId!: string | null;

  @ManyToOne(() => Morador)
  @JoinColumn({ name: 'morador_id' })
  morador!: Morador | null;

  @Column({ name: 'locatario_nome', type: 'varchar', length: 200, nullable: true })
  locatarioNome!: string | null;

  @Column({ name: 'locatario_documento', type: 'varchar', length: 20, nullable: true })
  locatarioDocumento!: string | null;

  @Column({ name: 'locatario_telefone_e164', type: 'varchar', length: 20, nullable: true })
  locatarioTelefoneE164!: string | null;

  @Column({ name: 'locatario_email', type: 'citext', nullable: true })
  locatarioEmail!: string | null;

  // ---- Contrato ----

  @Column({ name: 'valor_mensal', type: 'decimal', precision: 10, scale: 2, transformer: numericTransformer })
  valorMensal!: number;

  @Column({ type: 'integer', name: 'dia_vencimento' })
  diaVencimento!: number;

  @Column({ type: 'date', name: 'data_inicio' })
  dataInicio!: string;

  @Column({ type: 'date', name: 'data_fim', nullable: true })
  dataFim!: string | null;

  @Column({ type: 'varchar', length: 20, default: StatusLocacao.ATIVA })
  status!: StatusLocacao;

  @Column({ name: 'contrato_url', type: 'text', nullable: true })
  contratoUrl!: string | null;

  @Column({ name: 'contrato_key', type: 'text', nullable: true })
  contratoKey!: string | null;

  @Column({ name: 'contrato_nome_arquivo', type: 'varchar', length: 255, nullable: true })
  contratoNomeArquivo!: string | null;

  @Column({ name: 'contrato_enviado_at', type: 'timestamptz', nullable: true })
  contratoEnviadoAt!: Date | null;

  /** Reservado para a integração Asaas — sem uso enquanto a cobrança é manual. */
  @Column({ name: 'asaas_customer_id', type: 'varchar', length: 60, nullable: true })
  asaasCustomerId!: string | null;

  @Column({ type: 'text', nullable: true })
  observacoes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
