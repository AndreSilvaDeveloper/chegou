import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * O vínculo entre o cliente que paga o Chegou e o `customer` do gateway.
 *
 * O dono é XOR — condomínio direto **ou** administradora — como em
 * `AssinaturaCondicao` e `AssinaturaFatura`. Condomínio de carteira não tem
 * linha aqui: quem é cobrada é a administradora dele.
 *
 * A linha também guarda a **tentativa** que falhou (`customerId` nulo +
 * `erroUltimaSync`). É o que alimenta a tela de Pendências: erro que só existe
 * no log é erro que ninguém vê.
 */
@Entity('assinatura_clientes_gateway')
export class AssinaturaClienteGateway {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string | null;

  @Column({ name: 'administradora_id', type: 'uuid', nullable: true })
  administradoraId!: string | null;

  /**
   * Id do customer na Payment API (lá é um `Long`).
   *
   * Vem como **string** do TypeORM: `bigint` não cabe em `number` com garantia,
   * e o driver do Postgres devolve texto de propósito. Nós só repassamos o
   * valor na URL, então string é a forma que não perde precisão no caminho.
   */
  @Column({ name: 'customer_id', type: 'bigint', nullable: true })
  customerId!: string | null;

  @Column({ name: 'asaas_id', type: 'varchar', length: 60, nullable: true })
  asaasId!: string | null;

  @Column({ name: 'documento_enviado', type: 'varchar', length: 14, nullable: true })
  documentoEnviado!: string | null;

  @Column({ name: 'sincronizado_em', type: 'timestamptz', nullable: true })
  sincronizadoEm!: Date | null;

  @Column({ name: 'erro_ultima_sync', type: 'text', nullable: true })
  erroUltimaSync!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
