import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Tenant } from './tenant.entity';
import { TipoVaga } from './vaga.entity';
import { numericTransformer } from './numeric.transformer';

/**
 * Valor mensal sugerido por tipo de vaga, mantido pelo síndico.
 *
 * Serve para pré-preencher a locação. O valor efetivamente cobrado fica em
 * `vagas_locacao.valor_mensal`, então reajustar a tabela não mexe em contrato
 * já assinado.
 */
@Entity('vagas_precos')
export class VagaPreco {
  @PrimaryColumn({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @PrimaryColumn({ type: 'varchar', length: 20 })
  tipo!: TipoVaga;

  @Column({ name: 'valor_mensal', type: 'decimal', precision: 10, scale: 2, transformer: numericTransformer })
  valorMensal!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
