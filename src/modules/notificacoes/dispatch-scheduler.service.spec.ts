import Redis from 'ioredis';
import { AntiBanConfig, DispatchSchedulerService } from './dispatch-scheduler.service';

/**
 * Redis de mentira, só com o que o agendador usa: GET/SET com PX e os scripts
 * Lua (reservar, empurrar, cota). Os scripts são reimplementados aqui em JS —
 * o que o teste garante é o CONTRATO deles: um slot por vez, nunca para trás,
 * e cota que não deixa passar do limite.
 */
class RedisFake {
  private readonly dados = new Map<string, string>();

  async eval(script: string, _n: number, key: string, ...args: string[]): Promise<unknown> {
    const atual = Number(this.dados.get(key) ?? '0');

    if (script.includes("redis.call('INCR'")) {
      const [limite] = args;
      const usados = atual + 1;
      if (usados > Number(limite)) return 0;
      this.dados.set(key, String(usados));
      return 1;
    }

    if (script.includes('local ultimo')) {
      const [agora, minimo, passo] = args.map(Number);
      const slot = Math.max(agora, atual, minimo);
      this.dados.set(key, String(slot + passo));
      return String(slot);
    }

    // empurrar
    const alvo = Number(args[0]);
    if (alvo > atual) this.dados.set(key, String(alvo));
    return 1;
  }
}

const cfg = (over: Partial<AntiBanConfig> = {}): AntiBanConfig => ({
  intervaloSegundos: 60,
  jitterSegundos: 0,
  limiteDiario: 0,
  horarioEnvioInicio: '00:00',
  horarioEnvioFim: '23:59',
  ...over,
});

function criar(): DispatchSchedulerService {
  return new DispatchSchedulerService(new RedisFake() as unknown as Redis);
}

describe('DispatchSchedulerService', () => {
  it('espaça mensagens do mesmo condomínio pelo intervalo configurado', async () => {
    const scheduler = criar();
    const primeiro = await scheduler.reserve('tenant-a', cfg());
    const segundo = await scheduler.reserve('tenant-a', cfg());
    const terceiro = await scheduler.reserve('tenant-a', cfg());

    expect(primeiro).toBe(0);
    expect(segundo).toBeGreaterThanOrEqual(59_000);
    expect(terceiro).toBeGreaterThanOrEqual(119_000);
  });

  it('condomínios diferentes não disputam o mesmo slot', async () => {
    const scheduler = criar();
    await scheduler.reserve('tenant-a', cfg());
    const outro = await scheduler.reserve('tenant-b', cfg());

    // O slot é por condomínio: o segundo sai na hora, não atrás do primeiro.
    expect(outro).toBe(0);
  });

  it('respeita a cota diária empurrando o excedente para outro dia', async () => {
    const scheduler = criar();
    const limite = cfg({ limiteDiario: 2, intervaloSegundos: 0 });

    await scheduler.reserve('tenant-c', limite);
    await scheduler.reserve('tenant-c', limite);
    const excedente = await scheduler.reserve('tenant-c', limite);

    // Terceira mensagem com cota de 2: só pode sair no dia seguinte.
    expect(excedente).toBeGreaterThan(0);
  });

  it('cota sem limite (0) nunca adia', async () => {
    const scheduler = criar();
    const semLimite = cfg({ limiteDiario: 0, intervaloSegundos: 0 });

    for (let i = 0; i < 50; i++) {
      expect(await scheduler.reserve('tenant-d', semLimite)).toBe(0);
    }
  });

  it('fora da janela, agenda para a próxima abertura', async () => {
    const scheduler = criar();
    // Janela de 1 minuto que já passou hoje (ou ainda não chegou): de todo jeito
    // o agendamento não pode cair fora dela.
    const delay = await scheduler.reserve('tenant-e', cfg({ horarioEnvioInicio: '03:00', horarioEnvioFim: '03:01' }));
    const alvo = new Date(Date.now() + delay);
    const hora = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(alvo);

    expect(hora).toBe('03:00');
  });
});
