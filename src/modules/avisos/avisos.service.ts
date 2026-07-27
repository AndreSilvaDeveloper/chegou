import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Apartamento, Aviso, Morador } from '../../database/entities';
import { assertRefDoTenant } from '../../common/tenant-scope/tenant-ref';
import { DestinatarioAviso } from '../../database/entities/aviso.entity';
import { TipoNotificacao } from '../../database/entities/notificacao.entity';
import { CriarAvisoDto } from './dto/criar-aviso.dto';
import { NotificationService } from '../notificacoes/notification.service';

@Injectable()
export class AvisosService {
  constructor(
    @InjectRepository(Aviso)
    private avisoRepo: Repository<Aviso>,
    @InjectRepository(Morador)
    private moradorRepo: Repository<Morador>,
    @InjectRepository(Apartamento)
    private apartamentoRepo: Repository<Apartamento>,
    private notificationService: NotificationService,
  ) {}

  async listar(tenantId: string) {
    return this.avisoRepo.find({
      where: { tenantId, ativo: true },
      order: { createdAt: 'DESC' },
      relations: { criadoPor: true },
    });
  }

  async obter(tenantId: string, id: string) {
    const aviso = await this.avisoRepo.findOne({
      where: { tenantId, id },
      relations: { criadoPor: true },
    });
    if (!aviso) throw new NotFoundException('Aviso não encontrado');
    return aviso;
  }

  async criar(tenantId: string, userId: string, dto: CriarAvisoDto) {
    await this.assertDestinatarioDoTenant(tenantId, dto);
    const aviso = this.avisoRepo.create({
      ...dto,
      // Depois do spread de propósito: o corpo da request não escolhe o dono.
      tenantId,
      criadoPorId: userId,
    });
    
    await this.avisoRepo.save(aviso);

    if (dto.enviarWhatsapp) {
      await this.dispararNotificacoes(aviso);
      aviso.enviadaAt = new Date();
      await this.avisoRepo.save(aviso);
    }

    return aviso;
  }

  /**
   * O apartamento do filtro precisa ser deste condomínio.
   *
   * A busca de moradores já é filtrada por tenant, então um id de fora não
   * vazaria dado — mas viraria um aviso "enviado" para ninguém, sem erro. Falha
   * explícita é melhor que silêncio.
   */
  private async assertDestinatarioDoTenant(tenantId: string, dto: CriarAvisoDto): Promise<void> {
    const apartamentoId = dto.destinatarioFiltro?.apartamentoId;
    if (dto.destinatario !== DestinatarioAviso.APARTAMENTO || !apartamentoId) return;

    await assertRefDoTenant(
      this.apartamentoRepo,
      tenantId,
      apartamentoId,
      'Apartamento não encontrado neste condomínio',
    );
  }

  private async dispararNotificacoes(aviso: Aviso) {
    // Buscar moradores com base no filtro
    const query = this.moradorRepo.createQueryBuilder('morador')
      .where('morador.tenant_id = :tenantId', { tenantId: aviso.tenantId })
      .andWhere('morador.ativo = true')
      // Quem pediu para não receber WhatsApp não entra nem na fila. Mandar
      // assim mesmo rende denúncia, e denúncia é o que bloqueia o número.
      .andWhere('morador.receber_whatsapp = true')
      .andWhere("morador.telefone_e164 IS NOT NULL AND morador.telefone_e164 <> ''");

    if (aviso.destinatario === DestinatarioAviso.APARTAMENTO && aviso.destinatarioFiltro?.apartamentoId) {
      query.andWhere('morador.apartamento_id = :apartamentoId', { apartamentoId: aviso.destinatarioFiltro.apartamentoId });
    } else if (aviso.destinatario === DestinatarioAviso.BLOCO && aviso.destinatarioFiltro?.bloco) {
      query.innerJoin('morador.apartamento', 'apartamento')
        .andWhere('apartamento.bloco = :bloco', { bloco: aviso.destinatarioFiltro.bloco });
    }

    const moradores = await query.getMany();
    if (moradores.length === 0) return;

    // Em lote: um aviso para o prédio inteiro são centenas de mensagens, e o
    // síndico está esperando a resposta do POST.
    await this.notificationService.agendarEmLote(
      moradores.map((morador) => ({
        tenantId: aviso.tenantId,
        tipo: TipoNotificacao.AVISO,
        destinatarioTelefone: morador.telefoneE164 as string,
        destinatarioNome: morador.nome,
        moradorId: morador.id,
        referenciaTipo: 'aviso_geral', // Template
        referenciaId: aviso.id,
        conteudo: aviso.conteudo,
        variaveisJson: {
          titulo: aviso.titulo,
          conteudo: aviso.conteudo,
        },
      })),
    );
  }

  async desativar(tenantId: string, id: string) {
    const aviso = await this.obter(tenantId, id);
    aviso.ativo = false;
    await this.avisoRepo.save(aviso);
    return { success: true };
  }
}
