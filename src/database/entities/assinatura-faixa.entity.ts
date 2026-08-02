import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { numericTransformer } from './numeric.transformer';

/**
 * Para quem a faixa vale.
 *
 * São duas tabelas de preço no mesmo lugar: o condomínio que paga sozinho anda
 * pelas faixas de volume; a administradora paga o preço de atacado pela
 * carteira inteira. O tipo é o que separa uma da outra.
 */
export enum TipoClienteAssinatura {
  CONDOMINIO = 'condominio',
  ADMINISTRADORA = 'administradora',
}

/**
 * Uma faixa da tabela de preços da plataforma.
 *
 * A faixa é escolhida pela quantidade de apartamentos e o preço dela vale para
 * **todos** eles — não é escalonado por trecho. 120 apartamentos na faixa de
 * R$ 3,49 pagam 120 × 3,49, e não 100 × 3,99 + 20 × 3,49.
 */
@Entity('assinatura_faixas')
export class AssinaturaFaixa {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tipo_cliente', type: 'varchar', length: 20 })
  tipoCliente!: TipoClienteAssinatura;

  /** Limite superior da faixa, inclusive. `null` = última faixa, sem teto. */
  @Column({ name: 'ate_quantidade', type: 'int', nullable: true })
  ateQuantidade!: number | null;

  @Column({
    name: 'preco_apartamento',
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  precoApartamento!: number;

  @Column({ type: 'int' })
  ordem!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
