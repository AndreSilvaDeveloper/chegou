# Serviço de OCR (PaddleOCR) — CPU. Ver ocr/README.md.
FROM python:3.11-slim

# libgl/libglib: dependências nativas do OpenCV, que vem junto do PaddleOCR.
# Sem elas o import estoura com "libGL.so.1: cannot open shared object file".
RUN apt-get update && apt-get install -y --no-install-recommends \
      libgl1 \
      libglib2.0-0 \
      libgomp1 \
      curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

# Baixa os modelos NO BUILD. Sem isso, a primeira etiqueta do dia esperaria o
# download (~50 MB) e daria timeout na API — e um servidor sem saída para a
# internet nunca funcionaria.
RUN python -c "from paddleocr import PaddleOCR; PaddleOCR(use_angle_cls=True, lang='pt', show_log=False)"

EXPOSE 8000

# Um worker só: o modelo ocupa ~1 GB de RAM e cada réplica carrega o seu.
# Para mais paralelismo, suba mais containers em vez de mais workers.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
