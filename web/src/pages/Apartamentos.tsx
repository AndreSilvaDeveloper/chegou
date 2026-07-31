import { ApartamentosManager } from '../components/ApartamentosManager';
import { useAuthMe, useModuleEnabled } from '@/hooks/use-tenant-config';

export function Apartamentos() {
  const { data: usuario } = useAuthMe();
  const vagasAtivo = useModuleEnabled('vagas');

  // Vaga da unidade só aparece para quem gerencia vagas no módulo Vagas — o
  // porteiro cadastra a unidade, mas não as vagas dela.
  const permiteVagas =
    vagasAtivo === true && (usuario?.role === 'sindico' || usuario?.role === 'admin');

  // Sem `PageHeader` e sem wrapper com padding: quem desenha o cabeçalho (a
  // faixa âmbar no celular) e o respiro da folha é o `PageShell`, dentro do
  // manager — que é quem tem a busca, os filtros e as ações para entregar a ele.
  return <ApartamentosManager basePath="" permiteVagas={permiteVagas} />;
}
