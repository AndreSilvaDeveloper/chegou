import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { Encomenda, Morador } from '../../../database/entities';
import { QUEUE_CONFIRMAR_RETIRADA } from '../../../queues/queues.module';
import { ConfirmarRetiradaJob, WhatsappService } from '../whatsapp.service';

@Processor(QUEUE_CONFIRMAR_RETIRADA)
export class ConfirmarRetiradaProcessor extends WorkerHost {
  private readonly logger = new Logger(ConfirmarRetiradaProcessor.name);

  constructor(
    @InjectRepository(Encomenda) private readonly encomendaRepo: Repository<Encomenda>,
    @InjectRepository(Morador) private readonly moradorRepo: Repository<Morador>,
    private readonly whatsapp: WhatsappService,
  ) {
    super();
  }

  async process(job: Job<ConfirmarRetiradaJob>): Promise<void> {
    const { encomendaId, tenantId } = job.data;
    this.logger.log(`Processando confirmação: encomenda=${encomendaId}`);

    const encomenda = await this.encomendaRepo.findOne({
      where: { id: encomendaId, tenantId },
      relations: { apartamento: true, tenant: true, moradorDestino: true },
    });
    if (!encomenda) throw new NotFoundException(`Encomenda ${encomendaId} não encontrada`);

    const morador =
      encomenda.moradorDestino ??
      (await this.moradorRepo.findOne({
        where: { tenantId, apartamentoId: encomenda.apartamentoId, principal: true, ativo: true },
      }));

    if (!morador?.telefoneE164 || !morador.receberWhatsapp) {
      this.logger.log(`Morador sem telefone ou opt-out — pulando confirmação`);
      return;
    }

    await this.whatsapp.sendTemplated({
      tenantId,
      encomendaId,
      moradorId: morador.id,
      to: morador.telefoneE164,
      templateKey: 'retirada_confirmada',
      variables: {
        nome: morador.nome.split(' ')[0],
        apartamento: encomenda.apartamento!.identificador,
        condominio: encomenda.tenant!.nome,
      },
      idempotencyKey: `encomenda:${encomendaId}:confirmar`,
    });
  }
}
