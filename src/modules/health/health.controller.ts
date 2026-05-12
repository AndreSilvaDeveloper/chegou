import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators';

@Public()
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
