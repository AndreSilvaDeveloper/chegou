# Changelog — Chegou 📦

Formato da versão: **MAIOR.RECURSO.CORREÇÃO** (ver "Versionamento" no `CLAUDE.md`).

- **MAIOR** — virada de versão do produto (quebra de compatibilidade, marco grande)
- **RECURSO** — funcionalidade grande nova (módulo, tela, integração)
- **CORREÇÃO** — bug corrigido, ajuste visual, refino

Quem mexe no sistema sobe a versão (`npm run versao correcao|recurso|maior`) e
escreve aqui o que mudou, no mesmo commit.

---

## 0.11.0 — 2026-07-27

Rodada de escala no disparo de notificações. O gargalo era estrutural: um único
worker sequencial para a plataforma inteira, com teto de ~40 mensagens/minuto
somadas todas as instâncias de WhatsApp.

### Alterado
- **Envio paralelo entre condomínios, serial dentro de cada um.** O worker passa
  a processar `NOTIFICATION_CONCURRENCY` jobs (padrão 15) com uma trava no Redis
  por condomínio. Antes era `concurrency: 1` global — um gateway lento em um
  condomínio segurava a fila de todos.
- **Timeout de 15s nas chamadas ao gateway** (`OPENWA_TIMEOUT_MS`). Sem ele o
  Node esperava até 5 minutos e o worker ficava preso nesse tempo.
- **Cache de JID do destinatário (30 dias) e do status da sessão (30s)**: o
  envio caiu de 3–4 chamadas HTTP ao gateway para 1. O `UPDATE tenants` por
  mensagem só acontece quando o status muda.
- **Disparo em massa em lote** (`agendarEmLote`): um aviso para o prédio inteiro
  virou um `INSERT` e um `addBulk`, em vez de centenas de idas ao banco dentro
  do request do síndico. Cobrança de condomínio também deixou de fazer uma
  consulta de moradores por apartamento.
- Uma conexão Redis compartilhada (`common/redis`) no lugar de uma por serviço.

### Corrigido
- **Reserva de horário de envio agora é atômica** (script Lua). Duas encomendas
  registradas no mesmo segundo — ou duas réplicas da API — recebiam o mesmo
  horário e saíam juntas pelo mesmo número, que é exatamente o padrão de rajada
  que faz o WhatsApp bloquear.
- **Limite diário conta o dia em que a mensagem sai**, não o dia em que foi
  criada. Com fila acumulada, o adiado para amanhã contava hoje e não contava
  amanhã, deixando o número furar o próprio limite.
- **Aviso respeita o opt-out do morador** (`receber_whatsapp`). A regra estava
  na documentação do módulo mas não no código: a consulta só filtrava `ativo`.

### Adicionado
- `WORKER_ENABLED=false` desliga o consumo da fila numa instância, para escalar a
  API na horizontal sem multiplicar os workers de envio.
- Índices `(tenant_id, created_at)` e `(tenant_id, enviada_at)` em `notificacoes`
  (migration 023).
- Log do tempo de cada envio, para medir o teto real em vez de estimá-lo.

---

## 0.10.0 — 2026-07-27

### Adicionado
- **Mensagem de retirada personalizável**: em `/whatsapp`, o síndico (e a
  administradora) agora edita dois modelos — o de chegada da encomenda e o novo
  de confirmação de retirada — com variáveis, prévia e restauração do padrão.
- Os mesmos dois modelos ficam editáveis em `/admin/whatsapp` (superadmin).
- **Regras de envio editáveis pelo síndico** (card novo em `/whatsapp`): espera
  entre mensagens (mínimo 60s, só para cima), janela de envio (dentro de
  08:00–21:00) e limite diário (20 a 300). Os limites vêm do backend e a tela
  mostra quantas mensagens cabem por dia no ritmo escolhido. Acima dessas
  faixas, só o superadmin em `/admin/whatsapp`.

### Corrigido
- **A sidebar era desmontada e remontada a cada troca de rota** — piscava e
  perdia a rolagem do menu, quando só o conteúdo principal deveria mudar. Causa:
  `SidebarBody` era declarado dentro do `Layout`, virando uma função nova a cada
  render; o React trata isso como outro componente e refaz o DOM inteiro. Mesmo
  problema corrigido no `TabButton` de `DetalheEncomenda`.

### Alterado
- Os campos de mensagem **abrem preenchidos com o texto que o morador recebe
  hoje** (o do condomínio, ou o padrão do sistema). Antes abriam em branco, e
  mudar uma palavra exigia reescrever a mensagem inteira. Campo vazio continua
  significando "usar o padrão".
- O texto de retirada saiu de `whatsapp/templates.ts` (fixo) para
  `notificacoes/message-template.ts` (personalizável). As variáveis `{{data}}` e
  `{{hora}}` dele são as da retirada, não as do recebimento.

---

## 0.9.0 — 2026-07-27

### Adicionado
- **Controle de versão do app**: a versão aparece na sidebar, junto do condomínio.
- **Atualização automática (web e PWA)**: o app procura build novo a cada minuto,
  ao voltar ao primeiro plano e ao reconectar. Quando encontra, recarrega sozinho
  em momento seguro — na troca de tela ou com o app ocioso — nunca no meio de um
  cadastro. Enquanto espera, oferece "Atualizar agora".
- `GET /api/health` agora informa a versão da API.
- `npm run versao` sobe o número nos dois `package.json` de uma vez.

### Corrigido
- Diálogos de cadastro (vaga, equipe, morador, apartamento e todos os demais)
  eram cortados em cima e embaixo no celular. Agora têm margem de 1rem em volta,
  altura em `dvh` e rolagem interna.

---

## Histórico anterior (reconstruído dos commits)

O versionamento passou a existir na 0.9.0. As versões abaixo são uma leitura do
histórico do Git, agrupando os 30 commits por marco — servem de linha do tempo,
não existiram como release.

| Versão | Data | Marco | Commits |
|---|---|---|---|
| 0.1.0 | 2026-05-12 | Base do sistema: backend NestJS + frontend React + deploy | `3a9af65` |
| 0.1.1 | 2026-05-12 | Ajustes de deploy (Render, migrations no start, build TS) | `09bcd01`…`ece30b7` |
| 0.2.0 | 2026-05-12 | Gestão de usuários (síndico cria porteiro, superadmin gerencia condomínios) | `0a84f91`, `19b0983` |
| 0.3.0 | 2026-05-12 | Leitor de QR/código de barras na portaria + cadastro de apartamento no lançamento | `d135e1b`, `b6d751a` |
| 0.3.1 | 2026-05-12 | Correções do scanner (overflow no celular, tela branca ao parar a câmera) | `89f4846`, `392bb56` |
| 0.4.0 | 2026-07-22/23 | Rodada de melhorias: logins, ajustes visuais e deploy local de desenvolvimento | `e9e9033`…`212dbd6` |
| 0.5.0 | 2026-07-24 | Notificação por WhatsApp via OpenWA (sessão por condomínio, Docker Compose) | `bac3b04`…`5dab0f6` |
| 0.6.0 | 2026-07-24 | Dashboard | `88a3616`, `c195f7f` |
| 0.7.0 | 2026-07-24/25 | Atualização das libs (NestJS 11, React 19, Vite 7, Tailwind 4) e relatórios | `1e045e3`, `4c37370` |
| 0.8.0 | 2026-07-25 | Módulo de Vagas, padronização do projeto e melhorias de qualidade de vida | `533b5ad`, `0a5e87a` |
