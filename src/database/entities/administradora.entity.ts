import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';

/**
 * Empresa que administra uma carteira de condomínios.
 *
 * Os usuários `admin` pertencem a uma administradora (e não a um condomínio):
 * enxergam apenas os tenants desta carteira.
 */
@Entity({ name: 'administradoras' })
export class Administradora {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  nome!: string;

  @Column({ type: 'varchar', length: 14, nullable: true })
  cnpj!: string | null;

  @Column({ name: 'email_contato', type: 'citext', nullable: true })
  emailContato!: string | null;

  @Column({ name: 'telefone_contato', type: 'varchar', length: 20, nullable: true })
  telefoneContato!: string | null;

  @Column({ type: 'boolean', default: true })
  ativo!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => Tenant, (t) => t.administradora)
  tenants?: Tenant[];

  @OneToMany(() => User, (u) => u.administradora)
  users?: User[];
}
