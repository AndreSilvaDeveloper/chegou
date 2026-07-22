import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Tenant } from './tenant.entity';
import { Apartamento } from './apartamento.entity';

export enum TipoVaga {
  CARRO = 'carro',
  MOTO = 'moto',
  GRANDE = 'grande',
  PCD = 'pcd',
}

@Entity('vagas')
export class Vaga {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ type: 'varchar', length: 20 })
  numero!: string;

  @Column({ type: 'varchar', length: 20 })
  tipo!: TipoVaga;

  @Column({ type: 'varchar', length: 100, nullable: true })
  localizacao!: string | null;

  @Column({ name: 'apartamento_id', type: 'uuid', nullable: true })
  apartamentoId!: string | null;

  @ManyToOne(() => Apartamento, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'apartamento_id' })
  apartamento!: Apartamento | null;

  @Column({ type: 'text', nullable: true })
  observacoes!: string | null;

  @Column({ default: true })
  ativo!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
