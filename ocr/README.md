# Serviço de OCR

RapidOCR (modelos **PP-OCRv4** rodando em ONNX Runtime) atrás de um HTTP mínimo.
Lê a imagem de uma etiqueta de entrega e devolve as **linhas de texto** com
posição e confiança. Só isso.

```
POST /ocr   multipart, campo `file`
  -> { linhas: [{ texto, confianca, box: [x1,y1,x2,y2] }], ms, largura, altura }
GET  /health
```

## Por que não PaddleOCR

Foi a primeira escolha e **não funcionou**: a wheel do PaddlePaddle aborta com
`double free or corruption` / `Aborted (core dumped)` na inicialização, em parte
dos servidores — runtime nativo brigando com a glibc/CPU do host. Além disso
pesava ~2 GB e exigia baixar os modelos durante o build.

O RapidOCR usa **os mesmos modelos** (PP-OCRv4 det + rec + cls), convertidos para
ONNX, e roda em `onnxruntime`. Os 16 MB de modelo vêm **dentro da wheel**: build
rápido, sem download, e sem depender de internet no servidor.

## Por que ele não interpreta nada

A tradução de `"BL B AP 302"` para `{bloco: "B", numero: "302"}` mora no backend
(`src/modules/etiquetas/parser/`), não aqui. Motivo prático: o parser muda toda
vez que uma amostra nova mostra um layout diferente, e trocar uma regex não pode
significar rebuildar a imagem do serviço.

## Custo de infra

| | |
|---|---|
| RAM | ~300–500 MB com o modelo carregado |
| CPU | ~0,5–2s por etiqueta, single-thread |
| Disco | ~400 MB de imagem |
| Rede | **nenhuma** em runtime nem no build (modelos embutidos) |

Um worker por container de propósito: cada worker carrega a sua cópia do modelo.
Precisa de mais vazão? Suba réplicas, não workers.

## Rodar sozinho

```bash
docker compose up ocr
curl -F file=@etiqueta.jpg http://localhost:8000/ocr
```

Em dev a porta é publicada (`OCR_PORT`, padrão 8000) porque é comum rodar a API
fora do Docker. **Em produção o serviço não publica porta** — ele não tem
autenticação nenhuma, e só a API precisa alcançá-lo pela rede interna.

## Variáveis

| Variável | Padrão | Para quê |
|---|---|---|
| `OCR_MAX_LADO` | `2000` | Reduz a foto antes de ler. Maior = mais lento, sem ganho real |
| `OCR_CONFIANCA_MINIMA` | `0.35` | Descarta linha com score menor. Vai também como `text_score` na chamada — sem isso o próprio RapidOCR já cortaria em 0.5 e o valor daqui não teria efeito |

## Armadilhas

1. **Orientação EXIF**: o serviço aplica `exif_transpose` antes de ler. Celular
   grava a foto na orientação do sensor e a rotação vai só no metadado — sem
   isso metade das etiquetas chega deitada e o OCR devolve lixo.
2. **Python 3.11 no Dockerfile não é descuido**: `rapidocr-onnxruntime` exige
   `< 3.13`. Subir a imagem base para 3.13 quebra a instalação.
3. **A versão está travada em 1.4.x.** A linha seguinte do projeto mudou de nome
   de pacote (`rapidocr`) **e** de API; um rebuild não pode arrastar isso por
   engano — `_normalizar_saida` depende do formato `[box, texto, score]`.
4. **O modelo é o chinês+inglês** (`ch_PP-OCRv4`), que cobre bem dígito e ASCII —
   que é o que decide bloco, apartamento e rastreio. Acento em nome de morador
   pode sair errado, e isso é aceitável: o parser normaliza acento fora
   (`semAcento`) antes de comparar. Se nome virar problema, o caminho é trocar o
   modelo de reconhecimento pelo latino, não mudar o parser.
