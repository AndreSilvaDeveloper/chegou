export type TemplateKey = 'encomenda_chegou' | 'retirada_confirmada' | 'lembrete_codigo' | 'sem_encomenda_pendente';

interface EncomendaChegouVars {
  nome: string;
  apartamento: string;
  codigo: string;
  condominio: string;
}

interface RetiradaConfirmadaVars {
  nome: string;
  apartamento: string;
  condominio: string;
}

interface LembreteCodigoVars {
  nome: string;
  apartamento: string;
  codigo: string;
}

interface SemEncomendaVars {
  nome: string;
}

export type TemplateVariables = {
  encomenda_chegou: EncomendaChegouVars;
  retirada_confirmada: RetiradaConfirmadaVars;
  lembrete_codigo: LembreteCodigoVars;
  sem_encomenda_pendente: SemEncomendaVars;
};

export function renderTemplate<K extends TemplateKey>(key: K, vars: TemplateVariables[K]): string {
  switch (key) {
    case 'encomenda_chegou': {
      const v = vars as EncomendaChegouVars;
      return [
        `Olá, ${v.nome}!`,
        ``,
        `Chegou uma encomenda para o ${v.apartamento} na portaria do *${v.condominio}*.`,
        ``,
        `Seu código de retirada é *${v.codigo}*.`,
        `Apresente este código ao porteiro para retirar.`,
      ].join('\n');
    }
    case 'retirada_confirmada': {
      const v = vars as RetiradaConfirmadaVars;
      return [
        `Olá, ${v.nome}!`,
        ``,
        `Confirmamos a retirada da sua encomenda do ${v.apartamento} no *${v.condominio}*.`,
        `Obrigado!`,
      ].join('\n');
    }
    case 'lembrete_codigo': {
      const v = vars as LembreteCodigoVars;
      return [
        `Oi, ${v.nome}! 👋`,
        ``,
        `Você tem uma encomenda pendente no ${v.apartamento}.`,
        `Código de retirada: *${v.codigo}*`,
        ``,
        `É só apresentar esse código ao porteiro.`,
      ].join('\n');
    }
    case 'sem_encomenda_pendente': {
      const v = vars as SemEncomendaVars;
      return [
        `Oi, ${v.nome}!`,
        ``,
        `Você não tem encomendas pendentes no momento. 📦`,
        `Quando algo chegar pra você, eu te aviso por aqui.`,
      ].join('\n');
    }
    default:
      throw new Error(`Template não conhecido: ${key}`);
  }
}

export function templateToVariables<K extends TemplateKey>(
  vars: TemplateVariables[K],
): Record<string, string> {
  const result: Record<string, string> = {};
  Object.entries(vars).forEach(([k, v], i) => {
    result[String(i + 1)] = String(v);
    result[k] = String(v);
  });
  return result;
}
