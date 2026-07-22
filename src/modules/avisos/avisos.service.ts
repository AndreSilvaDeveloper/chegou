import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Aviso, Morador } from '../../database/entities';
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
    private notificationService: NotificationService,
  ) {}

  async listar(tenantId: string) {
    return this.avisoRepo.find({
      where: { tenantId, ativo: true },
      order: { createdAt: 'DESC' },
      relations: ['criadoPor'],
    });
  }

  async obter(tenantId: string, id: string) {
    const aviso = await this.avisoRepo.findOne({
      where: { tenantId, id },
      relations: ['criadoPor'],
    });
    if (!aviso) throw new NotFoundException('Aviso não encontrado');
    return aviso;
  }

  async criar(tenantId: string, userId: string, dto: CriarAvisoDto) {
    const aviso = this.avisoRepo.create({
      ...dto,
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

  private async dispararNotificacoes(aviso: Aviso) {
    // Buscar moradores com base no filtro
    const query = this.moradorRepo.createQueryBuilder('morador')
      .where('morador.tenant_id = :tenantId', { tenantId: aviso.tenantId })
      .andWhere('morador.ativo = true');

    if (aviso.destinatario === DestinatarioAviso.APARTAMENTO && aviso.destinatarioFiltro?.apartamentoId) {
      query.andWhere('morador.apartamento_id = :apartamentoId', { apartamentoId: aviso.destinatarioFiltro.apartamentoId });
    } else if (aviso.destinatario === DestinatarioAviso.BLOCO && aviso.destinatarioFiltro?.bloco) {
      query.innerJoin('morador.apartamento', 'apartamento')
        .andWhere('apartamento.bloco = :bloco', { bloco: aviso.destinatarioFiltro.bloco });
    }

    const moradores = await query.getMany();

    // Enfileirar notificações para cada morador com telefone
    for (const morador of moradores) {
      if (!morador.telefoneE164) continue;

      await this.notificationService.agendarNotificacao({
        tenantId: aviso.tenantId,
        tipo: TipoNotificacao.AVISO,
        destinatarioTelefone: morador.telefoneE164,
        destinatarioNome: morador.nome,
        moradorId: morador.id,
        referenciaTipo: 'aviso_geral', // Template
        referenciaId: aviso.id,
        conteudo: aviso.conteudo,
        variaveisJson: {
          titulo: aviso.titulo,
          conteudo: aviso.conteudo,
        },
      });
    }
  }

  async desativar(tenantId: string, id: string) {
    const aviso = await this.obter(tenantId, id);
    aviso.ativo = false;
    await this.avisoRepo.save(aviso);
    return { success: true };
  }
}
