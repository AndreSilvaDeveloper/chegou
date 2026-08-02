import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Qual cupom vale para qual cliente.
 *
 * **O cupom em si vive no gateway** — escopo, vigência, limites e contagem de
 * uso são de lá. Aqui fica só a atribuição: duplicar as regras criaria duas
 * fontes da verdade que divergem no primeiro erro de rede, e a que importa é a
 * que desconta de verdade.
 *
 * Um em aberto por cliente (índice parcial), como `AssinaturaCondicao`.
 */
@Entity('assinatura_cupom_cliente')
export class AssinaturaCupomCliente {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string | null;

  @Column({ name: 'administradora_id', type: 'uuid', nullable: true })
  administradoraId!: string | null;

  /** Caixa alta: é como o gateway normaliza o código. */
  @Column({ type: 'varchar', length: 60 })
  codigo!: string;

  /**
   * Última competência em que o cupom é aplicado (`YYYY-MM-01`).
   *
   * `null` = enquanto ele valer no gateway. É o freio do nosso lado: o limite
   * de uso é de lá, mas "este cliente para de receber em junho" é decisão
   * comercial nossa.
   */
  @Column({ name: 'aplicar_ate', type: 'date', nullable: true })
  aplicarAte!: string | null;

  @Column({ type: 'boolean', default: true })
  ativo!: boolean;

  @Column({ type: 'text', nullable: true })
  observacao!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
