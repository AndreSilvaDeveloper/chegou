import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Apartamento } from './apartamento.entity';
import { Morador } from './morador.entity';
import { Encomenda } from './encomenda.entity';

@Entity({ name: 'tenants' })
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  nome!: string;

  @Column({ type: 'varchar', length: 80, unique: true })
  slug!: string;

  @Column({ type: 'varchar', length: 14, nullable: true })
  cnpj!: string | null;

  @Column({ type: 'text', nullable: true })
  endereco!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  cidade!: string | null;

  @Column({ type: 'char', length: 2, nullable: true })
  estado!: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  cep!: string | null;

  @Column({ name: 'telefone_contato', type: 'varchar', length: 20, nullable: true })
  telefoneContato!: string | null;

  @Column({ name: 'email_contato', type: 'citext', nullable: true })
  emailContato!: string | null;

  @Column({ type: 'varchar', length: 40, default: 'basico' })
  plano!: string;

  @Column({ type: 'boolean', default: true })
  ativo!: boolean;

  @Column({ name: 'whatsapp_numero', type: 'varchar', length: 20, nullable: true })
  whatsappNumero!: string | null;

  @Column({ name: 'config_json', type: 'jsonb', default: () => "'{}'::jsonb" })
  configJson!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => User, (u) => u.tenant)
  users?: User[];

  @OneToMany(() => Apartamento, (a) => a.tenant)
  apartamentos?: Apartamento[];

  @OneToMany(() => Morador, (m) => m.tenant)
  moradores?: Morador[];

  @OneToMany(() => Encomenda, (e) => e.tenant)
  encomendas?: Encomenda[];
}
