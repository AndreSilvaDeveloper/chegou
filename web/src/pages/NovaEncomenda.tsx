import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Apartamento, Encomenda, Morador } from '../api/types';
import { ScannerModal } from '../components/ScannerModal';

const CORREIOS_RE = /^[A-Z]{2}\d{9}[A-Z]{2}$/i;

/** Extrai um código de rastreio do conteúdo escaneado e tenta adivinhar a transportadora. */
function parseScanned(raw: string): { codigo: string; transportadora?: string } {
  let code = raw.trim();
  if (/^https?:\/\//i.test(code)) {
    const m = code.match(/[A-Z]{2}\d{9}[A-Z]{2}|[A-Z0-9]{10,40}/i);
    if (m) code = m[0];
  }
  code = code.slice(0, 80);
  let transportadora: string | undefined;
  if (CORREIOS_RE.test(code)) transportadora = 'Correios';
  return { codigo: code, transportadora };
}

export function NovaEncomenda() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [aptos, setAptos] = useState<Apartamento[]>([]);
  const [selectedApto, setSelectedApto] = useState<Apartamento | null>(null);
  const [moradores, setMoradores] = useState<Morador[]>([]);
  const [moradorId, setMoradorId] = useState<string>('');
  const [descricao, setDescricao] = useState('');
  const [transportadora, setTransportadora] = useState('');
  const [codigoRastreio, setCodigoRastreio] = useState('');
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);

  // cadastro de apartamento inline
  const [novoApto, setNovoApto] = useState<{ bloco: string; numero: string } | null>(null);
  const [criandoApto, setCriandoApto] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const params = q ? `?q=${encodeURIComponent(q)}` : '';
      api.get<Apartamento[]>(`/apartamentos${params}`).then(setAptos);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!selectedApto) {
      setMoradores([]);
      return;
    }
    api.get<Morador[]>(`/apartamentos/${selectedApto.id}/moradores`).then(setMoradores).catch(() => setMoradores([]));
  }, [selectedApto]);

  const handleScan = (text: string) => {
    setScanning(false);
    const { codigo, transportadora: t } = parseScanned(text);
    setCodigoRastreio(codigo);
    if (t && !transportadora.trim()) setTransportadora(t);
  };

  const criarApto = async () => {
    if (!novoApto || !novoApto.numero.trim()) {
      setError('Informe o número do apartamento');
      return;
    }
    setCriandoApto(true);
    setError(null);
    try {
      const a = await api.post<Apartamento>('/apartamentos', {
        bloco: novoApto.bloco.trim() || undefined,
        numero: novoApto.numero.trim(),
      });
      setNovoApto(null);
      setSelectedApto(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar apartamento');
    } finally {
      setCriandoApto(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedApto) {
      setError('Escolha um apartamento');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let fotoUrl: string | undefined;
      if (foto) {
        const fd = new FormData();
        fd.append('file', foto);
        const up = await api.upload<{ url: string }>('/uploads/encomenda-foto', fd);
        fotoUrl = up.url;
      }
      const r = await api.post<Encomenda>('/encomendas', {
        apartamentoId: selectedApto.id,
        moradorDestinoId: moradorId || undefined,
        descricao: descricao || undefined,
        transportadora: transportadora || undefined,
        codigoRastreio: codigoRastreio || undefined,
        fotoUrl,
      });
      nav(`/encomendas/${r.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 max-w-xl">
      <h1 className="text-2xl font-semibold text-slate-800">Nova encomenda</h1>

      {!selectedApto ? (
        <div className="card space-y-3">
          <label className="label">Buscar apartamento</label>
          <input
            className="input"
            placeholder="Ex: A-101 ou 101"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {aptos.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelectedApto(a)}
                className="px-3 py-3 rounded-lg border border-slate-200 bg-white text-sm font-mono font-semibold hover:bg-brand-50 hover:border-brand-300"
              >
                {a.identificador}
              </button>
            ))}
            {aptos.length === 0 && q && (
              <div className="col-span-full text-sm text-slate-500">Nenhum apartamento encontrado.</div>
            )}
          </div>

          {novoApto === null ? (
            <button
              type="button"
              onClick={() => setNovoApto({ bloco: '', numero: q.replace(/^[A-Za-z]-?/, '').trim() })}
              className="text-sm text-brand-600 hover:text-brand-800"
            >
              + Cadastrar novo apartamento
            </button>
          ) : (
            <div className="border border-brand-200 bg-brand-50 rounded-lg p-3 space-y-2">
              <div className="text-sm font-medium text-slate-700">Novo apartamento</div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  className="input"
                  placeholder="Bloco (opc.)"
                  value={novoApto.bloco}
                  onChange={(e) => setNovoApto({ ...novoApto, bloco: e.target.value })}
                />
                <input
                  className="input col-span-2"
                  placeholder="Número *"
                  value={novoApto.numero}
                  onChange={(e) => setNovoApto({ ...novoApto, numero: e.target.value })}
                  autoFocus
                />
              </div>
              {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
              <div className="flex gap-2">
                <button type="button" onClick={criarApto} disabled={criandoApto} className="btn-primary py-1.5 text-sm">
                  {criandoApto ? 'Cadastrando…' : 'Cadastrar e usar'}
                </button>
                <button type="button" onClick={() => { setNovoApto(null); setError(null); }} className="btn-secondary py-1.5 text-sm">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500">Apartamento</div>
              <div className="font-mono text-2xl font-bold text-slate-800">{selectedApto.identificador}</div>
            </div>
            <button type="button" onClick={() => setSelectedApto(null)} className="text-sm text-slate-500 hover:text-slate-800">
              Trocar
            </button>
          </div>

          {moradores.length > 0 ? (
            <div>
              <label className="label">Destinatário (opcional)</label>
              <select className="input" value={moradorId} onChange={(e) => setMoradorId(e.target.value)}>
                <option value="">— Para o apartamento —</option>
                {moradores.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome} {m.principal ? '(principal)' : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Este apartamento ainda não tem moradores cadastrados — a encomenda fica registrada, mas o aviso de WhatsApp só vai quando um morador for adicionado (em Moradores).
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <label className="label">Código de rastreio</label>
              <button type="button" onClick={() => setScanning(true)} className="text-sm text-brand-600 hover:text-brand-800">📷 Escanear</button>
            </div>
            <input
              className="input font-mono"
              placeholder="Ex: LB123456789BR (ou escaneie)"
              value={codigoRastreio}
              onChange={(e) => setCodigoRastreio(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Descrição</label>
            <input
              className="input"
              placeholder="Ex: Caixa Amazon, envelope dos Correios"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Transportadora (opcional)</label>
            <input className="input" value={transportadora} onChange={(e) => setTransportadora(e.target.value)} />
          </div>

          <div>
            <label className="label">Foto da encomenda (opcional)</label>
            {fotoPreview ? (
              <div className="space-y-2">
                <img src={fotoPreview} alt="Preview" className="rounded-lg max-h-48 border border-slate-200" />
                <button
                  type="button"
                  onClick={() => { setFoto(null); setFotoPreview(null); }}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Remover foto
                </button>
              </div>
            ) : (
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setFoto(f);
                    setFotoPreview(URL.createObjectURL(f));
                  }
                }}
                className="input"
              />
            )}
          </div>

          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Salvando…' : 'Salvar e notificar'}
            </button>
            <button type="button" onClick={() => nav('/')} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {scanning && <ScannerModal onResult={handleScan} onClose={() => setScanning(false)} />}
    </form>
  );
}
