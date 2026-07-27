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
import { Administradora } from './administradora.entity';
import { AssinaturaFaturaItem } from './assinatura-fatura-item.entity';
import { ModoAssinatura } from './assinatura-condicao.entity';
import { Tenant } from './tenant.entity';
import { numericTransformer } from './numeric.transformer';

export enum StatusFatura {
  ABERTA = 'aberta',
  PAGA = 'paga',
  VENCIDA = 'vencida',
  CANCELADA = 'cancelada',
}

/**
 * A fatura mensal da assinatura do Chegou.
 *
 * **`tenantId` é nullable de propósito**: a fatura de uma administradora não
 * pertence a condomínio nenhum. O CHECK `chk_assinatura_faturas_sacado` garante
 * que exatamente um dos dois donos esteja preenchido — é ele que faz o papel do
 * `tenant_id NOT NULL` das outras tabelas.
 *
 * Tudo que a fatura precisa para ser explicada fica gravado nela (quantidade,
 * modo, preço aplicado): mexer na tabela de preços não reescreve o passado.
 */
@Entity('assinatura_faturas')
export class AssinaturaFatura {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string | null;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant | null;

  @Column({ name: 'administradora_id', type: 'uuid', nullable: true })
  administradoraId!: string | null;

  @ManyToOne(() => Administradora, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'administradora_id' })
  administradora!: Administradora | null;

  /** Mês de referência, sempre no dia 1 (YYYY-MM-01). */
  @Column({ type: 'date' })
  competencia!: string;

  @Column({ name: 'quantidade_apartamentos', type: 'int' })
  quantidadeApartamentos!: number;

  @Column({ type: 'varchar', length: 20 })
  modo!: ModoAssinatura;

  /** Preço por apartamento cobrado nesta fatura. `null` quando o modo é valor fixo. */
  @Column({
    name: 'preco_aplicado',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  precoAplicado!: number | null;

  @Column({
    name: 'valor_bruto',
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  valorBruto!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, transformer: numericTransformer })
  desconto!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, transformer: numericTransformer })
  valor!: number;

  @Column({ type: 'varchar', length: 20, default: StatusFatura.ABERTA })
  status!: StatusFatura;

  @Column({ type: 'date' })
  vencimento!: string;

  @Column({ name: 'paga_em', type: 'timestamptz', nullable: true })
  pagaEm!: Date | null;

  @Column({ name: 'forma_pagamento', type: 'varchar', length: 30, nullable: true })
  formaPagamento!: string | null;

  @Column({ type: 'text', nullable: true })
  observacao!: string | null;

  @OneToMany(() => AssinaturaFaturaItem, (item) => item.fatura, { cascade: ['insert'] })
  itens!: AssinaturaFaturaItem[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
