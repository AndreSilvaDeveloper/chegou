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
import time

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image, ImageOps
from rapidocr_onnxruntime import RapidOCR

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("ocr")

# Foto de celular vem enorme e o OCR não ganha nada com isso — só fica lento.
# 2000px na maior aresta ainda resolve dígito pequeno de etiqueta térmica.
MAX_LADO = int(os.getenv("OCR_MAX_LADO", "2000"))
# Abaixo disso o texto é ruído: some da resposta para o parser não ter que filtrar.
# Vai TAMBÉM como `text_score` na chamada: o RapidOCR filtra por conta própria em
# 0.5, e sem passar isto qualquer valor menor aqui não teria efeito nenhum.
CONFIANCA_MINIMA = float(os.getenv("OCR_CONFIANCA_MINIMA", "0.35"))

app = FastAPI(title="Chegou OCR", version="2.0.0")

# Carregado uma vez no start. Os modelos vêm dentro da wheel — sem download.
_ocr = RapidOCR()


def _abrir(conteudo: bytes) -> np.ndarray:
    """Bytes -> BGR numpy, respeitando a orientação EXIF.

    O `exif_transpose` não é detalhe: celular grava a foto na orientação do
    sensor e a rotação vai só no metadado. Sem isso, metade das etiquetas chega
    deitada e o OCR devolve lixo.
    """
    try:
        img = Image.open(io.BytesIO(conteudo))
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
    except Exception as err:  # noqa: BLE001 — qualquer coisa aqui é "imagem inválida"
        raise HTTPException(status_code=400, detail=f"Imagem inválida: {err}") from err

    maior = max(img.size)
    if maior > MAX_LADO:
        escala = MAX_LADO / maior
        novo = (max(1, int(img.width * escala)), max(1, int(img.height * escala)))
        img = img.resize(novo, Image.LANCZOS)

    # RapidOCR roda sobre OpenCV, que assume BGR. Inverter o canal aqui evita
    # depender do que a lib faz por dentro com um array RGB.
    return np.array(img)[:, :, ::-1].copy()


def _normalizar_saida(bruto) -> list[dict]:
    """Achata o retorno do RapidOCR para `[{texto, confianca, box}]`.

    Formato de origem: `[[box_4_pontos, texto, confianca], ...]`, ou `None`
    quando não achou texto nenhum.

    O try/except por item é proposital: item fora do formato é descartado, não
    derruba a requisição — perder uma linha é melhor que perder a etiqueta.
    """
    linhas: list[dict] = []
    if not bruto:
        return linhas

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
            log.warning("Item do OCR em formato inesperado, ignorado: %r", item)

    # Ordem de leitura (cima -> baixo, esquerda -> direita). O parser depende
    # disso para heurísticas do tipo "a linha logo abaixo de DESTINATÁRIO".
    linhas.sort(key=lambda l: (l["box"][1], l["box"][0]))
    return linhas


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ocr")
async def ocr(file: UploadFile = File(...)):
    conteudo = await file.read()
    if not conteudo:
        raise HTTPException(status_code=400, detail="Arquivo vazio")

    inicio = time.monotonic()
    imagem = _abrir(conteudo)
    bruto, _elapse = _ocr(imagem, text_score=CONFIANCA_MINIMA)
    linhas = _normalizar_saida(bruto)
    ms = int((time.monotonic() - inicio) * 1000)

    log.info("OCR: %d linhas em %dms", len(linhas), ms)
    return {
        "linhas": linhas,
        "ms": ms,
        "largura": int(imagem.shape[1]),
        "altura": int(imagem.shape[0]),
    }
