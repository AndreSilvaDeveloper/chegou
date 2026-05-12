import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { Morador } from './morador.entity';
import { Encomenda } from './encomenda.entity';

@Entity({ name: 'apartamentos' })
export class Apartamento {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, (t) => t.apartamentos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ type: 'varchar', length: 20, nullable: true })
  bloco!: string | null;

  @Column({ type: 'varchar', length: 20 })
  numero!: string;

  // Coluna gerada no banco — somente leitura no app
  @Column({ type: 'varchar', length: 80, insert: false, update: false, generatedType: 'STORED' })
  identificador!: string;

  @Column({ type: 'text', nullable: true })
  observacoes!: string | null;

  @Column({ type: 'boolean', default: true })
  ativo!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => Morador, (m) => m.apartamento)
  moradores?: Morador[];

  @OneToMany(() => Encomenda, (e) => e.apartamento)
  encomendas?: Encomenda[];
}
