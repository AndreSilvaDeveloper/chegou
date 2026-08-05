import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';

/** Uma linha de texto lida pelo serviço de OCR. */
export interface LinhaOcr {
  texto: string;
  confianca: number;
  /** Retângulo `[x1, y1, x2, y2]` — usado para agrupar linhas vizinhas. */
  box: [number, number, number, number];
}

/**
 * Os campos que a leitura de etiqueta tenta preencher.
 *
 * Mesma forma para o que o parser extraiu e para o gabarito — é o que permite
 * comparar campo a campo e montar o placar.
 */
export interface CamposEtiqueta {
  destinatario: string | null;
  /** Logradouro e número da rua, sem complemento: `Avenida Barão do Rio Branco 2288`. */
  endereco: string | null;
  /**
   * O complemento como a etiqueta o escreveu: `Sala 710`, `2009`, `Apto 302 Bloco B`.
   *
   * É de onde `bloco` e `numero` saem na maioria das etiquetas reais — o campo
   * `Complemento` é onde o remetente digita a unidade, e ele aceita número puro
   * (`2009`), sem palavra-chave nenhuma. Guardar o texto lido além do que foi
   * interpretado é o que permite conferir a interpretação depois.
   */
  complemento: string | null;
  bloco: string | null;
  /** Apartamento, sala ou casa — o que identifica a unidade. */
  numero: string | null;
  andar: string | null;
  bairro: string | null;
  cidade: string | null;
  /** Sigla de duas letras. `Minas Gerais` e `MG` chegam aqui como `MG`. */
  uf: string | null;
  transportadora: string | null;
  codigoRastreio: string | null;
  cep: string | null;
}

/**
 * Amostra de etiqueta usada para afinar o parser.
 *
 * Dado de plataforma: `tenantId` é nulável e serve só para saber de onde a
 * amostra veio. Ver a migration 026 para o porquê.
 */
@Entity('etiqueta_amostras')
export class EtiquetaAmostra {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string | null;

  @ManyToOne(() => Tenant, { nullable: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant | null;

  @Column({ name: 'foto_url', type: 'text' })
  fotoUrl!: string;

  @Column({ name: 'foto_key', type: 'text' })
  fotoKey!: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  transportadora!: string | null;

  @Column({ name: 'ocr_linhas', type: 'jsonb', default: () => "'[]'::jsonb" })
  ocrLinhas!: LinhaOcr[];

  @Column({ name: 'ocr_ms', type: 'int', nullable: true })
  ocrMs!: number | null;

  @Column({ type: 'jsonb', nullable: true })
  extraido!: CamposEtiqueta | null;

  @Column({ name: 'parser_versao', type: 'varchar', length: 20, nullable: true })
  parserVersao!: string | null;

  /** `null` = ainda não conferida pelo superadmin; fica fora do placar. */
  @Column({ type: 'jsonb', nullable: true })
  gabarito!: CamposEtiqueta | null;

  @Column({ type: 'text', nullable: true })
  observacao!: string | null;

  @Column({ default: true })
  ativo!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
