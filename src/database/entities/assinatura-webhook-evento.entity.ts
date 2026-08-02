import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum StatusWebhookEvento {
  PENDENTE = 'pendente',
  PROCESSADO = 'processado',
  /** Chegou, foi entendido e não havia o que fazer (fatura de outro sistema). */
  IGNORADO = 'ignorado',
  ERRO = 'erro',
}

/**
 * Um evento de pagamento vindo do gateway.
 *
 * A linha existe antes do processamento: **gravar primeiro, processar depois**.
 * É isso que permite responder 200 rápido (webhook que processa em linha é
 * webhook que o remetente considera falho por timeout) e é o que dá à
 * deduplicação um lugar para acontecer.
 */
@Entity('assinatura_webhook_eventos')
export class AssinaturaWebhookEvento {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id do evento no remetente — a chave da deduplicação (índice único). */
  @Column({ name: 'evento_id', type: 'varchar', length: 120 })
  eventoId!: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  tipo!: string | null;

  @Column({ name: 'fatura_id', type: 'uuid', nullable: true })
  faturaId!: string | null;

  @Column({ name: 'cobranca_id', type: 'bigint', nullable: true })
  cobrancaId!: string | null;

  @Column({ type: 'varchar', length: 20, default: StatusWebhookEvento.PENDENTE })
  status!: StatusWebhookEvento;

  @Column({ type: 'text', nullable: true })
  detalhe!: string | null;

  @Column({ type: 'int', default: 0 })
  tentativas!: number;

  /** Como chegou. Resumo nosso não responde "o que eles mandaram?" meses depois. */
  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ name: 'recebido_em', type: 'timestamptz' })
  recebidoEm!: Date;

  @Column({ name: 'processado_em', type: 'timestamptz', nullable: true })
  processadoEm!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
