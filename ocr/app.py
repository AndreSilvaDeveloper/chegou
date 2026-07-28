"""
Serviço de OCR do Chegou — PaddleOCR atrás de um HTTP simples.

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
from paddleocr import PaddleOCR

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("ocr")

# Foto de celular vem enorme e o OCR não ganha nada com isso — só fica lento.
# 2000px na maior aresta ainda resolve dígito pequeno de etiqueta térmica.
MAX_LADO = int(os.getenv("OCR_MAX_LADO", "2000"))
# Abaixo disso o texto é ruído: some da resposta para o parser não ter que filtrar.
CONFIANCA_MINIMA = float(os.getenv("OCR_CONFIANCA_MINIMA", "0.35"))

app = FastAPI(title="Chegou OCR", version="1.0.0")

# Carregado uma vez no start (o construtor baixa/abre os modelos — caro).
# `use_angle_cls` porque etiqueta fotografada de lado é a regra, não a exceção.
_ocr = PaddleOCR(use_angle_cls=True, lang="pt", show_log=False)


def _abrir(conteudo: bytes) -> np.ndarray:
    """Bytes -> RGB numpy, respeitando a orientação EXIF.

    O `exif_transpose` não é detalhe: celular grava a foto no sensor e a
    rotação vai só no metadado. Sem isso, metade das etiquetas chega deitada e
    o OCR devolve lixo.
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

    return np.array(img)


def _normalizar_saida(bruto) -> list[dict]:
    """Achata o retorno do PaddleOCR para `[{texto, confianca, box}]`.

    O formato varia entre versões da lib; por isso o try/except por item em vez
    de confiar na forma. Item que não encaixa é descartado, não derruba a
    requisição — perder uma linha é melhor que perder a etiqueta inteira.
    """
    linhas: list[dict] = []
    if not bruto:
        return linhas

    # 2.x devolve uma lista por imagem; mandamos uma imagem só.
    paginas = bruto[0] if len(bruto) == 1 and isinstance(bruto[0], list) else bruto
    if not paginas:
        return linhas

    for item in paginas:
        try:
            caixa, (texto, confianca) = item[0], item[1]
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
    bruto = _ocr.ocr(imagem, cls=True)
    linhas = _normalizar_saida(bruto)
    ms = int((time.monotonic() - inicio) * 1000)

    log.info("OCR: %d linhas em %dms", len(linhas), ms)
    return {
        "linhas": linhas,
        "ms": ms,
        "largura": int(imagem.shape[1]),
        "altura": int(imagem.shape[0]),
    }
