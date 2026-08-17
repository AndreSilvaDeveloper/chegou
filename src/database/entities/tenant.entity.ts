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
import { User } from './user.entity';
import { Apartamento } from './apartamento.entity';
import { Morador } from './morador.entity';
import { Encomenda } from './encomenda.entity';
import { numericTransformer } from './numeric.transformer';

/**
 * Quão exata é a coordenada do condomínio.
 *
 * `endereco` é a porta; `cep` é a rua certa sem o número; `cidade` é o centro do
 * município — pode estar a quilômetros. Quem desenha o mapa **precisa** dessa
 * distinção, senão trata os três alfinetes como se fossem igualmente confiáveis.
 */
export type GeoPrecisao = 'endereco' | 'cep' | 'cidade';

@Entity({ name: 'tenants' })
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** NULL = condomínio sem administradora, gerido direto pelo superadmin. */
  @Column({ name: 'administradora_id', type: 'uuid', nullable: true })
  administradoraId!: string | null;

  @ManyToOne(() => Administradora, (a) => a.tenants)
  @JoinColumn({ name: 'administradora_id' })
  administradora?: Administradora | null;

  @Column({ type: 'varchar', length: 200 })
  nome!: string;

  @Column({ type: 'varchar', length: 80, unique: true })
  slug!: string;

  @Column({ type: 'varchar', length: 14, nullable: true })
  documento!: string | null;

  // ---- Endereço ----
  // `endereco` é o LOGRADOURO (rua/avenida), sem número. O nome ficou por
  // compatibilidade — ver `db/migrations/035_endereco_completo_tenant.sql`.
  @Column({ type: 'text', nullable: true })
  endereco!: string | null;

  /** Texto, não inteiro: "s/n", "1179-A" e "KM 12" são endereços válidos. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  numero!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  complemento!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  bairro!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  cidade!: string | null;

  @Column({ type: 'char', length: 2, nullable: true })
  estado!: string | null;

  /** Só dígitos (8). A máscara `00000-000` é da tela. */
  @Column({ type: 'varchar', length: 8, nullable: true })
  cep!: string | null;

  // ---- Coordenadas (mapa da plataforma) ----
  // Resolvidas **depois** do salvamento, na fila `geocodificacao`. NULL é estado
  // normal: o endereço acabou de mudar, ou nenhum provedor achou o lugar.
  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true, transformer: numericTransformer })
  latitude!: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true, transformer: numericTransformer })
  longitude!: number | null;

  /** De onde veio a coordenada — ver `db/migrations/036_geo_tenant.sql`. */
  @Column({ name: 'geo_precisao', type: 'varchar', length: 20, nullable: true })
  geoPrecisao!: GeoPrecisao | null;

  @Column({ name: 'geo_atualizado_em', type: 'timestamptz', nullable: true })
  geoAtualizadoEm!: Date | null;

  @Column({ name: 'telefone_contato', type: 'varchar', length: 20, nullable: true })
  telefoneContato!: string | null;

  @Column({ name: 'email_contato', type: 'citext', nullable: true })
  emailContato!: string | null;

  @Column({ type: 'varchar', length: 40, default: 'basico' })
  plano!: string;

  @Column({ type: 'boolean', default: true })
  ativo!: boolean;

  @Column({ name: 'whatsapp_numero', type: 'varchar', length: 20, nullable: true })
  whatsappNumero!: string | null;

  // ---- Integração OpenWA (gateway WhatsApp não-oficial) ----
  // Sessão/instância própria do condomínio no gateway. Provisionada na criação do tenant.
  @Column({ name: 'whatsapp_session_id', type: 'uuid', nullable: true })
  whatsappSessionId!: string | null;

  @Column({ name: 'whatsapp_session_name', type: 'varchar', length: 60, nullable: true })
  whatsappSessionName!: string | null;

  // Último status conhecido da sessão (ready, qr_ready, disconnected, failed, ...)
  @Column({ name: 'whatsapp_status', type: 'varchar', length: 30, nullable: true })
  whatsappStatus!: string | null;

  // Token do link público de autocadastro de morador (QR). NULL = ainda não gerado.
  // Rotacionar invalida o anterior. A rota pública resolve o condomínio por ele.
  @Column({ name: 'autocadastro_token', type: 'varchar', length: 32, nullable: true })
  autocadastroToken!: string | null;

  /**
   * Dia do vencimento da fatura da assinatura (1-31). NULL = usa o padrão da
   * plataforma. Fica fora do `config_json` de propósito: aquilo é o operacional
   * que o condomínio edita, isto é contrato — só o superadmin mexe.
   */
  @Column({ name: 'assinatura_dia_vencimento', type: 'smallint', nullable: true })
  assinaturaDiaVencimento!: number | null;

  @Column({ name: 'config_json', type: 'jsonb', default: () => "'{}'::jsonb" })
  configJson!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => User, (u) => u.tenant)
  users?: User[];

  @OneToMany(() => Apartamento, (a) => a.tenant)
  apartamentos?: Apartamento[];

  @OneToMany(() => Morador, (m) => m.tenant)
  moradores?: Morador[];

  @OneToMany(() => Encomenda, (e) => e.tenant)
  encomendas?: Encomenda[];
}
