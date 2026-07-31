/**
 * Preparo da foto da etiqueta antes de subir para o OCR.
 *
 * Por que isto existe: a câmera nativa do celular entrega o JPEG do sensor
 * inteiro — tipicamente 4000x3000 e 3 a 6 MB. O serviço de OCR **descarta tudo
 * acima de `OCR_MAX_LADO` na primeira operação** (`ocr/app.py`), então esses
 * megabytes subiam pela rede da portaria só para serem jogados fora. No 4G ruim
 * de uma portaria isso é a diferença entre ~30s e ~4s de espera, sem perder um
 * pixel que o OCR fosse usar.
 *
 * O limite daqui espelha de propósito o do serviço. Se um dos dois mudar, mude
 * o outro — mandar acima do teto do servidor é desperdício de rede; mandar
 * abaixo é perder resolução que o reconhecedor usaria.
 */

/** Espelha `OCR_MAX_LADO` em `ocr/app.py`. */
export const MAX_LADO_OCR = 1800;

/**
 * 0.85 é o ponto de equilíbrio medido para texto de etiqueta térmica: abaixo de
 * ~0.75 o artefato de bloco do JPEG come o serifado das fontes pequenas e o OCR
 * começa a errar dígito; acima de 0.9 o arquivo dobra sem ganho de leitura.
 */
const QUALIDADE_JPEG = 0.85;

/** Abaixo disto a imagem já é pequena — reprocessar só perderia qualidade. */
const MIN_LADO_PARA_REDUZIR = 1200;

export interface FotoPreparada {
  arquivo: File;
  largura: number;
  altura: number;
  /**
   * Variância do laplaciano. Quanto maior, mais nítida. `null` quando não foi
   * possível medir. Use `pareceTremida()` em vez de comparar na mão.
   */
  nitidez: number | null;
  /** `false` quando o navegador não suportou o preparo e o original foi mantido. */
  reduzida: boolean;
}

/**
 * Abaixo deste valor a foto costuma estar tremida ou fora de foco a ponto de o
 * OCR não ter o que ler. É um piso conservador: serve para oferecer "tire
 * outra" antes de gastar upload + 1 a 3s de CPU, nunca para bloquear o envio.
 */
const LIMIAR_NITIDEZ = 60;

export function pareceTremida(foto: FotoPreparada): boolean {
  return foto.nitidez !== null && foto.nitidez < LIMIAR_NITIDEZ;
}

/**
 * Reduz para `MAX_LADO_OCR` e recomprime em JPEG, preservando a orientação.
 *
 * A orientação é o detalhe que mais dá errado aqui: desenhar num canvas
 * **destrói o EXIF**, e o serviço de OCR depende dele (`exif_transpose`) para
 * não receber metade das etiquetas deitadas. `imageOrientation: 'from-image'`
 * aplica a rotação nos pixels antes do desenho, que é o que torna a perda do
 * metadado inofensiva.
 *
 * Qualquer falha devolve o arquivo original: subir 4 MB é ruim, não subir é pior.
 */
export async function prepararFoto(file: File): Promise<FotoPreparada> {
  const original: FotoPreparada = {
    arquivo: file,
    largura: 0,
    altura: 0,
    nitidez: null,
    reduzida: false,
  };
  if (typeof createImageBitmap !== 'function') return original;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return original;
  }

  try {
    const maior = Math.max(bitmap.width, bitmap.height);
    // Imagem já pequena: recomprimir só somaria uma geração de perda de JPEG.
    if (maior <= MIN_LADO_PARA_REDUZIR) {
      return {
        ...original,
        largura: bitmap.width,
        altura: bitmap.height,
        nitidez: medirNitidez(bitmap, bitmap.width, bitmap.height),
      };
    }

    const escala = Math.min(1, MAX_LADO_OCR / maior);
    const largura = Math.max(1, Math.round(bitmap.width * escala));
    const altura = Math.max(1, Math.round(bitmap.height * escala));

    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');
    if (!ctx) return original;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, largura, altura);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', QUALIDADE_JPEG),
    );
    if (!blob) return original;

    const nome = file.name.replace(/\.[^.]+$/, '') || 'etiqueta';
    return {
      arquivo: new File([blob], `${nome}.jpg`, { type: 'image/jpeg' }),
      largura,
      altura,
      nitidez: medirNitidez(bitmap, bitmap.width, bitmap.height),
      reduzida: true,
    };
  } catch {
    return original;
  } finally {
    bitmap.close();
  }
}

/**
 * Variância do laplaciano sobre uma miniatura em tom de cinza.
 *
 * Roda sobre 240px de largura de propósito: custa menos de 5ms e o borrão que
 * importa (tremido, fora de foco) sobrevive à redução. Detalhe fino não — e é
 * justamente o que a gente NÃO quer medir, senão etiqueta de fonte pequena mas
 * nítida seria reprovada.
 */
function medirNitidez(
  fonte: CanvasImageSource,
  larguraFonte: number,
  alturaFonte: number,
): number | null {
  try {
    if (!larguraFonte || !alturaFonte) return null;
    const largura = 240;
    const altura = Math.max(1, Math.round((alturaFonte / larguraFonte) * largura));
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(fonte, 0, 0, largura, altura);
    const { data } = ctx.getImageData(0, 0, largura, altura);

    const cinza = new Float32Array(largura * altura);
    for (let i = 0; i < cinza.length; i++) {
      const p = i * 4;
      cinza[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    }

    let soma = 0;
    let somaQuadrados = 0;
    let n = 0;
    for (let y = 1; y < altura - 1; y++) {
      for (let x = 1; x < largura - 1; x++) {
        const i = y * largura + x;
        const lap =
          cinza[i - largura] + cinza[i + largura] + cinza[i - 1] + cinza[i + 1] - 4 * cinza[i];
        soma += lap;
        somaQuadrados += lap * lap;
        n++;
      }
    }
    if (n === 0) return null;
    const media = soma / n;
    return somaQuadrados / n - media * media;
  } catch {
    return null;
  }
}

/**
 * Congela um quadro do `<video>` da webcam como JPEG, já no tamanho do OCR.
 *
 * Usa a resolução real da stream (`videoWidth`/`videoHeight`), não a que o
 * elemento ocupa na tela — o vídeo aparece pequeno no modal e desenhar pelo
 * tamanho visual entregaria uma etiqueta ilegível ao OCR.
 */
export async function capturarQuadro(video: HTMLVideoElement): Promise<FotoPreparada | null> {
  const larguraFonte = video.videoWidth;
  const alturaFonte = video.videoHeight;
  if (!larguraFonte || !alturaFonte) return null;

  const escala = Math.min(1, MAX_LADO_OCR / Math.max(larguraFonte, alturaFonte));
  const largura = Math.max(1, Math.round(larguraFonte * escala));
  const altura = Math.max(1, Math.round(alturaFonte * escala));

  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(video, 0, 0, largura, altura);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALIDADE_JPEG),
  );
  if (!blob) return null;

  return {
    arquivo: new File([blob], 'etiqueta.jpg', { type: 'image/jpeg' }),
    largura,
    altura,
    // Medida no vídeo, não no JPEG já comprimido: evita uma segunda decodificação
    // e mede o que o sensor entregou, antes de qualquer artefato de compressão.
    nitidez: medirNitidez(video, larguraFonte, alturaFonte),
    reduzida: true,
  };
}
