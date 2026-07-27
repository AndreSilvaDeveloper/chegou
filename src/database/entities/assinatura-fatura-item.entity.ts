import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AssinaturaFatura } from './assinatura-fatura.entity';
import { Tenant } from './tenant.entity';
import { numericTransformer } from './numeric.transformer';

/**
 * Um condomínio dentro de uma fatura.
 *
 * Na fatura de um condomínio direto existe um item só; na de uma administradora,
 * um por condomínio da carteira — é o que responde "por que deu esse valor".
 * O nome fica **gravado** (e a FK é `SET NULL`) porque excluir o condomínio não
 * pode apagar a memória do que já foi cobrado.
 */
@Entity('assinatura_fatura_itens')
export class AssinaturaFaturaItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'fatura_id', type: 'uuid' })
  faturaId!: string;

  @ManyToOne(() => AssinaturaFatura, (fatura) => fatura.itens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fatura_id' })
  fatura!: AssinaturaFatura;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string | null;

  @ManyToOne(() => Tenant, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant | null;

  @Column({ name: 'condominio_nome', type: 'varchar', length: 120 })
  condominioNome!: string;

  @Column({ type: 'int' })
  apartamentos!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, transformer: numericTransformer })
  subtotal!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
