import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Tenant } from './tenant.entity';
import { Vaga } from './vaga.entity';
import { Morador } from './morador.entity';

export enum StatusLocacao {
  ATIVA = 'ativa',
  ENCERRADA = 'encerrada',
  INADIMPLENTE = 'inadimplente',
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

  @Column({ name: 'morador_id', type: 'uuid', nullable: true })
  moradorId!: string | null;

  @ManyToOne(() => Morador)
  @JoinColumn({ name: 'morador_id' })
  morador!: Morador | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'valor_mensal' })
  valorMensal!: number;

  @Column({ type: 'integer', name: 'dia_vencimento' })
  diaVencimento!: number;

  @Column({ type: 'date', name: 'data_inicio' })
  dataInicio!: string;

  @Column({ type: 'date', name: 'data_fim', nullable: true })
  dataFim!: string | null;

  @Column({ type: 'varchar', length: 20, default: StatusLocacao.ATIVA })
  status!: StatusLocacao;

  @Column({ type: 'text', nullable: true })
  observacoes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
