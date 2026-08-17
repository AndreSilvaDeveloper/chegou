import { coordenadaDaBrasilApi } from './cep.service';

const SEM_COORDENADA = { latitude: null, longitude: null };

describe('coordenadaDaBrasilApi', () => {
  it('lê a coordenada da resposta real da v2', () => {
    // O corpo do CEP 89010025, como a BrasilAPI devolve.
    expect(
      coordenadaDaBrasilApi({
        location: {
          coordinates: { longitude: '-49.0629788', latitude: '-26.9244749' },
        },
      } as never),
    ).toEqual({ latitude: -26.9244749, longitude: -49.0629788 });
  });

  /**
   * O caso que motiva a função existir.
   *
   * A v2 responde `location: { type: 'Point', coordinates: {} }` para uma
   * parcela grande dos CEPs — o objeto existe, as chaves não. Confiar em
   * `location` estar presente gravaria `NaN` no lugar da coordenada.
   */
  it('trata o objeto `coordinates` vazio como "não tem"', () => {
    expect(coordenadaDaBrasilApi({ location: { coordinates: {} } })).toEqual(SEM_COORDENADA);
    expect(coordenadaDaBrasilApi({ location: {} })).toEqual(SEM_COORDENADA);
    expect(coordenadaDaBrasilApi({})).toEqual(SEM_COORDENADA);
  });

  it('recusa string que não vira número', () => {
    expect(
      coordenadaDaBrasilApi({ location: { coordinates: { latitude: '', longitude: '' } } }),
    ).toEqual(SEM_COORDENADA);
    expect(
      coordenadaDaBrasilApi({ location: { coordinates: { latitude: 'x', longitude: 'y' } } }),
    ).toEqual(SEM_COORDENADA);
  });

  it('recusa par fora da faixa geográfica', () => {
    // Latitude e longitude trocadas por engano do provedor: 100 não é latitude.
    expect(
      coordenadaDaBrasilApi({ location: { coordinates: { latitude: '100', longitude: '-49' } } }),
    ).toEqual(SEM_COORDENADA);
    expect(
      coordenadaDaBrasilApi({ location: { coordinates: { latitude: '-26', longitude: '200' } } }),
    ).toEqual(SEM_COORDENADA);
  });

  /**
   * (0,0) é o Golfo da Guiné. Nenhum condomínio brasileiro está lá, e alguns
   * provedores usam esse par como "não sei" — no mapa vira um alfinete no meio
   * do Atlântico que parece dado válido.
   */
  it('recusa (0,0)', () => {
    expect(
      coordenadaDaBrasilApi({ location: { coordinates: { latitude: '0', longitude: '0' } } }),
    ).toEqual(SEM_COORDENADA);
  });

  it('aceita coordenada válida com zero em um dos eixos', () => {
    // Latitude 0 sozinha é legítima: o equador corta o Amapá e Roraima.
    expect(
      coordenadaDaBrasilApi({ location: { coordinates: { latitude: '0', longitude: '-51.05' } } }),
    ).toEqual({ latitude: 0, longitude: -51.05 });
  });
});
