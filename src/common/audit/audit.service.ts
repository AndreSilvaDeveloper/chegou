import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  async log(params: {
    tenantId?: string | null;
    userId?: string | null;
    entity: string;
    entityId?: string | null;
    action: string;
    diffJson?: Record<string, any>;
    ipAddress?: string | null;
    userAgent?: string | null;
  }) {
    try {
      const log = this.auditRepo.create({
        tenantId: params.tenantId || null,
        userId: params.userId || null,
        entity: params.entity,
        entityId: params.entityId || null,
        action: params.action,
        diffJson: params.diffJson || {},
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
      });

      await this.auditRepo.save(log);
    } catch (error) {
      // Falhas no log de auditoria não devem quebrar o fluxo principal
      this.logger.error(`Falha ao registrar auditoria: ${error}`, error);
    }
  }
}
