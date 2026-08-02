import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssinaturaPoliticaAcesso } from '../../database/entities';
import { PaymentApiClient } from '../pagamentos/payment-api.client';
import { AtualizarPoliticaAcessoDto } from './dto/politica-acesso.dto';

/** O corpo de `PUT /api/v1/access-policy`. */
interface AccessPolicyRequest {
  maxOverdueCharges: number;
  overdueToleranceDays: number;
  blockOnStandaloneCharges: boolean;
  customBlockMessage: string | null;
  cacheTtlMinutes: number;
}

export interface PoliticaComEstado extends AssinaturaPoliticaAcesso {
  /** O bloqueio está mesmo agindo? Depende do interruptor, não só da política. */
  bloqueioAtivo: boolean;
  /** `false` quando não há gateway configurado. */
  integracaoLigada: boolean;
}

/**
 * A política de bloqueio: nossa cópia e a do gateway.
 *
 * Salvar grava **local primeiro** e depois tenta o gateway. Se a chamada
 * falhar, a configuração fica gravada com `erro_ultima_sync` preenchido, e a
 * tela mostra a divergência — em vez de perder o que o superadmin acabou de
 * digitar por causa de um timeout.
 */
@Injectable()
export class PoliticaAcessoService {
  private readonly logger = new Logger(PoliticaAcessoService.name);

  constructor(
    @InjectRepository(AssinaturaPoliticaAcesso)
    private readonly repo: Repository<AssinaturaPoliticaAcesso>,
    private readonly api: PaymentApiClient,
    private readonly config: ConfigService,
  ) {}

  async obter(): Promise<PoliticaComEstado> {
    const politica = await this.linha();
    return {
      ...politica,
      integracaoLigada: this.api.configured,
      // Os dois precisam ser verdadeiros para alguém ser bloqueado. A tela diz
      // isso com todas as letras: política configurada e bloqueio desligado é
      // exatamente o estado em que se sobe esta funcionalidade.
      bloqueioAtivo:
        this.api.configured && this.config.get<boolean>('PAYMENT_BLOQUEIO_ATIVO', false) === true,
    };
  }

  async atualizar(dto: AtualizarPoliticaAcessoDto): Promise<PoliticaComEstado> {
    const politica = await this.linha();

    if (dto.maxFaturasVencidas !== undefined) politica.maxFaturasVencidas = dto.maxFaturasVencidas;
    if (dto.diasTolerancia !== undefined) politica.diasTolerancia = dto.diasTolerancia;
    if (dto.bloquearAvulsas !== undefined) politica.bloquearAvulsas = dto.bloquearAvulsas;
    if (dto.cacheTtlMinutos !== undefined) politica.cacheTtlMinutos = dto.cacheTtlMinutos;
    if (dto.mensagemBloqueio !== undefined) {
      politica.mensagemBloqueio = dto.mensagemBloqueio || null;
    }

    await this.repo.save(politica);
    await this.enviarAoGateway(politica);
    return this.obter();
  }

  /**
   * Manda a política para o gateway.
   *
   * **Mudança de política não invalida o cache de lá** — a própria referência
   * avisa. O efeito só aparece depois do `cacheTtlMinutes`, e a tela precisa
   * dizer isso: sem esse aviso, quem aumentar a tolerância vai achar que não
   * funcionou e mexer de novo.
   */
  private async enviarAoGateway(politica: AssinaturaPoliticaAcesso): Promise<void> {
    if (!this.api.configured) return;

    const corpo: AccessPolicyRequest = {
      maxOverdueCharges: politica.maxFaturasVencidas,
      overdueToleranceDays: politica.diasTolerancia,
      // Sem isto nada bloqueia: usamos cobrança avulsa, e o padrão deles é false.
      blockOnStandaloneCharges: politica.bloquearAvulsas,
      customBlockMessage: politica.mensagemBloqueio,
      cacheTtlMinutes: politica.cacheTtlMinutos,
    };

    try {
      await this.api.put('/access-policy', corpo);
      politica.sincronizadoEm = new Date();
      politica.erroUltimaSync = null;
    } catch (err) {
      const detalhe = (err as Error).message;
      politica.erroUltimaSync = detalhe.slice(0, 500);
      this.logger.error(`Política de acesso não chegou ao gateway: ${detalhe}`);
    }
    await this.repo.save(politica);
  }

  /** A linha única. Criada se a migration ainda não tiver rodado num ambiente. */
  private async linha(): Promise<AssinaturaPoliticaAcesso> {
    const existente = await this.repo.findOne({ where: { id: 1 } });
    if (existente) return existente;
    return this.repo.save(this.repo.create({ id: 1 }));
  }
}
