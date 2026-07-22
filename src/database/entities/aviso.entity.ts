import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';

export enum TipoAviso {
  GERAL = 'geral',
  URGENTE = 'urgente',
  MANUTENCAO = 'manutencao',
  EVENTO = 'evento',
  FINANCEIRO = 'financeiro',
}

export enum DestinatarioAviso {
  TODOS = 'todos',
  BLOCO = 'bloco',
  APARTAMENTO = 'apartamento',
}

@Entity('avisos')
export class Aviso {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ type: 'varchar', length: 200 })
  titulo!: string;

  @Column({ type: 'text' })
  conteudo!: string;

  @Column({ type: 'varchar', length: 30, default: TipoAviso.GERAL })
  tipo!: TipoAviso;

  @Column({ name: 'criado_por_id', type: 'uuid' })
  criadoPorId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'criado_por_id' })
  criadoPor!: User;

  @Column({ type: 'varchar', length: 20, default: DestinatarioAviso.TODOS })
  destinatario!: DestinatarioAviso;

  @Column({ name: 'destinatario_filtro', type: 'jsonb', nullable: true })
  destinatarioFiltro!: Record<string, any> | null;

  @Column({ name: 'enviar_whatsapp', default: false })
  enviarWhatsapp!: boolean;

  @Column({ type: 'timestamptz', name: 'enviada_at', nullable: true })
  enviadaAt!: Date | null;

  @Column({ default: true })
  ativo!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
