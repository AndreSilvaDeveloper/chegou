-- Histórico de locação de vaga: preservar quem alugou e o que foi pago.
--
-- Dois furos que esta migration fecha:
--
-- 1. As FKs eram ON DELETE CASCADE, então apagar uma vaga levava junto todos os
--    contratos e todas as cobranças dela — o histórico financeiro inteiro, sem
--    aviso. Agora é RESTRICT: apagar vaga com contrato é erro. A via correta
--    continua sendo desativar (`ativo = false`).
--    O CASCADE por `tenant_id` continua: excluir o condomínio limpa tudo dele.
--
-- 2. O nome do locatário só ficava gravado quando era pessoa externa. Sendo
--    morador, vinha da relação — e `morador_id` é ON DELETE SET NULL, então um
--    morador removido deixava o contrato antigo sem dono identificável.

-- --------------------------------------------------- 1. FKs que protegem
ALTER TABLE vagas_locacao
  DROP CONSTRAINT vagas_locacao_vaga_id_fkey;

ALTER TABLE vagas_locacao
  ADD CONSTRAINT vagas_locacao_vaga_id_fkey
  FOREIGN KEY (vaga_id) REFERENCES vagas(id) ON DELETE RESTRICT;

ALTER TABLE vagas_cobrancas
  DROP CONSTRAINT vagas_cobrancas_locacao_id_fkey;

ALTER TABLE vagas_cobrancas
  ADD CONSTRAINT vagas_cobrancas_locacao_id_fkey
  FOREIGN KEY (locacao_id) REFERENCES vagas_locacao(id) ON DELETE RESTRICT;

-- ------------------------------------- 2. Nome do locatário no contrato
-- Backfill do que já existe: o nome atual do morador vira o registro de quem
-- assinou. Contrato sem morador e sem nome (não deveria existir) fica como está.
UPDATE vagas_locacao l
   SET locatario_nome = m.nome
  FROM moradores m
 WHERE l.morador_id = m.id
   AND (l.locatario_nome IS NULL OR btrim(l.locatario_nome) = '');

COMMENT ON COLUMN vagas_locacao.locatario_nome IS
  'Nome de quem alugou, gravado no contrato. Para pessoa externa é a única '
  'fonte; para morador é a rede de segurança do histórico caso o cadastro do '
  'morador mude ou saia.';
