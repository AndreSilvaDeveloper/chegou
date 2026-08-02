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
  /** Dinheiro devolvido: não é dívida ativa nem receita. Chega pelo webhook. */
  ESTORNADA = 'estornada',
  /** Chargeback ou cobrança em disputa: fica fora de todo total e pede gente. */
  EM_DISPUTA = 'em_disputa',
}

/**
 * O estado da **emissão** da cobrança — que não é o mesmo que o estado da
 * fatura.
 *
 * `status` responde "o cliente deve ou pagou?"; este aqui responde "a cobrança
 * chegou a existir no gateway?". Uma fatura pode estar `aberta` e `pendente`
 * (ainda não emitimos), `aberta` e `emitida` (link no ar, esperando), ou
 * `aberta` e `erro` (não conseguimos emitir) — e as três pedem coisas
 * diferentes de quem olha a tela.
 */
export enum StatusCobranca {
  PENDENTE = 'pendente',
  EMITIDA = 'emitida',
  ERRO = 'erro',
  /** Não havia gateway configurado quando a fatura nasceu. */
  DESLIGADA = 'desligada',
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

  // ---------------------------------------------------------------- cobrança

  /** Id da cobrança na Payment API. String porque `bigint` não cabe em `number`. */
  @Column({ name: 'cobranca_id', type: 'bigint', nullable: true })
  cobrancaId!: string | null;

  @Column({ name: 'cobranca_asaas_id', type: 'varchar', length: 60, nullable: true })
  cobrancaAsaasId!: string | null;

  @Column({ name: 'cobranca_status', type: 'varchar', length: 20, default: StatusCobranca.PENDENTE })
  cobrancaStatus!: StatusCobranca;

  /** Status bruto do gateway. O nosso é resumo; resumo não investiga divergência. */
  @Column({ name: 'cobranca_status_gateway', type: 'varchar', length: 40, nullable: true })
  cobrancaStatusGateway!: string | null;

  /**
   * Gerada **uma vez** e gravada **antes** do POST.
   *
   * É o que impede cobrar o cliente duas vezes: no retry depois de um timeout,
   * a mesma chave faz a API devolver a mesma cobrança. Gerar chave nova no
   * retry é exatamente como se cobra em duplicidade.
   */
  @Column({ name: 'cobranca_idempotency_key', type: 'uuid', nullable: true })
  cobrancaIdempotencyKey!: string | null;

  @Column({ name: 'cobranca_erro', type: 'text', nullable: true })
  cobrancaErro!: string | null;

  /** Link de pagamento: o cliente escolhe PIX, boleto ou cartão na tela do gateway. */
  @Column({ name: 'invoice_url', type: 'text', nullable: true })
  invoiceUrl!: string | null;

  @Column({ name: 'sincronizado_em', type: 'timestamptz', nullable: true })
  sincronizadoEm!: Date | null;

  /** Baixa/cancelamento aplicado aqui que o gateway ainda não confirmou. */
  @Column({ name: 'cobranca_dessincronizada', type: 'boolean', default: false })
  cobrancaDessincronizada!: boolean;

  // ------------------------------------------------------------------ cupom

  /**
   * O cupom aplicado nesta fatura, se houve.
   *
   * O desconto **já está** dentro de `valor`. Estes dois campos existem para a
   * fatura se explicar: sem eles, uma fatura com cupom seria indistinguível de
   * uma fatura com preço errado — o valor viria menor e nada diria por quê.
   */
  @Column({ name: 'cupom_codigo', type: 'varchar', length: 60, nullable: true })
  cupomCodigo!: string | null;

  @Column({
    name: 'cupom_desconto',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  cupomDesconto!: number | null;

  @OneToMany(() => AssinaturaFaturaItem, (item) => item.fatura, { cascade: ['insert'] })
  itens!: AssinaturaFaturaItem[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
