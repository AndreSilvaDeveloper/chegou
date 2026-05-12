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
import { Encomenda } from './encomenda.entity';
import { Morador } from './morador.entity';

export type WaDirection = 'in' | 'out';
export type WaMessageType = 'template' | 'text' | 'image' | 'interactive' | 'system';
export type WaStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';

@Entity({ name: 'whatsapp_messages' })
export class WhatsappMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string | null;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant | null;

  @Column({ name: 'encomenda_id', type: 'uuid', nullable: true })
  encomendaId!: string | null;

  @ManyToOne(() => Encomenda, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'encomenda_id' })
  encomenda?: Encomenda | null;

  @Column({ name: 'morador_id', type: 'uuid', nullable: true })
  moradorId!: string | null;

  @ManyToOne(() => Morador, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'morador_id' })
  morador?: Morador | null;

  @Column({ type: 'varchar', length: 3 })
  direction!: WaDirection;

  @Column({ type: 'varchar', length: 20 })
  provider!: string;

  @Column({ name: 'provider_message_id', type: 'varchar', length: 120, nullable: true })
  providerMessageId!: string | null;

  @Column({ name: 'from_number', type: 'varchar', length: 20 })
  fromNumber!: string;

  @Column({ name: 'to_number', type: 'varchar', length: 20 })
  toNumber!: string;

  @Column({ name: 'message_type', type: 'varchar', length: 20 })
  messageType!: WaMessageType;

  @Column({ name: 'template_name', type: 'varchar', length: 80, nullable: true })
  templateName!: string | null;

  @Column({ type: 'text', nullable: true })
  body!: string | null;

  @Column({ name: 'payload_json', type: 'jsonb', default: () => "'{}'::jsonb" })
  payloadJson!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 20, default: 'queued' })
  status!: WaStatus;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 120, nullable: true })
  idempotencyKey!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
