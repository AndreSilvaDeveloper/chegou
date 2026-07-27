import { Controller, Get } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Public } from '../../common/decorators';

// Lido uma vez, do package.json que acompanha o build (no container fica em
// /app/package.json). É como se confere, sem entrar no servidor, se o deploy
// que subiu é o esperado — o front mostra a mesma versão na sidebar.
const APP_VERSION = (() => {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')).version as string;
  } catch {
    return 'desconhecida';
  }
})();

@Public()
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', version: APP_VERSION, timestamp: new Date().toISOString() };
  }
}
