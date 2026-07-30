# Serviço de OCR (RapidOCR / ONNX Runtime) — CPU. Ver ocr/README.md.
FROM python:3.11-slim

# libgl/libglib: dependências nativas do OpenCV, que vem junto do RapidOCR.
# Sem elas o import estoura com "libGL.so.1: cannot open shared object file".
RUN apt-get update && apt-get install -y --no-install-recommends \
      libgl1 \
      libglib2.0-0 \
      curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

# Instancia o motor no build. Os modelos já vêm dentro da wheel do RapidOCR —
# isto não baixa nada, só falha o build agora (e não em produção, na primeira
# etiqueta do dia) se a wheel não rodar nesta máquina.
RUN python -c "from rapidocr_onnxruntime import RapidOCR; RapidOCR()"

EXPOSE 8000

# Sem isto o ONNX Runtime abre uma thread por núcleo VISÍVEL do host. Na VPS de
# produção, onde API, Postgres, Redis e MinIO dividem a máquina, cada leitura de
# etiqueta roubava CPU do banco. Dois núcleos mantêm a latência do OCR e
# devolvem previsibilidade ao resto da stack.
ENV OMP_NUM_THREADS=2 \
    OCR_THREADS=2

# Um worker só: cada um carrega a sua cópia do modelo na memória.
# Para mais paralelismo, suba mais containers em vez de mais workers.
# `--limit-concurrency`: com a inferência serializada, uma rajada enfileiraria
# até estourar o timeout de todo mundo junto. Recusar rápido é melhor.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--limit-concurrency", "24"]
