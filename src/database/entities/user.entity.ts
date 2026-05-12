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

export type UserRole = 'superadmin' | 'sindico' | 'admin' | 'porteiro';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string | null;

  @ManyToOne(() => Tenant, (t) => t.users, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant | null;

  @Column({ type: 'varchar', length: 200 })
  nome!: string;

  @Column({ type: 'citext' })
  email!: string;

  @Column({ name: 'senha_hash', type: 'varchar', length: 255, select: false })
  senhaHash!: string;

  @Column({ type: 'varchar', length: 20 })
  role!: UserRole;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefone!: string | null;

  @Column({ type: 'boolean', default: true })
  ativo!: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
