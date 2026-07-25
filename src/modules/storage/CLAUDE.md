# Módulo: Storage

Upload de arquivos para S3 / MinIO / Cloudflare R2: foto da encomenda e contrato
de locação de vaga.

## Rotas e perfis

| Rota | admin | sindico | porteiro |
|---|:---:|:---:|:---:|
| `POST /uploads/encomenda-foto` | ✅ | ✅ | ✅ |

O porteiro precisa fotografar o volume na portaria. O upload de contrato de vaga
não fica aqui: é `POST /vagas-locacao/:id/contrato` (módulo Vagas), que usa este
service por dentro.

## Como funciona

Chave do objeto: `<prefixo>/<tenantId>/<uuid>.<ext>`

- o `tenantId` na chave separa os arquivos por condomínio;
- o UUID aleatório impede que alguém adivinhe a URL de outro condomínio;
- a extensão é sanitizada a partir do nome original.

Prefixos: `encomendas/` e `contratos-vagas/`.

## Regras de negócio

1. **Tipo e tamanho são validados no controller** que recebe o arquivo — fotos
   até 8 MB (JPEG, PNG, WEBP, HEIC); contratos até 10 MB (os mesmos + PDF).
2. **Substituir remove o anterior** (ex.: contrato reenviado) para não deixar
   lixo pago no bucket.
3. **Remoção do storage nunca derruba a operação**: falha vira log de aviso, o
   registro no banco já foi atualizado.
4. **Sem storage configurado o módulo não quebra a aplicação** — `isConfigured`
   permite rodar o ambiente local sem MinIO.

## Ao alterar este módulo

- [ ] Tipo novo de arquivo → mantenha `tenantId` na chave e a lista de MIME no
      controller que recebe.
- [ ] Nunca gere chave previsível (sem UUID): as URLs são públicas.
