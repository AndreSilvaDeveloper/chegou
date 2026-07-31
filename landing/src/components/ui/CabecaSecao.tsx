import type { ReactElement } from 'react';
import { Revelar } from './Revelar';
import { TituloFlutuante } from './TituloFlutuante';

interface Props {
  eyebrow: string;
  titulo: string;
  apoio?: string;
  /**
   * Faz o título subir letra a letra conforme a seção entra na tela.
   * Reservado a UMA seção: é acento, e acento repetido vira maneirismo.
   */
  flutuante?: boolean;
}

/** Eyebrow + título + texto de apoio — a abertura padrão de toda seção. */
export function CabecaSecao({ eyebrow, titulo, apoio, flutuante = false }: Props): ReactElement {
  return (
    <div className="cabeca">
      <Revelar>
        <p className="eyebrow">{eyebrow}</p>
      </Revelar>

      {flutuante ? (
        <TituloFlutuante>{titulo}</TituloFlutuante>
      ) : (
        <Revelar>
          <h2 className="t-titulo">{titulo}</h2>
        </Revelar>
      )}

      {apoio && (
        <Revelar>
          <p className="t-apoio">{apoio}</p>
        </Revelar>
      )}
    </div>
  );
}
