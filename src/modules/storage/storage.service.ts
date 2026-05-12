import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(config: ConfigService) {
    const endpoint = config.get<string>('STORAGE_ENDPOINT');
    this.bucket = config.getOrThrow<string>('STORAGE_BUCKET');
    this.publicBaseUrl =
      config.get<string>('STORAGE_PUBLIC_URL') ?? (endpoint ? `${endpoint}/${this.bucket}` : '');

    this.s3 = new S3Client({
      region: config.get<string>('STORAGE_REGION', 'us-east-1'),
      endpoint: endpoint || undefined,
      forcePathStyle: !!endpoint,
      credentials: {
        accessKeyId: config.getOrThrow<string>('STORAGE_ACCESS_KEY'),
        secretAccessKey: config.getOrThrow<string>('STORAGE_SECRET_KEY'),
      },
    });
  }

  async uploadEncomendaFoto(
    tenantId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string },
  ): Promise<{ url: string; key: string }> {
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? 'bin';
    const safeExt = /^[a-z0-9]{1,5}$/.test(ext) ? ext : 'bin';
    const key = `encomendas/${tenantId}/${randomUUID()}.${safeExt}`;
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
}
