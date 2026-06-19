/* ════════════════════════════════════════════
   cc-core.js — Orizon Consultoria
   Projeto Supabase: yunoxkembhskpnprffoi
   ════════════════════════════════════════════ */
'use strict';

const SB_URL  = 'https://yunoxkembhskpnprffoi.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1bm94a2VtYmhza3BucHJmZm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5Nzg2MzksImV4cCI6MjA5NDU1NDYzOX0.WhkzrBCHThvJaMuLeo6oVPjrWvc_MvfCoyz9B90-Yms';

// ── Retorna o token JWT do usuário autenticado (ou a anon key como fallback) ──
function _authToken() {
  return window._ccAccessToken || SB_ANON;
}

// ── Fetch genérico com token correto (suporta RLS no Supabase) ──
async function _sbFetch(path, opts = {}) {
  const token = _authToken();
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      'apikey':        SB_ANON,
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
      'Prefer':        opts._prefer || 'return=representation',
      ...(opts.headers || {}),
    },
  });

  // ── Detecta 401 e redireciona para login ──
  if (res.status === 401) {
    console.warn('[CC] Token expirado — redirecionando para login');
    window.location.replace('/Consultoria/contratos/login.html');
    return [];
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${res.status}: ${err}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

// ══════════════════════════════════════
// CC — API pública
// ══════════════════════════════════════
const CC = {
  _ns: 'ex_cc_',

  // ── localStorage (apenas config) ──
  get(k)    { try { return JSON.parse(localStorage.getItem(this._ns + k)); } catch { return null; } },
  set(k, v) { localStorage.setItem(this._ns + k, JSON.stringify(v)); },
  del(k)    { localStorage.removeItem(this._ns + k); },

  getConfig()   { return this.get('config') || defaultConfig(); },
  saveConfig(d) { this.set('config', { ...defaultConfig(), ...d }); },

  // ── Carregar contratos do Supabase ──
  async getContratosAsync() {
    try {
      const rows = await _sbFetch('ex_contratos?order=id.asc&select=*');
      const lista = rows.map(_fromRow);
      this.set('contratos', lista);   // atualiza cache
      return lista;
    } catch (e) {
      console.error('[CC] Falha ao carregar contratos:', e);
      return this.get('contratos') || [];  // fallback cache
    }
  },

  // ── Cache síncrono (usado antes do init completar) ──
  getContratos() {
    return this.get('contratos') || [];
  },

  // ── Inserir contrato (ID gerado pelo banco) ──
  async insertContrato(dados) {
    _validarContrato(dados);
    const row = _toRow(dados);
    delete row.id;   // deixa o banco gerar o ID
    const res = await _sbFetch('ex_contratos', {
      method: 'POST',
      body:   JSON.stringify(row),
      _prefer: 'return=representation',
    });
    const novo = Array.isArray(res) ? res[0] : res;
    const lista = this.get('contratos') || [];
    lista.push(_fromRow(novo));
    this.set('contratos', lista);
    return _fromRow(novo);
  },

  // ── Atualizar contrato ──
  async updateContrato(id, dados) {
    _validarContrato(dados);
    const row = _toRow(dados);
    delete row.id;
    await _sbFetch(`ex_contratos?id=eq.${id}`, {
      method:  'PATCH',
      body:    JSON.stringify(row),
      _prefer: 'return=minimal',
    });
    const lista = this.get('contratos') || [];
    const idx = lista.findIndex(c => String(c.id) === String(id));
    if (idx >= 0) lista[idx] = { ...lista[idx], ...dados, id };
    this.set('contratos', lista);
  },

  // ── Excluir contrato ──
  async deleteContrato(id) {
    await _sbFetch(`ex_contratos?id=eq.${id}`, {
      method:  'DELETE',
      _prefer: 'return=minimal',
    });
    const lista = (this.get('contratos') || []).filter(c => String(c.id) !== String(id));
    this.set('contratos', lista);
  },

  // ── Limpar todos (para configurações) — batch delete ──
  async deleteAllContratos() {
    const lista = this.get('contratos') || [];
    if (lista.length === 0) return;
    const ids = lista.map(c => c.id).join(',');
    await _sbFetch(`ex_contratos?id=in.(${ids})`, {
      method:  'DELETE',
      _prefer: 'return=minimal',
    });
    this.set('contratos', []);
  },

  // ── init(): carrega dados após autenticação confirmada ──
  async init() {
    _navInit();
    await this.getContratosAsync();
  },
};

// ══════════════════════════════════════
// VALIDAÇÃO
// ══════════════════════════════════════
function _validarContrato(c) {
  if (!c.nome || String(c.nome).trim().length < 2) throw new Error('Nome inválido');
  if (!c.empresa || String(c.empresa).trim().length < 2) throw new Error('Empresa inválida');
  if (!c.tipo || !['estagiario','clt'].includes(c.tipo)) throw new Error('Tipo inválido');
  const taxa = parseFloat(c.taxa);
  if (isNaN(taxa) || taxa < 0 || taxa > 200) throw new Error('Taxa inválida');
}

// ══════════════════════════════════════
// CONVERSÃO snake_case ↔ camelCase
// ══════════════════════════════════════
function _toRow(c) {
  return {
    ...(c.id ? { id: c.id } : {}),
    tipo:           c.tipo,
    nome:           String(c.nome || '').trim(),
    empresa:        String(c.empresa || '').trim(),
    cargo:          c.cargo        || null,
    vt:             c.vt           || 'nao',
    valor_vt:       c.valorVT      ?? 0,
    bolsa:          c.bolsa        ?? null,
    salario:        c.salario      ?? null,
    taxa:           c.taxa         ?? 0,
    recrutador:     c.recrutador   || null,
    tipo_comissao:  c.tipoComissao || 'none',
    comissao_rec:   c.comissaoRec  ?? 0,
    comissao_fixo:  c.comissaoFixo ?? 0,
    agencia:        c.agencia      || null,
    tipo_origem:    c.tipoOrigem   || null,
    admissao:       c.admissao     || null,
    inicio1:        c.inicio1      || null,
    periodo_atual:  c.periodoAtual ?? null,
    situacao:       c.situacao     || 'ativo',
    obs:            c.obs          || null,
  };
}

function _fromRow(r) {
  return {
    id:           r.id,
    tipo:         r.tipo,
    nome:         r.nome,
    empresa:      r.empresa,
    cargo:        r.cargo        || '',
    vt:           r.vt           || 'nao',
    valorVT:      r.valor_vt     ?? 0,
    bolsa:        r.bolsa        ?? 0,
    salario:      r.salario      ?? 0,
    taxa:         r.taxa         ?? 0,
    recrutador:   r.recrutador   || '',
    tipoComissao: r.tipo_comissao || 'none',
    comissaoRec:  r.comissao_rec  ?? 0,
    comissaoFixo: r.comissao_fixo ?? 0,
    admissao:     r.admissao     || null,
    inicio1:      r.inicio1      || null,
    periodoAtual: r.periodo_atual ?? 1,
    agencia:      r.agencia      || '',
    tipoOrigem:   r.tipo_origem  || '',
    situacao:     r.situacao     || 'ativo',
    obs:          r.obs          || '',
  };
}

// ══════════════════════════════════════
// CONFIG PADRÃO
// ══════════════════════════════════════
function defaultConfig() {
  return {
    taxaEstPadrao:  15,
    taxaEstMin:     10,
    taxaEstMax:     15,
    taxaCLT:        50,
    alertaDias:     30,
    mesesPeriodo:   6,
    maxPeriodos:    4,
  };
}

// ══════════════════════════════════════
// FORMATADORES
// ══════════════════════════════════════
const Fmt = {
  brl: v => v == null ? '—' : Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL' }),
  pct: v => `${v}%`,
  dt:  v => { if (!v) return '—'; const d = new Date(v+'T12:00:00'); return d.toLocaleDateString('pt-BR'); },
  ini: s => { const n=(s||'').trim().split(/\s+/); return (n[0]?.[0]||'')+(n[1]?.[0]||''); },
  avCls: id => ['av-g','av-b','av-p','av-o','av-a'][String(id).charCodeAt(0) % 5],
  mes:  v => { if (!v) return '—'; const [a,m] = v.split('-'); return `${m}/${a}`; },
};

// ══════════════════════════════════════
// CÁLCULOS
// ══════════════════════════════════════
const Calc = {
  receita(c) {
    if (c.tipo === 'estagiario') return (c.bolsa||0) * ((c.taxa||0)/100);
    return (c.salario||0) * ((c.taxa||0)/100);
  },

  addMeses(dateStr, m) {
    if (!dateStr) return null;
    const d = new Date(dateStr+'T12:00:00');
    d.setMonth(d.getMonth() + m);
    return d.toISOString().slice(0, 10);
  },

  diasAte(dateStr) {
    if (!dateStr) return null;
    return Math.round((new Date(dateStr+'T12:00:00') - new Date()) / 86400000);
  },

  mesesTrabalhados(admissao) {
    if (!admissao) return 0;
    const ini  = new Date(admissao+'T12:00:00');
    const hoje = new Date();
    return (hoje.getFullYear()-ini.getFullYear())*12 + (hoje.getMonth()-ini.getMonth());
  },

  periodos(contrato, cfg) {
    const resultado = [];
    for (let i = 1; i <= cfg.maxPeriodos; i++) {
      const inicio = i === 1
        ? contrato.inicio1
        : this.addMeses(contrato.inicio1, (i-1) * cfg.mesesPeriodo);
      const fim  = this.addMeses(inicio, cfg.mesesPeriodo);
      const dias = this.diasAte(fim);
      let status = 'futuro';
      if (i < parseInt(contrato.periodoAtual)) {
        status = 'ok';
      } else if (i === parseInt(contrato.periodoAtual)) {
        if (dias === null)               status = 'futuro';
        else if (dias < 0)               status = 'vencido';
        else if (dias <= cfg.alertaDias) status = 'warn';
        else                             status = 'ativo';
      }
      resultado.push({ num: i, inicio, fim, status, dias });
    }
    return resultado;
  },

  statusContrato(contrato, cfg) {
    const s = contrato.situacao;
    if (s === 'cancelado') return { cls:'tag-red',    txt:'Cancelado' };
    if (s === 'efetivado') return { cls:'tag-blue',   txt:'Efetivado CLT' };
    if (s === 'concluido') return { cls:'tag-gray',   txt:'Concluído' };
    if (s === 'desligado') return { cls:'tag-red',    txt:'Desligado' };
    if (s === 'licenca')   return { cls:'tag-orange', txt:'Em Licença' };
    if (contrato.tipo === 'estagiario') {
      const ps   = this.periodos(contrato, cfg);
      const venc = ps.find(p => p.status === 'vencido');
      const warn = ps.find(p => p.status === 'warn');
      if (venc) return { cls:'tag-red',    txt:'Período Vencido' };
      if (warn) return { cls:'tag-orange', txt:`Vence em ${warn.dias}d` };
    }
    return { cls:'tag-green', txt:'Ativo' };
  },

  // ── Comissão do recrutador em um contrato ──
  comissaoRecrutador(c) {
    if (!c.recrutador) return 0;
    if (c.tipoComissao === 'percentual' || c.tipoComissao === 'pct') {
      return Calc.receita(c) * ((c.comissaoRec || 0) / 100);
    }
    if (c.tipoComissao === 'fixo') {
      return c.comissaoFixo || 0;
    }
    return 0;
  },
};

// ══════════════════════════════════════
// UI HELPERS
// ══════════════════════════════════════
const UI = {
  val:    id => document.getElementById(id)?.value ?? '',
  setVal: (id, v) => { const el=document.getElementById(id); if(el) el.value=(v??''); },

  toast(msg, tipo='ok') {
    const ct = document.getElementById('toast-ct');
    if (!ct) return;
    const el = document.createElement('div');
    el.className = `toast ${tipo}`;
    el.textContent = msg;
    ct.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  },

  openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('open');
    el.querySelector('.modal')?.scrollTo(0,0);
  },

  closeModal(id) {
    document.getElementById(id)?.classList.remove('open');
  },

  filtrar(tbodyId, q) {
    const trs = document.querySelectorAll(`#${tbodyId} tr[data-search]`);
    const ql  = (q||'').toLowerCase().trim();
    trs.forEach(tr => {
      const txt = (tr.dataset.search || '').toLowerCase();
      tr.style.display = txt.includes(ql) ? '' : 'none';
    });
  },

  loading(show, msg = 'Carregando...') {
    let el = document.getElementById('_cc_loading');
    if (!el) {
      el = document.createElement('div');
      el.id = '_cc_loading';
      el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;height:3px;background:linear-gradient(90deg,#1e40af,#3b82f6);transition:opacity .3s;transform-origin:left';
      document.body.appendChild(el);
    }
    el.style.opacity = show ? '1' : '0';
    el.style.animation = show ? 'none' : '';
    if (show) el.style.width = '70%'; else el.style.width = '100%';
  },
};

// ══════════════════════════════════════
// EXPORTAÇÃO
// ══════════════════════════════════════
const Export = {
  csv(headers, rows, filename) {
    const bom = '\uFEFF', sep = ';';
    const esc = v => `"${String(v??'').replace(/"/g,'""')}"`;
    const csv = bom + [headers, ...rows].map(r => r.map(esc).join(sep)).join('\r\n');
    const a = Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8;' })),
      download: filename,
    });
    a.click(); URL.revokeObjectURL(a.href);
    UI.toast('CSV exportado!', 'ok');
  },

  word(htmlContent, filename) {
    const doc = `<html xmlns:o='urn:schemas-microsoft-com:office:office'
      xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><style>
        body{font-family:Arial,sans-serif;font-size:11pt}
        table{border-collapse:collapse;width:100%;margin-bottom:14pt}
        th{background:#1e40af;color:#fff;padding:5pt 8pt;font-size:9pt}
        td{padding:4pt 8pt;border:1pt solid #ddd;font-size:10pt}
        h2,h3{color:#1e40af}
      </style></head><body>${htmlContent}</body></html>`;
    const a = Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(new Blob(['\ufeff', doc], { type:'application/msword' })),
      download: filename,
    });
    a.click(); URL.revokeObjectURL(a.href);
    UI.toast('Word exportado!', 'ok');
  },
};

// ══════════════════════════════════════
// NAV INIT
// ══════════════════════════════════════
function _navInit() {
  const toggle = document.getElementById('sb-toggle');
  if (toggle) {
    toggle.onclick = () => {
      if (window.innerWidth <= 768) {
        document.querySelector('.sb-nav')?.classList.toggle('mob-open');
      } else {
        document.querySelector('.sidebar')?.classList.toggle('collapsed');
      }
    };
  }

  document.querySelectorAll('.overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
  });

  document.querySelectorAll('.sb-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelector('.sb-nav')?.classList.remove('mob-open');
    });
  });

  const el = document.getElementById('tb-date');
  if (el) {
    const upd = () => el.textContent = new Date().toLocaleDateString('pt-BR',
      { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
    upd(); setInterval(upd, 60000);
  }
}
