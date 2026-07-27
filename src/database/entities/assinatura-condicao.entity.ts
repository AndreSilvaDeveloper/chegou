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
import { numericTransformer } from './numeric.transformer';

/** Como o preço deste cliente é calculado. */
export enum ModoAssinatura {
  /** Tabela de faixas da plataforma (padrão). */
  TABELA = 'tabela',
  /** Preço por apartamento negociado — ignora as faixas. */
  PRECO_APARTAMENTO = 'preco_apartamento',
  /** Valor fechado por mês — ignora a contagem. */
  VALOR_FIXO = 'valor_fixo',
}

/**
 * O preço especial de um cliente (condomínio **ou** administradora).
 *
 * Sem condição cadastrada, vale a tabela da plataforma. A condição em aberto é
 * uma só por cliente (índice parcial no banco); encerrar é preencher
 * `vigenteAte`, nunca apagar — o histórico explica por que a fatura de março
 * saiu diferente da de abril.
 */
@Entity('assinatura_condicoes')
export class AssinaturaCondicao {
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

  @Column({ type: 'varchar', length: 20, default: ModoAssinatura.TABELA })
  modo!: ModoAssinatura;

  @Column({
    name: 'preco_apartamento',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  precoApartamento!: number | null;

  @Column({
    name: 'valor_fixo',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  valorFixo!: number | null;

  /** Aplicado por último, sobre o valor de qualquer modo. */
  @Column({
    name: 'desconto_percentual',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  descontoPercentual!: number | null;

  @Column({ name: 'vigente_de', type: 'date' })
  vigenteDe!: string;

  @Column({ name: 'vigente_ate', type: 'date', nullable: true })
  vigenteAte!: string | null;

  @Column({ type: 'text', nullable: true })
  observacao!: string | null;

  @Column({ type: 'boolean', default: true })
  ativo!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
