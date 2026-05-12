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

@Entity({ name: 'moradores' })
export class Morador {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, (t) => t.moradores, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ name: 'apartamento_id', type: 'uuid' })
  apartamentoId!: string;

  @ManyToOne(() => Apartamento, (a) => a.moradores, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'apartamento_id' })
  apartamento?: Apartamento;

  @Column({ type: 'varchar', length: 200 })
  nome!: string;

  @Column({ name: 'telefone_e164', type: 'varchar', length: 20, nullable: true })
  telefoneE164!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  documento!: string | null;

  @Column({ type: 'citext', nullable: true })
  email!: string | null;

  @Column({ type: 'boolean', default: false })
  principal!: boolean;

  @Column({ name: 'receber_whatsapp', type: 'boolean', default: true })
  receberWhatsapp!: boolean;

  @Column({ type: 'boolean', default: true })
  ativo!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
