# Changelog — Chegou 📦

Formato da versão: **MAIOR.RECURSO.CORREÇÃO** (ver "Versionamento" no `CLAUDE.md`).

- **MAIOR** — virada de versão do produto (quebra de compatibilidade, marco grande)
- **RECURSO** — funcionalidade grande nova (módulo, tela, integração)
- **CORREÇÃO** — bug corrigido, ajuste visual, refino

Quem mexe no sistema sobe a versão (`npm run versao correcao|recurso|maior`) e
escreve aqui o que mudou, no mesmo commit.

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
