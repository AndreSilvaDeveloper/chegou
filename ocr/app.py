"""
Serviço de OCR do Chegou — RapidOCR (modelos PP-OCR em ONNX) atrás de um HTTP simples.

Existe para a API (NestJS) não precisar de Python: ela manda a imagem da
etiqueta, recebe as linhas de texto com posição e confiança, e faz a
interpretação em TypeScript.

Deliberadamente burro: aqui NÃO se decide o que é bloco, apartamento ou
destinatário. Isso é do parser no backend, que muda toda semana conforme as
amostras chegam — e a gente não quer subir container a cada regex nova.

    POST /ocr   (multipart, campo `file`)  -> { linhas: [...], ms, largura, altura }
    GET  /health
"""

import io
import logging
import os
import threading
import time
from contextlib import asynccontextmanager

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image, ImageOps
from rapidocr_onnxruntime import RapidOCR

# HEIC é aceito pela API (`etiquetas.controller.ts`) e o Pillow puro não abre.
# Sem isto, foto de iPhone que não foi convertida pelo navegador chega aqui e
# morre como "Imagem inválida" — erro que não diz nada a quem tirou a foto.
try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
    _HEIC = True
except Exception:  # noqa: BLE001 — sem o pacote, seguimos sem HEIC
    _HEIC = False

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("ocr")

# Foto de celular vem enorme e o OCR não ganha nada com isso — só fica lento.
# O frontend já reduz para cá (ver `web/src/lib/imagem.ts`); este teto é a rede
# de segurança para quem sobe arquivo direto (banco de amostras do superadmin).
MAX_LADO = int(os.getenv("OCR_MAX_LADO", "1800"))
# Abaixo disso não há pixel suficiente para o reconhecedor: ampliar não inventa
# informação, mas tira o texto da faixa em que o modelo simplesmente desiste.
MIN_LADO = int(os.getenv("OCR_MIN_LADO", "1000"))
# Abaixo disso o texto é ruído: some da resposta para o parser não ter que filtrar.
# Vai TAMBÉM como `text_score` na chamada: o RapidOCR filtra por conta própria em
# 0.5, e sem passar isto qualquer valor menor aqui não teria efeito nenhum.
CONFIANCA_MINIMA = float(os.getenv("OCR_CONFIANCA_MINIMA", "0.35"))
# Quanto a caixa detectada é expandida antes do recorte. O default da lib (1.6)
# corta o último caractere em etiqueta térmica apertada — `AP 302` virava `AP 30`
# e o código de rastreio perdia a letra final.
UNCLIP_RATIO = float(os.getenv("OCR_UNCLIP_RATIO", "1.8"))
# Piso de confiança do DETECTOR (não do texto). Mais baixo pega térmica apagada,
# comum em Shopee e J&T, ao custo de alguma linha de ruído — que o parser filtra.
BOX_THRESH = float(os.getenv("OCR_BOX_THRESH", "0.4"))
# O ORT usa TODOS os núcleos do host por default. Numa VPS onde API, Postgres,
# Redis e MinIO dividem a máquina, cada leitura de etiqueta roubava CPU do banco.
THREADS = int(os.getenv("OCR_THREADS", "2"))
# Inferência é CPU-bound e serializada de propósito (ver `_LIMITE`).
CONCORRENCIA = int(os.getenv("OCR_CONCORRENCIA", "1"))
# `xy` agrupa por faixas e colunas; `simples` volta à ordem crua (cima->baixo).
ORDENACAO = os.getenv("OCR_ORDENACAO", "xy")

# Uma inferência por vez. Não é o mesmo que bloquear o processo: com o endpoint
# rodando em threadpool, o event loop continua livre para responder /health —
# que antes ficava mudo durante o lote de amostras e derrubava o healthcheck.
_LIMITE = threading.BoundedSemaphore(max(1, CONCORRENCIA))


def _criar_motor() -> RapidOCR:
    """Instancia o RapidOCR com os parâmetros ajustados, caindo no default se a
    versão da lib não aceitar algum kwarg.

    O pin é `>=1.4,<1.5` (ver requirements.txt), mas um kwarg recusado não pode
    deixar o serviço sem subir: melhor rodar com o default e gritar no log.
    """
    kwargs = {
        "intra_op_num_threads": THREADS,
        "inter_op_num_threads": 1,
    }
    try:
        return RapidOCR(**kwargs)
    except Exception as err:  # noqa: BLE001 — versão da lib mudou os kwargs
        log.error("RapidOCR recusou os parâmetros %r (%s). Subindo com o default.", kwargs, err)
        return RapidOCR()


_ocr = _criar_motor()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Aquece o motor antes de aceitar tráfego.

    A primeira inferência paga alocação de arena do ONNX Runtime e compilação de
    kernel por shape — 2 a 4x o tempo normal. Sem isto, quem paga é sempre a
    primeira etiqueta do dia do porteiro, logo depois de cada deploy.
    """
    try:
        inicio = time.monotonic()
        amostra = np.full((320, 640, 3), 255, dtype=np.uint8)
        amostra[140:180, 40:600] = 0  # uma barra escura basta para exercitar det+rec
        _rodar_ocr(amostra)
        log.info(
            "OCR pronto (warm-up %dms, threads=%d, heic=%s)",
            int((time.monotonic() - inicio) * 1000),
            THREADS,
            _HEIC,
        )
    except Exception:  # noqa: BLE001 — warm-up é cortesia, não pode impedir o boot
        log.exception("Warm-up do OCR falhou; seguindo assim mesmo")
    yield


app = FastAPI(title="Chegou OCR", version="3.0.0", lifespan=lifespan)


def _abrir(conteudo: bytes) -> np.ndarray:
    """Bytes -> BGR numpy, respeitando a orientação EXIF.

    O `exif_transpose` não é detalhe: celular grava a foto na orientação do
    sensor e a rotação vai só no metadado. Sem isso, metade das etiquetas chega
    deitada e o OCR devolve lixo.
    """
    try:
        img = Image.open(io.BytesIO(conteudo))
        # `draft` decodifica o JPEG já reduzido (escala DCT 1/2, 1/4, 1/8), o que
        # é quase de graça — em vez de materializar 12 MP para depois jogar fora.
        # Precisa vir ANTES de qualquer acesso a pixel: `exif_transpose` força o
        # load, então a ordem destas três linhas não é estética.
        try:
            img.draft("RGB", (MAX_LADO, MAX_LADO))
        except Exception:  # noqa: BLE001 — no-op para PNG/WebP/HEIC
            pass
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
    except HTTPException:
        raise
    except Exception as err:  # noqa: BLE001 — qualquer coisa aqui é "imagem inválida"
        raise HTTPException(status_code=400, detail=f"Imagem inválida: {err}") from err

    maior = max(img.size)
    if maior > MAX_LADO:
        escala = MAX_LADO / maior
        novo = (max(1, round(img.width * escala)), max(1, round(img.height * escala)))
        img = img.resize(novo, Image.LANCZOS)
    elif maior < MIN_LADO:
        escala = MIN_LADO / maior
        novo = (max(1, round(img.width * escala)), max(1, round(img.height * escala)))
        img = img.resize(novo, Image.LANCZOS)

    # RapidOCR roda sobre OpenCV, que assume BGR. Inverter o canal aqui evita
    # depender do que a lib faz por dentro com um array RGB.
    return np.array(img)[:, :, ::-1].copy()


def _rodar_ocr(imagem: np.ndarray):
    """Chama o motor com os três parâmetros de postprocess explícitos.

    No 1.4.x, passar QUALQUER kwarg faz o `__call__` reconstruir o postprocess do
    detector com os defaults do próprio método — ou seja, mandar só `text_score`
    silenciosamente fixava `box_thresh=0.5` e `unclip_ratio=1.6`, ignorando o
    config. Os três vão juntos de propósito.
    """
    return _ocr(
        imagem,
        text_score=CONFIANCA_MINIMA,
        box_thresh=BOX_THRESH,
        unclip_ratio=UNCLIP_RATIO,
    )


def _normalizar_saida(bruto) -> tuple[list[dict], int]:
    """Achata o retorno do RapidOCR para `[{texto, confianca, box}]`.

    Formato de origem: `[[box_4_pontos, texto, confianca], ...]`, ou `None`
    quando não achou texto nenhum.

    Devolve também quantos itens caíram fora do formato. Isso importa: o
    try/except por item é proposital (perder uma linha é melhor que perder a
    etiqueta), mas quando TODOS caem o serviço respondia 200 com zero linhas e o
    porteiro lia "tente com mais luz" — um deploy quebrado se passando por foto
    ruim, potencialmente por dias. Quem decide o que fazer com isso é `/ocr`.
    """
    linhas: list[dict] = []
    descartados = 0
    if not bruto:
        return linhas, descartados

    for item in bruto:
        try:
            caixa, texto, confianca = item[0], item[1], item[2]
            texto = (texto or "").strip()
            if not texto or float(confianca) < CONFIANCA_MINIMA:
                continue
            xs = [float(p[0]) for p in caixa]
            ys = [float(p[1]) for p in caixa]
            linhas.append(
                {
                    "texto": texto,
                    "confianca": round(float(confianca), 4),
                    # Retângulo em vez do polígono: o parser só usa para saber
                    # o que está em cima/embaixo e agrupar linhas do mesmo bloco.
                    "box": [
                        round(min(xs)),
                        round(min(ys)),
                        round(max(xs)),
                        round(max(ys)),
                    ],
                }
            )
        except Exception:  # noqa: BLE001 — item fora do formato esperado
            descartados += 1
            log.warning("Item do OCR em formato inesperado, ignorado: %r", item)

    return linhas, descartados


def _cortar(itens: list[dict], eixo: int, folga: float) -> list[list[dict]]:
    """Fatia o conjunto onde houver um vão maior que `folga` no eixo dado.

    `eixo` 1 = corta na vertical (faixas empilhadas); 0 = corta na horizontal
    (colunas lado a lado). O varredor guarda o maior fim visto até aqui, e não o
    fim do item anterior — senão um item alto e estreito abriria um vão falso.
    """
    inicio, fim = eixo, eixo + 2
    ordenados = sorted(itens, key=lambda l: l["box"][inicio])
    grupos: list[list[dict]] = [[ordenados[0]]]
    limite = ordenados[0]["box"][fim]
    for item in ordenados[1:]:
        if item["box"][inicio] - limite > folga:
            grupos.append([])
        grupos[-1].append(item)
        limite = max(limite, item["box"][fim])
    return grupos


def _xy_cut(itens: list[dict], altura_media: float, largura: int, profundidade: int) -> list[dict]:
    """Ordem de leitura por corte recursivo (XY-cut).

    Ordenar só por `(y, x)` intercala colunas: numa etiqueta com remetente à
    esquerda e destinatário à direita, 2px de diferença no topo bastam para as
    duas colunas se misturarem — e aí "o nome logo abaixo de DESTINATÁRIO" pega
    a linha do remetente. Cortando primeiro nas faixas horizontais e depois nas
    colunas, cada bloco sai inteiro, na ordem em que uma pessoa leria.
    """
    if len(itens) <= 1 or profundidade >= 4:
        return sorted(itens, key=lambda l: (l["box"][1], l["box"][0]))

    # Faixas empilhadas: vão vertical maior que ~0.8 linha separa blocos, mas não
    # separa as linhas de um mesmo endereço (que ficam bem mais juntas).
    faixas = _cortar(itens, 1, altura_media * 0.8)
    if len(faixas) > 1:
        return [l for f in faixas for l in _xy_cut(f, altura_media, largura, profundidade + 1)]

    # Colunas: exige um corredor limpo de 5% da largura da imagem. Endereço longo
    # atravessa a etiqueta inteira e impede o corte — que é o comportamento certo.
    colunas = _cortar(itens, 0, max(largura * 0.05, altura_media))
    if len(colunas) > 1:
        return [l for c in colunas for l in _xy_cut(c, altura_media, largura, profundidade + 1)]

    return sorted(itens, key=lambda l: (l["box"][1], l["box"][0]))


def _ordenar(linhas: list[dict], largura: int) -> list[dict]:
    if len(linhas) <= 1 or ORDENACAO != "xy":
        # Ordem de leitura (cima -> baixo, esquerda -> direita). O parser depende
        # disso para heurísticas do tipo "a linha logo abaixo de DESTINATÁRIO".
        return sorted(linhas, key=lambda l: (l["box"][1], l["box"][0]))
    alturas = sorted(l["box"][3] - l["box"][1] for l in linhas)
    altura_media = max(1.0, float(alturas[len(alturas) // 2]))
    return _xy_cut(linhas, altura_media, largura, 0)


@app.get("/health")
def health():
    return {"status": "ok", "heic": _HEIC}


@app.post("/ocr")
def ocr(file: UploadFile = File(...)):
    """Endpoint SÍNCRONO de propósito.

    Como `async def`, a inferência (0,5 a 2s de CPU) rodava dentro do event loop
    e o processo inteiro parava — inclusive o /health, que com `timeout: 5s` no
    compose marcava o container como unhealthy no meio de um lote de amostras.
    Sendo `def`, o FastAPI joga isto num threadpool e o loop segue respondendo;
    quem serializa a inferência é o `_LIMITE`.
    """
    conteudo = file.file.read()
    if not conteudo:
        raise HTTPException(status_code=400, detail="Arquivo vazio")

    inicio = time.monotonic()
    imagem = _abrir(conteudo)
    ms_decode = int((time.monotonic() - inicio) * 1000)

    espera = time.monotonic()
    with _LIMITE:
        ms_fila = int((time.monotonic() - espera) * 1000)
        bruto, elapse = _rodar_ocr(imagem)

    linhas, descartados = _normalizar_saida(bruto)

    # Motor devolveu texto e nada sobreviveu à normalização: o formato do item
    # mudou (troca de versão da lib). Isso é falha do serviço, não foto ruim —
    # responder 200 com lista vazia esconderia o problema atrás de uma mensagem
    # de "tente com mais luz".
    if bruto and descartados and not linhas:
        log.error("Saída do OCR em formato inesperado: %d itens, nenhum aproveitado", descartados)
        raise HTTPException(status_code=500, detail="Saída do OCR em formato inesperado")

    linhas = _ordenar(linhas, int(imagem.shape[1]))
    ms = int((time.monotonic() - inicio) * 1000)

    log.info("OCR: %d linhas em %dms (decode %dms, fila %dms)", len(linhas), ms, ms_decode, ms_fila)
    return {
        "linhas": linhas,
        "ms": ms,
        "msDecode": ms_decode,
        "msFila": ms_fila,
        # [det, cls, rec] do próprio RapidOCR — é o que permite dizer onde o
        # tempo foi, em vez de discutir de memória ao mexer nos parâmetros.
        "msEtapas": [round(float(e), 1) for e in elapse] if elapse else None,
        "largura": int(imagem.shape[1]),
        "altura": int(imagem.shape[0]),
    }
