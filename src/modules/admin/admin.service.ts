import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Like, QueryFailedError, Repository } from 'typeorm';
import { Tenant, User } from '../../database/entities';
import { aplicarEndereco } from '../../common/endereco.dto';
import { baseDeSlug, sufixoAleatorio } from '../../common/slug';
import { FilaGeocodificacaoService } from '../cep/fila-geocodificacao.service';
import { OpenwaService } from '../openwa/openwa.service';
import { AtualizarTenantDto } from './dto/atualizar-tenant.dto';
import { CriarTenantDto } from './dto/criar-tenant.dto';
import { DEFAULT_TENANT_CONFIG } from './dto/config-tenant.dto';
import { TenantConfigService } from '../../common/tenant-config/tenant-config.service';
import { TenantScopeService } from '../../common/tenant-scope/tenant-scope.service';

const PG_UNIQUE_VIOLATION = '23505';

/**
 * O nome que o Postgres deu ao `UNIQUE` de `tenants.slug` (migration 002).
 *
 * É o que separa "o slug colidiu, sorteia outro" de "o CNPJ já existe, avise o
 * usuário". Sem olhar a constraint, o retry mudaria o slug de um cadastro que
 * na verdade falhou por documento repetido — e o segundo erro seria idêntico ao
 * primeiro, agora com o slug trocado à toa.
 */
const SLUG_UNIQUE_CONSTRAINT = 'tenants_slug_key';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly config: ConfigService,
    private readonly openwa: OpenwaService,
    private readonly tenantConfig: TenantConfigService,
    private readonly tenantScope: TenantScopeService,
    private readonly geo: FilaGeocodificacaoService,
  ) {}

  async listarTenants(): Promise<Array<Tenant & { qtdUsuarios: number }>> {
    const tenants = await this.tenantRepo.find({ order: { nome: 'ASC' } });
    const counts = await this.userRepo
      .createQueryBuilder('u')
      .select('u.tenantId', 'tenantId')
      .addSelect('COUNT(*)::int', 'count')
      .where('u.tenantId IS NOT NULL')
      .groupBy('u.tenantId')
      .getRawMany<{ tenantId: string; count: number }>();
    const byTenant = Object.fromEntries(counts.map((r) => [r.tenantId, r.count]));
    return tenants.map((t) => ({ ...t, qtdUsuarios: byTenant[t.id] ?? 0 }));
  }

  async obterTenant(id: string): Promise<Tenant & { usuarios: User[] }> {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException('Condomínio não encontrado');
    const usuarios = await this.userRepo.find({
      where: { tenantId: id, ativo: true },
      order: { role: 'ASC', nome: 'ASC' },
    });
    return { ...tenant, usuarios };
  }

  /**
   * Cria o condomínio e o primeiro síndico.
   *
   * `administradoraId` vem de quem chama, nunca do corpo da request: o
   * superadmin escolhe a carteira, e a administradora só consegue criar dentro
   * da própria.
   */
  async criarTenant(dto: CriarTenantDto, administradoraId: string | null = null): Promise<Tenant> {
    const rounds = this.config.get<number>('BCRYPT_ROUNDS', 12);
    const senhaHash = await bcrypt.hash(dto.sindicoSenha, rounds);

    // Slug informado no corpo é respeitado (migração de dado); vazio, o servidor
    // gera. Só o gerado pode ser trocado no retry: forçar outro por cima de um
    // slug pedido explicitamente seria criar um condomínio diferente do pedido.
    const slugVeioDeFora = !!dto.slug;

    // Duas voltas, no máximo. A checagem de disponibilidade e o INSERT não são
    // atômicos, então dois cadastros simultâneos com o mesmo nome podem escolher
    // o mesmo slug — a segunda volta sorteia outro sufixo. Mais que isso é sinal
    // de que o conflito não era o slug.
    for (let tentativa = 0; ; tentativa++) {
      const slug = slugVeioDeFora ? dto.slug! : await this.slugUnico(dto.nome);

      try {
        const tenant = await this.tenantRepo.save(
          this.tenantRepo.create({
            administradoraId,
            nome: dto.nome,
            slug,
            documento: dto.documento ?? null,
            emailContato: dto.emailContato ?? null,
            telefoneContato: dto.telefoneContato ?? null,
            cep: dto.cep ?? null,
            endereco: dto.endereco ?? null,
            numero: dto.numero ?? null,
            complemento: dto.complemento ?? null,
            bairro: dto.bairro ?? null,
            cidade: dto.cidade ?? null,
            estado: dto.estado ?? null,
            plano: 'basico',
            ativo: true,
            configJson: { ...DEFAULT_TENANT_CONFIG },
          }),
        );
        await this.userRepo.save(
          this.userRepo.create({
            tenantId: tenant.id,
            nome: dto.sindicoNome,
            email: dto.sindicoEmail,
            telefone: dto.sindicoTelefone ?? null,
            senhaHash,
            role: 'sindico',
            ativo: true,
          }),
        );

        // Provisiona a instância WhatsApp (OpenWA) do condomínio — best-effort,
        // nunca bloqueia o cadastro se o gateway estiver indisponível.
        await this.openwa.provisionForTenant(tenant.id);

        // A coordenada do mapa vem depois, pela fila: o cadastro não espera
        // provedor externo.
        await this.geo.agendar(tenant.id);

        return await this.tenantRepo.findOneOrFail({ where: { id: tenant.id } });
      } catch (err) {
        if (!(err instanceof QueryFailedError) || (err as any).code !== PG_UNIQUE_VIOLATION) {
          throw err;
        }
        // Só o slug é resorteável. Documento e e-mail do síndico são escolha do
        // usuário: trocá-los por conta própria criaria o cadastro errado.
        const foiOSlug = (err as any).constraint === SLUG_UNIQUE_CONSTRAINT;
        if (foiOSlug && !slugVeioDeFora && tentativa < 1) continue;

        throw new ConflictException(
          foiOSlug
            ? 'Não foi possível gerar um endereço único para este condomínio; tente novamente'
            : 'Documento do condomínio ou e-mail do síndico já em uso',
        );
      }
    }
  }

  /**
   * Um slug livre a partir do nome do condomínio.
   *
   * Uma consulta só: traz os slugs que começam com a base e escolhe fora desse
   * conjunto. Sondar um por vez custaria uma ida ao banco por tentativa, e o
   * caso comum (nome inédito) já se resolve na primeira comparação.
   *
   * O `LIKE` é seguro sem escape porque a base sai de `baseDeSlug()`, que só
   * devolve `[a-z-]` — não há `%` nem `_` para virar curinga.
   */
  private async slugUnico(nome: string): Promise<string> {
    const base = baseDeSlug(nome);
    const vizinhos = await this.tenantRepo.find({
      select: { slug: true },
      where: { slug: Like(`${base}%`) },
    });
    const tomados = new Set(vizinhos.map((t) => t.slug));

    if (!tomados.has(base)) return base;
    for (let i = 0; i < 20; i++) {
      const candidato = `${base}-${sufixoAleatorio()}`;
      if (!tomados.has(candidato)) return candidato;
    }
    // 20 sorteios de 4 letras colidindo seguidos não acontece na prática; o
    // sufixo maior existe para não devolver um slug repetido em hipótese alguma.
    return `${base}-${sufixoAleatorio(8)}`;
  }

  async atualizarTenant(id: string, dto: AtualizarTenantDto): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException('Condomínio não encontrado');
    if (dto.nome !== undefined) tenant.nome = dto.nome;
    if (dto.slug !== undefined) tenant.slug = dto.slug;
    if (dto.documento !== undefined) tenant.documento = dto.documento || null;
    const enderecoMudou = aplicarEndereco(tenant, dto);
    if (dto.emailContato !== undefined) tenant.emailContato = dto.emailContato || null;
    if (dto.telefoneContato !== undefined) tenant.telefoneContato = dto.telefoneContato || null;
    if (dto.plano !== undefined) tenant.plano = dto.plano;
    if (dto.ativo !== undefined) tenant.ativo = dto.ativo;
    if (dto.configJson !== undefined) {
      // O class-transformer materializa TODO campo declarado no ConfigTenantDto,
      // inclusive os que não vieram no corpo, com valor `undefined`. Espalhar o
      // DTO cru sobrescreveria a config existente com undefined — e o JSONB
      // descarta essas chaves, apagando o que já estava salvo. Só o que veio
      // de fato pode entrar no merge.
      const alteracoes = Object.fromEntries(
        Object.entries(dto.configJson).filter(([, valor]) => valor !== undefined),
      );
      tenant.configJson = {
        ...DEFAULT_TENANT_CONFIG,
        ...(tenant.configJson ?? {}),
        ...alteracoes,
      };
    }
    try {
      const salvo = await this.tenantRepo.save(tenant);
      // Ligar/desligar um módulo precisa valer na próxima request, não depois do TTL.
      this.tenantConfig.invalidate(id);
      // Idem para desativar o condomínio: o escopo por request também é cacheado.
      this.tenantScope.invalidate(id);
      // Só quando o endereço mudou de verdade: a tela manda o endereço inteiro
      // a cada salvamento, mesmo quem só corrigiu o nome do condomínio.
      if (enderecoMudou) await this.geo.agendar(id);
      return salvo;
    } catch (err) {
      if (err instanceof QueryFailedError && (err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        throw new ConflictException('Slug ou documento já em uso por outro condomínio');
      }
      throw err;
    }
  }

  async assertTenantExists(id: string): Promise<void> {
    const exists = await this.tenantRepo.exists({ where: { id } });
    if (!exists) throw new NotFoundException('Condomínio não encontrado');
  }
}
