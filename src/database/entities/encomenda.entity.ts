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
import { Apartamento } from './apartamento.entity';
import { Morador } from './morador.entity';
import { User } from './user.entity';

export type EncomendaStatus = 'aguardando' | 'notificado' | 'retirada' | 'cancelada' | 'devolvida';

@Entity({ name: 'encomendas' })
export class Encomenda {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, (t) => t.encomendas, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ name: 'apartamento_id', type: 'uuid' })
  apartamentoId!: string;

  @ManyToOne(() => Apartamento, (a) => a.encomendas, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'apartamento_id' })
  apartamento?: Apartamento;

  @Column({ name: 'morador_destino_id', type: 'uuid', nullable: true })
  moradorDestinoId!: string | null;

  @ManyToOne(() => Morador, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'morador_destino_id' })
  moradorDestino?: Morador | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  descricao!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  transportadora!: string | null;

  @Column({ name: 'codigo_rastreio', type: 'varchar', length: 80, nullable: true })
  codigoRastreio!: string | null;

  @Column({ name: 'foto_url', type: 'text', nullable: true })
  fotoUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  observacoes!: string | null;

  @Column({ name: 'codigo_retirada', type: 'char', length: 4 })
  codigoRetirada!: string;

  @Column({ type: 'varchar', length: 20, default: 'aguardando' })
  status!: EncomendaStatus;

  @Column({ name: 'recebida_por_user_id', type: 'uuid' })
  recebidaPorUserId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'recebida_por_user_id' })
  recebidaPor?: User;

  @Column({ name: 'retirada_por_morador_id', type: 'uuid', nullable: true })
  retiradaPorMoradorId!: string | null;

  @ManyToOne(() => Morador, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'retirada_por_morador_id' })
  retiradaPorMorador?: Morador | null;

  @Column({ name: 'retirada_por_user_id', type: 'uuid', nullable: true })
  retiradaPorUserId!: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'retirada_por_user_id' })
  retiradaPorUser?: User | null;

  @Column({ name: 'retirada_documento', type: 'varchar', length: 20, nullable: true })
  retiradaDocumento!: string | null;

  @Column({ name: 'retirada_assinatura_url', type: 'text', nullable: true })
  retiradaAssinaturaUrl!: string | null;

  @Column({ name: 'retirada_observacoes', type: 'text', nullable: true })
  retiradaObservacoes!: string | null;

  @Column({ name: 'notificada_at', type: 'timestamptz', nullable: true })
  notificadaAt!: Date | null;

  @Column({ name: 'retirada_at', type: 'timestamptz', nullable: true })
  retiradaAt!: Date | null;

  @Column({ name: 'cancelada_at', type: 'timestamptz', nullable: true })
  canceladaAt!: Date | null;

  @Column({ name: 'cancelamento_motivo', type: 'text', nullable: true })
  cancelamentoMotivo!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
