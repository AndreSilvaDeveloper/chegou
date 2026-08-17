// Aqui ficam os textos de RESPOSTA ao morador — réplica a uma mensagem que ele
// acabou de mandar, fora da fila. Os textos de chegada e retirada que saem pela
// FILA vivem em `notificacoes/message-template.ts`, onde são cinco versões
// sorteadas por envio (regra anti-bloqueio). Duplicá-los aqui faria os dois
// caminhos divergirem — e a variação da fila perderia o sentido.
export type TemplateKey = 'encomenda_chegou' | 'lembrete_codigo' | 'sem_encomenda_pendente';

interface EncomendaChegouVars {
  nome: string;
  apartamento: string;
  codigo: string;
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
