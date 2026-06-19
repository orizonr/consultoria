/* ════════════════════════════════════════════
   cc-auth.js — Orizon Consultoria
   Projeto Supabase: yunoxkembhskpnprffoi
   ════════════════════════════════════════════ */

const SUPABASE_URL      = 'https://yunoxkembhskpnprffoi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1bm94a2VtYmhza3BucHJmZm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5Nzg2MzksImV4cCI6MjA5NDU1NDYzOX0.WhkzrBCHThvJaMuLeo6oVPjrWvc_MvfCoyz9B90-Yms';
const LOGIN_URL         = '/Consultoria/contratos/login.html';

window.__ccAuthReady = async function () {
  try {
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window._sb = sb;

    // ── Sessão inicial ──
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      const origem = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(LOGIN_URL + '?next=' + origem);
      return;
    }

    // ── Expõe token para cc-core usar nos fetches (RLS) ──
    window._ccAccessToken = session.access_token;

    // ── Renova token automaticamente antes de expirar ──
    sb.auth.onAuthStateChange((event, newSession) => {
      if (event === 'TOKEN_REFRESHED' && newSession) {
        window._ccAccessToken = newSession.access_token;
      }
      if (event === 'SIGNED_OUT') {
        window.location.replace(LOGIN_URL);
      }
    });

    // ── Preenche nome/email no sidebar ──
    const user = session.user;
    const nomeEl  = document.getElementById('user-nome');
    const emailEl = document.getElementById('user-email');
    const nomeSalvo  = localStorage.getItem('ex_cc_nome_exibicao');
    const cargoSalvo = localStorage.getItem('ex_cc_cargo_exibicao');
    if (nomeEl)  nomeEl.textContent  = nomeSalvo  || user.user_metadata?.nome || user.email.split('@')[0];
    if (emailEl) emailEl.textContent = cargoSalvo || user.email;

    // ── Logout global ──
    window.ccLogout = async () => {
      await sb.auth.signOut();
      window.location.replace(LOGIN_URL);
    };

    // ── Dispara init do core após auth confirmado ──
    if (typeof CC !== 'undefined') {
      CC.init().catch(e => console.error('[CC] init falhou:', e));
    }

  } catch (e) {
    console.error('[cc-auth] Exceção:', e);
    window.location.replace(LOGIN_URL);
  }
};

// ── Carrega SDK do Supabase e então roda auth ──
(function () {
  if (window.supabase) { window.__ccAuthReady(); return; }
  const s = document.createElement('script');
  s.src     = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
  s.onload  = () => window.__ccAuthReady();
  s.onerror = () => { console.error('[cc-auth] SDK não carregou'); window.location.replace(LOGIN_URL); };
  document.head.appendChild(s);
})();
