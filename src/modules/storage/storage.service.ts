import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket: string;
  private readonly region: string;
  private readonly endpoint: string | undefined;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly publicBaseUrl: string;
  private _s3: S3Client | null = null;

  constructor(config: ConfigService) {
    this.endpoint = config.get<string>('STORAGE_ENDPOINT') || undefined;
    this.bucket = config.get<string>('STORAGE_BUCKET', '') ?? '';
    this.region = config.get<string>('STORAGE_REGION', 'us-east-1');
    this.accessKey = config.get<string>('STORAGE_ACCESS_KEY', '') ?? '';
    this.secretKey = config.get<string>('STORAGE_SECRET_KEY', '') ?? '';
    this.publicBaseUrl =
      config.get<string>('STORAGE_PUBLIC_URL') ??
      (this.endpoint ? `${this.endpoint}/${this.bucket}` : '');
    if (!this.isConfigured) {
      this.logger.warn('Storage (S3) não configurado — upload de fotos ficará indisponível');
    }
  }

  get isConfigured(): boolean {
    return !!(this.bucket && this.accessKey && this.secretKey);
  }

  private get s3(): S3Client {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException(
        'Upload de fotos indisponível: storage (S3) não configurado neste ambiente',
      );
    }
    if (!this._s3) {
      this._s3 = new S3Client({
        region: this.region,
        endpoint: this.endpoint,
        forcePathStyle: !!this.endpoint,
        credentials: { accessKeyId: this.accessKey, secretAccessKey: this.secretKey },
      });
    }
    return this._s3;
  }

  /** Nome do arquivo é do usuário — só a extensão é aproveitada, e sanitizada. */
  private extensaoSegura(originalname: string): string {
    const ext = originalname.split('.').pop()?.toLowerCase() ?? 'bin';
    return /^[a-z0-9]{1,5}$/.test(ext) ? ext : 'bin';
  }

  private async upload(
    prefixo: string,
    tenantId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string },
  ): Promise<{ url: string; key: string }> {
    const key = `${prefixo}/${tenantId}/${randomUUID()}.${this.extensaoSegura(file.originalname)}`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );
    return { url: `${this.publicBaseUrl}/${key}`, key };
  }

  async uploadEncomendaFoto(
    tenantId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string },
  ): Promise<{ url: string; key: string }> {
    return this.upload('encomendas', tenantId, file);
  }

  /** Contrato de locação de vaga (PDF ou foto do documento assinado). */
  async uploadContratoVaga(
    tenantId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string },
  ): Promise<{ url: string; key: string }> {
    return this.upload('contratos-vagas', tenantId, file);
  }

  /**
   * Remove um objeto. Falha aqui não deve derrubar a operação de negócio: o
   * arquivo órfão custa storage, mas perder a troca do contrato custa mais.
   */
  async remover(key: string): Promise<void> {
    if (!this.isConfigured) return;
    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      this.logger.warn(`Falha ao remover ${key} do storage: ${err}`);
    }
  }
}
