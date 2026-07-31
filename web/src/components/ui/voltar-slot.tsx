import * as React from 'react';

/**
 * Onde o botão da esquerda da barra do topo aponta.
 *
 * Numa tela de listagem ele abre o menu; numa tela de DETALHE ou FORMULÁRIO ele
 * volta. Como a barra do topo mora no `Layout` e a decisão é da página, é este
 * o único pedaço da faixa que precisa atravessar a fronteira entre os dois.
 *
 * É um contexto com **um valor primitivo** (a rota de volta, ou `null`). Foi o
 * suficiente para não precisar mover a barra inteira para a página nem duplicar
 * o botão. Título, busca e ações continuam sendo desenhados pela própria página
 * (ver `PageShell`) — mover aquilo para cá é que traria efeito por tela e
 * título piscando na troca de rota.
 */
type Contexto = {
  voltar: string | null;
  definirVoltar: (rota: string | null) => void;
};

const VoltarContext = React.createContext<Contexto>({
  voltar: null,
  definirVoltar: () => {},
});

export function VoltarProvider({ children }: { children: React.ReactNode }) {
  const [voltar, definirVoltar] = React.useState<string | null>(null);
  const valor = React.useMemo(() => ({ voltar, definirVoltar }), [voltar]);
  return <VoltarContext.Provider value={valor}>{children}</VoltarContext.Provider>;
}

/** Lido pelo `Layout` para decidir entre o ícone de menu e o de voltar. */
export function useVoltar() {
  return React.useContext(VoltarContext).voltar;
}

/**
 * Registra a rota de volta enquanto a tela estiver montada.
 *
 * A limpeza devolve `null`: sem ela, sair de um detalhe para uma listagem
 * deixaria a seta de voltar no lugar do menu.
 */
export function VoltarSlot({ rota }: { rota: string | null }) {
  const { definirVoltar } = React.useContext(VoltarContext);

  React.useEffect(() => {
    definirVoltar(rota);
    return () => definirVoltar(null);
  }, [rota, definirVoltar]);

  return null;
}
