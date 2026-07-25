import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Administradora } from './administradora.entity';
import { Tenant } from './tenant.entity';

/**
 * Escopo de cada papel (garantido por CHECK no banco — ver migration 020):
 * - `superadmin`: plataforma inteira, sem tenant e sem administradora
 * - `admin`: administradora; opera nos condomínios da carteira dela
 * - `sindico` / `porteiro`: um único condomínio
 */
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

  /** Preenchido só para `admin` — é a carteira que ele enxerga. */
  @Column({ name: 'administradora_id', type: 'uuid', nullable: true })
  administradoraId!: string | null;

  @ManyToOne(() => Administradora, (a) => a.users)
  @JoinColumn({ name: 'administradora_id' })
  administradora?: Administradora | null;

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
