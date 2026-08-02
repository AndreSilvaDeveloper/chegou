import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * A política de bloqueio por inadimplência — espelho local do que foi enviado
 * ao gateway.
 *
 * **Linha única** (`id = 1`): somos uma company só lá dentro. Quem decide se um
 * cliente está bloqueado é o gateway, que conhece as cobranças vencidas; o que
 * mora aqui é a configuração dessa decisão, para a tela abrir sem round-trip e
 * continuar abrindo com a API fora do ar.
 */
@Entity('assinatura_politica_acesso')
export class AssinaturaPoliticaAcesso {
  @PrimaryColumn({ type: 'int', default: 1 })
  id!: number;

  @Column({ name: 'max_faturas_vencidas', type: 'int', default: 1 })
  maxFaturasVencidas!: number;

  /** Dias depois do vencimento antes de travar. O amortecedor do esquecimento. */
  @Column({ name: 'dias_tolerancia', type: 'int', default: 5 })
  diasTolerancia!: number;

  /**
   * `blockOnStandaloneCharges`.
   *
   * **Sem isto, nada bloqueia**: usamos cobrança avulsa, e o padrão do gateway
   * para esse campo é `false`.
   */
  @Column({ name: 'bloquear_avulsas', type: 'boolean', default: true })
  bloquearAvulsas!: boolean;

  @Column({ name: 'mensagem_bloqueio', type: 'text', nullable: true })
  mensagemBloqueio!: string | null;

  @Column({ name: 'cache_ttl_minutos', type: 'int', default: 5 })
  cacheTtlMinutos!: number;

  @Column({ name: 'sincronizado_em', type: 'timestamptz', nullable: true })
  sincronizadoEm!: Date | null;

  @Column({ name: 'erro_ultima_sync', type: 'text', nullable: true })
  erroUltimaSync!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
