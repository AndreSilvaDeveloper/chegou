# Serviço de OCR

PaddleOCR atrás de um HTTP mínimo. Lê a imagem de uma etiqueta de entrega e
devolve as **linhas de texto** com posição e confiança. Só isso.

```
POST /ocr   multipart, campo `file`
  -> { linhas: [{ texto, confianca, box: [x1,y1,x2,y2] }], ms, largura, altura }
GET  /health
```

## Por que ele não interpreta nada

A tradução de `"BL B AP 302"` para `{bloco: "B", numero: "302"}` mora no backend
(`src/modules/etiquetas/parser/`), não aqui. Motivo prático: o parser muda toda
vez que uma amostra nova mostra um layout diferente, e trocar uma regex não pode
significar rebuildar uma imagem Python de 2 GB.

## Custo de infra

| | |
|---|---|
| RAM | ~1 GB só para o modelo carregado, 1,5 GB em pico |
| CPU | 1–3s por etiqueta, single-thread |
| Disco | ~2 GB de imagem (PaddlePaddle é gordo) |
| Rede | **nenhuma** em runtime — os modelos são baixados no build |

Um worker por container de propósito: cada worker carrega o modelo inteiro na
memória. Precisa de mais vazão? Suba réplicas, não workers.

## Rodar sozinho

```bash
docker compose up ocr
curl -F file=@etiqueta.jpg http://localhost:8000/ocr
```

O primeiro `build` demora vários minutos (compila dependência nativa e baixa os
modelos). Depois é cache.

## Variáveis

| Variável | Padrão | Para quê |
|---|---|---|
| `OCR_MAX_LADO` | `2000` | Reduz a foto antes de ler. Maior = mais lento, sem ganho real |
| `OCR_CONFIANCA_MINIMA` | `0.35` | Abaixo disso a linha é descartada como ruído |

## Armadilhas

1. **Orientação EXIF**: o serviço aplica `exif_transpose` antes de ler. Celular
   grava a foto na orientação do sensor e a rotação vai só no metadado — sem
   isso metade das etiquetas chega deitada e o OCR devolve lixo.
2. **`paddlepaddle`/`paddleocr` estão travados** no `requirements.txt`. A 3.x
   trocou `.ocr()` por `.predict()` com outro retorno; subir sem ajustar o
   `_normalizar_saida` quebra tudo silenciosamente (devolve zero linhas).
3. **O serviço não fica exposto** — só a rede interna do compose fala com ele.
   Não há autenticação, e é justamente por isso que ele não pode ganhar porta
   pública.
