'use strict';
// ---------- utilidades ----------
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const BILLING = { hora: 'Por hora', pernoite: 'Pernoite', diaria: 'Diária' };
const STATUS = { livre: 'Livre', ocupado: 'Ocupado', limpeza: 'Limpeza', manutencao: 'Manutenção' };
const ROLES = { admin: 'Administrador', usuario: 'Usuário' };
const PAYMENTS = ['Dinheiro', 'Pix', 'Cartão de débito', 'Cartão de crédito'];
const RES_STATUS = { agendada: 'Agendada', iniciada: 'Iniciada', cancelada: 'Cancelada', nao_compareceu: 'Não compareceu' };
const INCOME_CATS = ['Receita avulsa', 'Venda balcão', 'Outras receitas'];
const EXPENSE_CATS = ['Fornecedores', 'Lavanderia', 'Limpeza e higiene', 'Manutenção', 'Água, luz e internet', 'Salários', 'Impostos e taxas', 'Aluguel', 'Outras despesas'];
const APP_NAME = 'Paris Suite';
const ICONS = {
  quartos: '<path d="M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7M3 14h18M3 18v2M21 18v2M7 9V6h4v3"/>',
  reservas: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  caixa: '<rect x="2" y="6" width="20" height="13" rx="2"/><circle cx="12" cy="12.5" r="2.5"/><path d="M6 10v.01M18 15v.01"/>',
  relatorios: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  config: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
};
const icon = k => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;
const logo = (size = 22) => `<span class="logo" style="font-size:${size}px"><span class="logo-mark">PS</span><span>Paris <b>Suite</b></span></span>`;

function tz() { return S.company?.timezone || 'America/Sao_Paulo'; }
function fmtDT(ms, opts = {}) {
  return new Date(ms).toLocaleString('pt-BR', { timeZone: tz(), day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', ...opts });
}
function fmtDay(ms) { return new Date(ms).toLocaleDateString('pt-BR', { timeZone: tz(), weekday: 'short', day: '2-digit', month: '2-digit' }); }
function fmtTime(ms) { return new Date(ms).toLocaleTimeString('pt-BR', { timeZone: tz(), hour: '2-digit', minute: '2-digit' }); }
function fmtDur(ms) {
  const m = Math.max(0, Math.floor(ms / 60000)); const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return (d ? d + 'd ' : '') + h + 'h' + String(mm).padStart(2, '0');
}

function csrfToken() { return (document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/) || [])[1] || ''; }
async function api(method, url, body) {
  const headers = { 'X-CSRFToken': csrfToken() };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { method, headers, credentials: 'same-origin', body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/login') { S.me = null; render(); }
  if (!res.ok) throw new Error(data.error || 'Erro ' + res.status);
  return data;
}

let toastTimer;
function toast(msg, err = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.className = '', 2600);
}
// Executa uma ação mostrando erros como aviso.
async function run(fn) { try { return await fn(); } catch (e) { toast(e.message, true); } }

function modal({ title, body, foot = '', wide = false, onMount }) {
  const root = $('#modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'backdrop';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><h2 style="font-size:18px">${title}</h2><span class="spacer"></span>
      <button class="btn ghost sm" data-close aria-label="Fechar">✕</button></div>
    <div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  root.appendChild(wrap);
  const m = { el: wrap, close, set(html) { $('.modal-body', wrap).innerHTML = html; }, setFoot(html) { $('.modal-foot', wrap).innerHTML = html; } };
  onMount?.(m);
  return m;
}
function confirmDialog(text, okLabel = 'Confirmar', danger = false) {
  return new Promise(resolve => {
    const m = modal({ title: 'Confirmar', body: `<p>${text}</p>`,
      foot: `<button class="btn" data-close>Voltar</button><button class="btn ${danger ? 'danger' : 'primary'}" id="ok">${okLabel}</button>` });
    $('#ok', m.el).onclick = () => { m.close(); resolve(true); };
    m.el.addEventListener('click', e => { if (e.target.closest('[data-close]') || e.target === m.el) resolve(false); });
  });
}
function formData(form) {
  const o = {};
  for (const el of form.elements) if (el.name) o[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  return o;
}

// ---------- estado ----------
const S = {
  me: undefined, companies: [], company: null, tab: 'quartos', rooms: [], products: [], categories: [],
  filter: null, configTab: 'empresa',
};
const isAdmin = () => S.me?.role === 'admin';

async function boot() {
  try { S.me = await api('GET', '/api/me'); } catch { S.me = null; }
  if (S.me) await loadCompanies();
  render();
}
async function loadCompanies() {
  S.companies = await api('GET', '/api/companies');
  const saved = +localStorage.getItem('companyId');
  S.company = S.companies.find(c => c.id === saved) || S.companies[0] || null;
}
async function loadCompanyData() {
  if (!S.company) return;
  const id = S.company.id;
  [S.rooms, S.products, S.categories] = await Promise.all([
    api('GET', `/api/companies/${id}/rooms`), api('GET', `/api/companies/${id}/products`), api('GET', `/api/companies/${id}/categories`)]);
}

// ---------- telas ----------
function render() {
  const app = $('#app');
  if (S.me === undefined) { app.innerHTML = ''; return; }
  if (!S.me) return renderLogin(app);
  const tabs = [['quartos', 'Quartos'], ['reservas', 'Reservas'], ['caixa', 'Caixa'], ['relatorios', 'Relatórios'], ['config', 'Ajustes']];
  if (!tabs.some(t => t[0] === S.tab)) S.tab = 'quartos';
  app.innerHTML = `
    <header class="top">
      <div class="top-in">
        ${logo(18)}
        ${S.companies.length > 1 ? `<select id="company" aria-label="Empresa">${S.companies.map(c => `<option value="${c.id}" ${c.id === S.company?.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`
          : `<span class="muted small co-name">${esc(S.company?.name || '')}</span>`}
        <nav class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${S.tab === k ? 'active' : ''}">${icon(k)}<span>${l}</span></button>`).join('')}</nav>
        <span class="spacer"></span>
        <button class="btn ghost sm userbtn" id="userbtn" title="Conta">${esc(S.me.name.split(' ')[0])} ▾</button>
      </div>
    </header>
    <main id="view"></main>`;
  $('#company')?.addEventListener('change', async e => {
    S.company = S.companies.find(c => c.id === +e.target.value); localStorage.setItem('companyId', S.company.id); S.filter = null; renderView();
  });
  $$('nav.tabs button').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; window.scrollTo(0, 0); render(); });
  $('#userbtn').onclick = userMenu;
  renderView();
}
function renderView() {
  const v = $('#view');
  if (!S.company) {
    v.innerHTML = `<div class="card"><p>${isAdmin() ? 'Nenhuma empresa cadastrada.' : 'Seu usuário não está ligado a nenhuma empresa ativa. Fale com o administrador.'}</p>${isAdmin() ? '<button class="btn primary" id="newco">Cadastrar empresa</button>' : ''}</div>`;
    $('#newco')?.addEventListener('click', () => companyForm());
    return;
  }
  if (S.tab === 'quartos') return viewRooms(v);
  if (S.tab === 'reservas') return viewReservations(v);
  if (S.tab === 'caixa') return viewCash(v);
  if (S.tab === 'relatorios') return viewReports(v);
  if (S.tab === 'config') return viewConfig(v);
}

function renderLogin(app) {
  app.innerHTML = `<div class="login"><form class="card stack" id="login">
    <div class="login-head">${logo(26)}<p class="muted small">Entre com seu usuário</p></div>
    <label class="field"><span>Usuário</span><input name="username" autocomplete="username" autocapitalize="none" required></label>
    <label class="field"><span>Senha</span><input name="password" type="password" autocomplete="current-password" required></label>
    <button class="btn primary block">Entrar</button></form></div>`;
  $('#login').onsubmit = e => {
    e.preventDefault();
    run(async () => { await api('POST', '/api/login', formData(e.target)); await boot(); });
  };
}

function userMenu() {
  const m = modal({ title: esc(S.me.name), body: `<p class="muted small">${ROLES[S.me.role]} · usuário <b>${esc(S.me.username)}</b></p>
    <form id="pw" class="stack"><div class="section-title" style="margin-top:0">Trocar senha</div>
      <label class="field"><span>Senha atual</span><input name="current" type="password" required></label>
      <label class="field"><span>Nova senha</span><input name="password" type="password" minlength="4" required></label>
      <button class="btn block">Salvar nova senha</button></form>`,
    foot: `<button class="btn danger" id="logout">Sair</button>` });
  $('#pw', m.el).onsubmit = e => { e.preventDefault(); run(async () => { await api('PUT', '/api/me/password', formData(e.target)); toast('Senha alterada'); m.close(); }); };
  $('#logout', m.el).onclick = () => run(async () => { await api('POST', '/api/logout'); m.close(); S.me = null; render(); });
}

// ---------- Quartos ----------
let refreshTimer;
async function viewRooms(v) {
  if (!S.rooms.length || S.rooms[0]?.company_id !== S.company.id) v.innerHTML = '<p class="muted">Carregando…</p>';
  await run(loadCompanyData);
  drawRooms(v);
  clearInterval(refreshTimer);
  refreshTimer = setInterval(async () => {
    if (S.tab !== 'quartos' || !S.me || $('#modal-root').children.length) return;
    try { S.rooms = await api('GET', `/api/companies/${S.company.id}/rooms`); drawRooms($('#view')); } catch {}
  }, 30000);
}
function drawRooms(v) {
  if (!v) return;
  const count = s => S.rooms.filter(r => r.status === s).length;
  const rooms = !S.filter ? S.rooms : S.rooms.filter(r => S.filter === 'reserva' ? r.next_reservation : r.status === S.filter);
  const openTotal = S.rooms.reduce((s, r) => s + (r.stay?.preview_total || 0), 0);
  const reserved = S.rooms.filter(r => r.next_reservation).length;
  v.innerHTML = `
    <div class="chips">
      ${Object.entries(STATUS).map(([k, l]) => `<button class="chip s-${k} ${S.filter === k ? 'on' : ''}" data-f="${k}"><span class="dot" style="background:var(--c)"></span>${l} · ${count(k)}</button>`).join('')}
      ${reserved ? `<button class="chip s-reserva ${S.filter === 'reserva' ? 'on' : ''}" data-f="reserva"><span class="dot" style="background:var(--c)"></span>Reservas 24h · ${reserved}</button>` : ''}
      <span class="spacer"></span><span class="chip static">Em aberto: <b class="num">${brl(openTotal)}</b></span>
    </div>
    ${S.rooms.length ? '' : `<div class="card"><p>Nenhum quarto cadastrado.</p><p class="muted small">Cadastre em Ajustes → Quartos.</p></div>`}
    <div class="rooms">${rooms.map(roomCard).join('')}</div>`;
  $$('.chip[data-f]', v).forEach(b => b.onclick = () => { S.filter = S.filter === b.dataset.f ? null : b.dataset.f; drawRooms(v); });
  $$('.room', v).forEach(el => el.onclick = () => openRoom(S.rooms.find(r => r.id === +el.dataset.id)));
}
function resLabel(nr) {
  const late = nr.start_at < Date.now();
  const sameDay = new Date(nr.start_at).toLocaleDateString('sv-SE', { timeZone: tz() }) === todayStr();
  return `${late ? 'Atrasada · ' : ''}${sameDay ? fmtTime(nr.start_at) : fmtDT(nr.start_at)}${nr.guest_name ? ' · ' + esc(nr.guest_name) : ''}`;
}
function roomCard(r) {
  const s = r.stay, nr = r.next_reservation;
  return `<button class="room s-${r.status}" data-id="${r.id}">
    <div class="row"><span class="name">${esc(r.name)}</span><span class="spacer"></span>${r.capacity ? `<span class="cap" title="Capacidade">${r.capacity} ${r.capacity > 1 ? 'pessoas' : 'pessoa'}</span>` : ''}</div>
    <span class="cat">${esc(r.category_name)}</span>
    <span class="status">${STATUS[r.status]}</span>
    ${nr ? `<span class="res-tag ${nr.start_at < Date.now() ? 'late' : ''}">${icon('reservas')}${resLabel(nr)}</span>` : ''}
    ${s ? `<div class="info">${BILLING[s.billing_type]} · desde ${fmtTime(s.check_in)}<br>
        ${s.guest_name ? esc(s.guest_name) + ' · ' : ''}${fmtDur(Date.now() - s.check_in)}</div>
      <div class="total num">${brl(s.preview_total)}</div>` : ''}
  </button>`;
}
async function reloadRooms() { S.rooms = await api('GET', `/api/companies/${S.company.id}/rooms`); if (S.tab === 'quartos') drawRooms($('#view')); }

function openRoom(r) {
  if (r.status === 'ocupado' && r.stay) return openStay(r.stay.id);
  if (r.status === 'livre') return checkinForm(r);
  const next = r.status === 'limpeza' ? 'Marcar como livre' : 'Liberar quarto';
  const m = modal({ title: `Quarto ${esc(r.name)}`, body: `<p>Status atual: <b>${STATUS[r.status]}</b></p>
      ${r.next_reservation ? `<p class="muted small">Próxima reserva: ${resLabel(r.next_reservation)}</p>` : ''}`,
    foot: `${r.status !== 'manutencao' ? '<button class="btn" id="maint">Manutenção</button>' : ''}<button class="btn primary" id="free">${next}</button>` });
  $('#free', m.el).onclick = () => run(async () => { await api('POST', `/api/rooms/${r.id}/status`, { status: 'livre' }); m.close(); toast(`Quarto ${r.name} livre`); reloadRooms(); });
  $('#maint', m.el)?.addEventListener('click', () => run(async () => { await api('POST', `/api/rooms/${r.id}/status`, { status: 'manutencao' }); m.close(); reloadRooms(); }));
}

function checkinForm(r) {
  const cat = S.categories.find(c => c.id === r.category_id) || {};
  const c = S.company;
  const opts = [
    ['hora', 'Por hora', brl(cat.hour_price) + '/h', `mínimo ${cat.hour_min_hours || 1}h`],
    ['pernoite', 'Pernoite', brl(cat.overnight_price), `${c.overnight_start} às ${c.overnight_end}`],
    ['diaria', 'Diária', brl(cat.daily_price), `${c.daily_start} às ${c.daily_end}`],
  ];
  let type = null;
  const nr = r.next_reservation;
  const m = modal({ title: `Quarto ${esc(r.name)}`,
    body: `<div class="stack">
      ${nr ? `<div class="notice ${nr.start_at < Date.now() ? 'warn' : ''}"><div style="flex:1"><b>Reserva ${resLabel(nr)}</b>
          <div class="small">${BILLING[nr.billing_type]} · até ${fmtDT(nr.end_at)}</div></div>
          <button class="btn primary sm" id="startres">Iniciar reserva</button></div>` : ''}
      <div class="muted small">${esc(r.category_name)}${r.capacity ? ` · ${r.capacity} ${r.capacity > 1 ? 'pessoas' : 'pessoa'}` : ''} · escolha a cobrança</div>
      <div class="choices">${opts.map(([k, l, p, d]) => `<button class="choice" data-t="${k}"><b>${l}</b><div class="price num">${p}</div><div class="muted small">${d}</div></button>`).join('')}</div>
      <label class="field"><span>Nome do cliente (opcional)</span><input id="guest" autocomplete="off" placeholder="Ex.: Maria"></label>
    </div>`,
    foot: `<button class="btn" id="maint">Manutenção</button><button class="btn" id="reserve">Reservar</button><button class="btn primary" id="go" disabled>Iniciar agora</button>` });
  $('#reserve', m.el).onclick = () => { m.close(); reservationForm(null, { room_id: r.id }); };
  $('#startres', m.el)?.addEventListener('click', () => run(async () => {
    const res = await api('POST', `/api/reservations/${nr.id}/checkin`);
    m.close(); toast(`Reserva iniciada · quarto ${r.name}`); await reloadRooms(); openStay(res.stay_id);
  }));
  $$('.choice', m.el).forEach(b => b.onclick = () => { type = b.dataset.t; $$('.choice', m.el).forEach(x => x.classList.toggle('on', x === b)); $('#go', m.el).disabled = false; });
  $('#go', m.el).onclick = () => run(async () => {
    if (nr && nr.start_at - Date.now() < 3 * 3600000 && !await confirmDialog(`Este quarto tem reserva ${resLabel(nr)}. Iniciar outra estadia mesmo assim?`, 'Iniciar mesmo assim')) return;
    const stay = await api('POST', `/api/rooms/${r.id}/checkin`, { billing_type: type, guest_name: $('#guest', m.el).value });
    m.close(); toast(`Quarto ${r.name} ocupado`); await reloadRooms(); openStay(stay.id);
  });
  $('#maint', m.el).onclick = () => run(async () => { await api('POST', `/api/rooms/${r.id}/status`, { status: 'manutencao' }); m.close(); reloadRooms(); });
}

// Painel da estadia aberta: consumo, troca de cobrança e fechamento.
async function openStay(id) {
  let stay = await run(() => api('GET', `/api/stays/${id}`));
  if (!stay) return;
  if (stay.status !== 'aberta') return showReceipt(stay);
  const m = modal({ title: `Quarto ${esc(stay.room_name)}`, wide: true, body: '',
    foot: `<button class="btn" id="cancel">Cancelar estadia</button><button class="btn primary" id="close">Fechar conta</button>` });
  let filter = '';
  const draw = () => {
    const prods = S.products.filter(p => p.name.toLowerCase().includes(filter.toLowerCase()));
    m.set(`<div class="stack">
      <div class="grid2">
        <label class="field"><span>Cobrança</span><select id="btype">${Object.entries(BILLING).map(([k, l]) => `<option value="${k}" ${k === stay.billing_type ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Cliente (opcional)</span><input id="gname" value="${esc(stay.guest_name || '')}" placeholder="Sem nome"></label>
      </div>
      <div class="muted small">${esc(stay.category_name)} · entrada ${fmtDT(stay.check_in)} · ${fmtDur(stay.now - stay.check_in)} de permanência</div>
      <div class="section-title">Lançar consumo</div>
      ${S.products.length > 8 ? `<input id="pfilter" placeholder="Buscar produto…" value="${esc(filter)}">` : ''}
      <div class="products">${prods.map(p => `<button class="product" data-p="${p.id}"><b>${esc(p.name)}</b><span class="muted small num">${brl(p.price)}</span></button>`).join('') || '<span class="muted small">Nenhum produto cadastrado.</span>'}</div>
      <div class="section-title">Conta</div>
      <table class="lines">
        ${stay.room_lines.map(l => `<tr><td>${esc(l.desc)}</td><td class="right num">${brl(l.amount)}</td><td></td></tr>`).join('')}
        ${stay.items.map(i => `<tr><td>${i.qty}× ${esc(i.name)} <span class="muted small">${fmtTime(i.created_at)}</span></td>
          <td class="right num">${brl(i.qty * i.unit_price)}</td><td class="right" style="width:40px"><button class="btn ghost sm danger" data-del="${i.id}" aria-label="Remover">✕</button></td></tr>`).join('')}
      </table>
      <div class="totals">
        <div class="row"><span>Hospedagem</span><span class="num">${brl(stay.room_amount)}</span></div>
        <div class="row"><span>Consumo</span><span class="num">${brl(stay.items_amount)}</span></div>
        <div class="row grand"><span>Total até agora</span><span class="num">${brl(stay.preview_total)}</span></div>
      </div>
    </div>`);
    $$('[data-p]', m.el).forEach(b => b.onclick = () => run(async () => {
      stay = await api('POST', `/api/stays/${id}/items`, { product_id: +b.dataset.p, qty: 1 });
      toast(`+1 ${S.products.find(p => p.id === +b.dataset.p).name}`); draw();
    }));
    $$('[data-del]', m.el).forEach(b => b.onclick = () => run(async () => { stay = await api('DELETE', `/api/stays/${id}/items/${b.dataset.del}`); draw(); }));
    $('#btype', m.el).onchange = e => run(async () => { stay = await api('PUT', `/api/stays/${id}`, { billing_type: e.target.value }); toast('Cobrança alterada'); draw(); });
    $('#gname', m.el).onchange = e => run(async () => { stay = await api('PUT', `/api/stays/${id}`, { guest_name: e.target.value }); toast('Nome salvo'); });
    const pf = $('#pfilter', m.el);
    if (pf) pf.oninput = e => { filter = e.target.value; const pos = e.target.selectionStart; draw(); const n = $('#pfilter', m.el); n.focus(); n.setSelectionRange(pos, pos); };
  };
  draw();
  const origClose = m.close;
  m.close = () => { origClose(); reloadRooms(); };
  m.el.addEventListener('click', e => { if (e.target === m.el || e.target.closest('[data-close]')) reloadRooms(); });
  $('#close', m.el).onclick = () => checkoutForm(stay, m);
  $('#cancel', m.el).onclick = async () => {
    if (!await confirmDialog('Cancelar esta estadia sem cobrança? O quarto volta a ficar livre.', 'Cancelar estadia', true)) return;
    run(async () => { await api('POST', `/api/stays/${id}/cancel`, {}); m.close(); toast('Estadia cancelada'); });
  };
}

async function checkoutForm(stay, parent) {
  stay = await run(() => api('GET', `/api/stays/${stay.id}`)); // valor atualizado no momento do fechamento
  if (!stay) return;
  let pay = PAYMENTS[0];
  const m = modal({ title: 'Fechar conta', body: `<form id="co" class="stack">
      <div class="totals">
        <div class="row"><span>Hospedagem (${BILLING[stay.billing_type]})</span><span class="num">${brl(stay.room_amount)}</span></div>
        <div class="row"><span>Consumo</span><span class="num">${brl(stay.items_amount)}</span></div>
        <div class="row grand"><span>Total</span><span class="num" id="gt">${brl(stay.room_amount + stay.items_amount)}</span></div>
      </div>
      <div class="grid2">
        <label class="field"><span>Desconto (R$)</span><input name="discount" inputmode="decimal" type="number" step="0.01" min="0" value="0"></label>
        <label class="field"><span>Acréscimo (R$)</span><input name="surcharge" inputmode="decimal" type="number" step="0.01" min="0" value="0"></label>
      </div>
      <div><div class="muted small" style="margin-bottom:6px">Forma de pagamento</div>
        <div class="pay">${PAYMENTS.map(p => `<button type="button" class="choice ${p === pay ? 'on' : ''}" data-pay="${esc(p)}"><b style="font-size:14px">${p}</b></button>`).join('')}</div></div>
      <label class="field"><span>Observação</span><input name="notes" placeholder="Opcional"></label>
    </form>`,
    foot: `<button class="btn" data-close>Voltar</button><button class="btn primary" id="finish">Finalizar e gerar nota</button>` });
  const form = $('#co', m.el);
  const upd = () => { const f = formData(form); $('#gt', m.el).textContent = brl(stay.room_amount + stay.items_amount - (+f.discount || 0) + (+f.surcharge || 0)); };
  form.oninput = upd;
  $$('[data-pay]', m.el).forEach(b => b.onclick = () => { pay = b.dataset.pay; $$('[data-pay]', m.el).forEach(x => x.classList.toggle('on', x === b)); });
  $('#finish', m.el).onclick = () => run(async () => {
    const closed = await api('POST', `/api/stays/${stay.id}/checkout`, { ...formData(form), payment_method: pay });
    m.close(); parent.close(); toast('Conta fechada. Quarto em limpeza.'); showReceipt(closed);
  });
}

function receiptHTML(s) {
  const zone = s.company?.timezone;
  const dt = ms => new Date(ms).toLocaleString('pt-BR', { timeZone: zone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `<div class="receipt">
    <h3>${esc(s.company?.name)}</h3>
    <div class="c">${s.status === 'cancelada' ? 'ESTADIA CANCELADA' : 'NOTA DE CONSUMO'} Nº ${String(s.id).padStart(6, '0')}</div>
    <hr>
    <table>
      <tr><td>Quarto</td><td class="right">${esc(s.room_name)} (${esc(s.category_name)})</td></tr>
      ${s.guest_name ? `<tr><td>Cliente</td><td class="right">${esc(s.guest_name)}</td></tr>` : ''}
      <tr><td>Cobrança</td><td class="right">${BILLING[s.billing_type]}</td></tr>
      <tr><td>Entrada</td><td class="right">${dt(s.check_in)}</td></tr>
      ${s.check_out ? `<tr><td>Saída</td><td class="right">${dt(s.check_out)}</td></tr>` : ''}
    </table>
    <hr><b>HOSPEDAGEM</b>
    <table>${s.room_lines.map(l => `<tr><td>${esc(l.desc)}</td><td class="right">${brl(l.amount)}</td></tr>`).join('')}</table>
    ${s.items.length ? `<hr><b>CONSUMO</b><table>${s.items.map(i => `<tr><td>${i.qty} × ${esc(i.name)}<br><small>${brl(i.unit_price)} un.</small></td><td class="right">${brl(i.qty * i.unit_price)}</td></tr>`).join('')}</table>` : ''}
    <hr>
    <table>
      <tr><td>Hospedagem</td><td class="right">${brl(s.room_amount)}</td></tr>
      <tr><td>Consumo</td><td class="right">${brl(s.items_amount)}</td></tr>
      ${s.discount ? `<tr><td>Desconto</td><td class="right">- ${brl(s.discount)}</td></tr>` : ''}
      ${s.surcharge ? `<tr><td>Acréscimo</td><td class="right">+ ${brl(s.surcharge)}</td></tr>` : ''}
      <tr class="big"><td>TOTAL</td><td class="right">${brl(s.status === 'fechada' ? s.total : 0)}</td></tr>
      ${s.payment_method ? `<tr><td>Pagamento</td><td class="right">${esc(s.payment_method)}</td></tr>` : ''}
    </table>
    ${s.notes ? `<hr><small>Obs.: ${esc(s.notes)}</small>` : ''}
    <hr><div class="c"><small>Obrigado pela preferência!</small></div>
  </div>`;
}
function showReceipt(s) {
  const m = modal({ title: 'Nota', body: receiptHTML(s), foot: `<button class="btn" data-close>Fechar</button><button class="btn primary" id="print">Imprimir</button>` });
  $('#print', m.el).onclick = () => window.print();
}

// ---------- Histórico ----------
function dayStart(dateStr) { // 'YYYY-MM-DD' no fuso da empresa → ms
  const guess = Date.parse(dateStr + 'T00:00:00Z');
  const wall = Date.parse(new Date(guess).toLocaleString('sv-SE', { timeZone: tz() }).replace(' ', 'T') + 'Z');
  return guess - (wall - guess);
}
function todayStr(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('sv-SE', { timeZone: tz() });
}
function dateStrOf(ms) { return new Date(ms).toLocaleDateString('sv-SE', { timeZone: tz() }); }
function timeStrOf(ms) { return new Date(ms).toLocaleTimeString('sv-SE', { timeZone: tz(), hour: '2-digit', minute: '2-digit' }); }
function localMs(dateStr, timeStr) { // data e hora no fuso da empresa → ms
  const [h, m] = timeStr.split(':').map(Number);
  return dayStart(dateStr) + (h * 60 + m) * 60000;
}
function addDays(dateStr, n) { const d = new Date(dateStr + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function monthStart(dateStr) { return dateStr.slice(0, 8) + '01'; }
const csvCell = v => /[";\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? '');
function downloadCSV(name, rows) {
  const blob = new Blob(['﻿' + rows.map(r => r.map(csvCell).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Reservas ----------
let resState = null;
async function viewReservations(v) {
  resState ??= { from: todayStr(), days: 7, showAll: false };
  const draw = async () => {
    const from = dayStart(resState.from), to = dayStart(addDays(resState.from, resState.days)) - 1;
    const status = resState.showAll ? '' : '&status=agendada';
    const list = await run(() => api('GET', `/api/companies/${S.company.id}/reservations?from=${from}&to=${to}${status}`));
    if (!list) return;
    const byDay = {};
    list.forEach(r => (byDay[dateStrOf(r.start_at)] ??= []).push(r));
    const late = list.filter(r => r.status === 'agendada' && r.start_at < Date.now());
    $('#rlist', v).innerHTML = `
      ${late.length ? `<div class="notice warn" style="margin-bottom:12px">${late.length === 1 ? '1 reserva passou do horário' : late.length + ' reservas passaram do horário'} sem iniciar. Inicie, marque como não compareceu ou cancele.</div>` : ''}
      ${Object.keys(byDay).sort().map(d => `<div class="section-title">${fmtDay(dayStart(d) + 43200000)}</div>
        <div class="list">${byDay[d].map(r => `<div class="list-item res-item st-${r.status}" data-id="${r.id}">
          <div class="res-time"><b class="num">${fmtTime(r.start_at)}</b><span class="muted small">até ${dateStrOf(r.end_at) === d ? fmtTime(r.end_at) : fmtDT(r.end_at)}</span></div>
          <div style="flex:1;min-width:0"><b>Quarto ${esc(r.room_name)}</b> <span class="badge">${BILLING[r.billing_type]}</span>
            ${r.status !== 'agendada' ? `<span class="badge">${RES_STATUS[r.status]}</span>` : r.start_at < Date.now() ? '<span class="badge warn">Atrasada</span>' : ''}
            <div class="muted small ellipsis">${[r.guest_name && esc(r.guest_name), r.guest_phone && esc(r.guest_phone), r.people && r.people + ' pessoa(s)', r.notes && esc(r.notes)].filter(Boolean).join(' · ') || 'Sem nome'}</div></div>
          <span class="muted">›</span></div>`).join('')}</div>`).join('') || '<div class="card muted">Nenhuma reserva no período.</div>'}`;
    $$('.res-item', v).forEach(el => el.onclick = () => reservationActions(list.find(r => r.id === +el.dataset.id), draw));
  };
  v.innerHTML = `<div class="toolbar">
      <div class="row wrap grow">
        <input type="date" id="rfrom" value="${resState.from}" aria-label="A partir de" style="width:auto">
        <div class="seg">${[[1, 'Dia'], [7, '7 dias'], [30, '30 dias']].map(([n, l]) => `<button data-days="${n}" class="${resState.days === n ? 'on' : ''}">${l}</button>`).join('')}</div>
        <label class="row small muted" style="gap:6px"><input type="checkbox" id="rall" style="width:auto;min-height:0" ${resState.showAll ? 'checked' : ''}> Mostrar canceladas e iniciadas</label>
      </div>
      <button class="btn primary" id="newres">+ Nova reserva</button>
    </div><div id="rlist"><p class="muted">Carregando…</p></div>`;
  $('#rfrom', v).onchange = e => { resState.from = e.target.value || todayStr(); draw(); };
  $$('[data-days]', v).forEach(b => b.onclick = () => { resState.days = +b.dataset.days; $$('[data-days]', v).forEach(x => x.classList.toggle('on', x === b)); draw(); });
  $('#rall', v).onchange = e => { resState.showAll = e.target.checked; draw(); };
  $('#newres', v).onclick = () => reservationForm(null, {}, draw);
  if (!S.rooms.length || S.rooms[0]?.company_id !== S.company.id) await run(loadCompanyData);
  draw();
}

function reservationActions(r, after) {
  const open = r.status === 'agendada';
  const room = S.rooms.find(x => x.id === r.room_id);
  const m = modal({ title: `Reserva · Quarto ${esc(r.room_name)}`, body: `<div class="stack">
      <div class="totals">
        <div class="row"><span>Início</span><b>${fmtDT(r.start_at)}</b></div>
        <div class="row"><span>Fim previsto</span><b>${fmtDT(r.end_at)}</b></div>
        <div class="row"><span>Cobrança</span><b>${BILLING[r.billing_type]}${r.hours ? ` · ${r.hours}h` : ''}${r.days ? ` · ${r.days} diária(s)` : ''}</b></div>
        <div class="row"><span>Situação</span><b>${RES_STATUS[r.status]}</b></div>
      </div>
      <div class="small">${[r.guest_name && `<b>${esc(r.guest_name)}</b>`, r.guest_phone && esc(r.guest_phone), r.people && r.people + ' pessoa(s)'].filter(Boolean).join(' · ') || '<span class="muted">Sem nome</span>'}</div>
      ${r.notes ? `<div class="small muted">Obs.: ${esc(r.notes)}</div>` : ''}
      ${open && room && room.status !== 'livre' ? `<div class="notice warn">O quarto está ${STATUS[room.status].toLowerCase()} agora. Libere-o antes de iniciar.</div>` : ''}
      <div class="muted small">Criada por ${esc(r.created_by || '—')}</div></div>`,
    foot: open ? `<button class="btn danger" id="cancel">Cancelar</button><button class="btn" id="noshow">Não veio</button><button class="btn" id="edit">Editar</button><button class="btn primary" id="start">Iniciar</button>`
      : (r.stay_id ? '<button class="btn" data-close>Fechar</button><button class="btn primary" id="stay">Ver estadia</button>' : '<button class="btn" data-close>Fechar</button>') });
  const done = msg => { m.close(); toast(msg); after?.(); reloadRooms().catch(() => {}); };
  $('#start', m.el)?.addEventListener('click', () => run(async () => {
    const res = await api('POST', `/api/reservations/${r.id}/checkin`); done('Estadia iniciada'); openStay(res.stay_id);
  }));
  $('#edit', m.el)?.addEventListener('click', () => { m.close(); reservationForm(r, {}, after); });
  $('#noshow', m.el)?.addEventListener('click', () => run(async () => { await api('POST', `/api/reservations/${r.id}/no-show`); done('Marcada como não compareceu'); }));
  $('#cancel', m.el)?.addEventListener('click', async () => {
    if (!await confirmDialog('Cancelar esta reserva?', 'Cancelar reserva', true)) return;
    run(async () => { await api('POST', `/api/reservations/${r.id}/cancel`, {}); done('Reserva cancelada'); });
  });
  $('#stay', m.el)?.addEventListener('click', () => { m.close(); openStay(r.stay_id); });
}

async function reservationForm(r, preset = {}, after) {
  if (!S.rooms.length || S.rooms[0]?.company_id !== S.company.id) await run(loadCompanyData);
  const c = S.company;
  const nowPlus = Date.now() + 3600000;
  const v = r ? { ...r, date: dateStrOf(r.start_at), time: timeStrOf(r.start_at) }
    : { billing_type: 'hora', date: dateStrOf(nowPlus), time: timeStrOf(nowPlus).slice(0, 3) + '00', room_id: preset.room_id, hours: '', days: 1, people: '' };
  const m = modal({ title: r ? 'Editar reserva' : 'Nova reserva', wide: true, body: `<form id="rf" class="stack">
      <div class="grid2"><label class="field"><span>Data</span><input type="date" name="date" value="${v.date}" required></label>
        <label class="field"><span>Horário de chegada</span><input type="time" name="time" value="${v.time}" required></label></div>
      <div><div class="muted small" style="margin-bottom:6px">Cobrança</div>
        <div class="seg block">${Object.entries(BILLING).map(([k, l]) => `<button type="button" data-bt="${k}" class="${v.billing_type === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="grid2">
        <label class="field" data-only="hora"><span>Horas previstas</span><input type="number" name="hours" min="1" max="72" value="${v.hours ?? ''}" placeholder="mínimo da categoria"></label>
        <label class="field" data-only="diaria"><span>Diárias</span><input type="number" name="days" min="1" max="60" value="${v.days ?? 1}"></label>
        <label class="field" data-only="pernoite"><span>Pernoite</span><input disabled value="${c.overnight_start} às ${c.overnight_end}"></label>
        <label class="field"><span>Pessoas (opcional)</span><input type="number" name="people" min="1" max="50" value="${v.people ?? ''}"></label>
      </div>
      <div><div class="row" style="margin-bottom:6px"><span class="muted small">Quarto</span><span class="spacer"></span><span class="muted small" id="avinfo"></span></div>
        <div class="room-pick" id="rooms"><span class="muted small">Carregando…</span></div></div>
      <div class="grid2"><label class="field"><span>Nome do cliente</span><input name="guest_name" value="${esc(v.guest_name || '')}" autocomplete="off"></label>
        <label class="field"><span>Telefone</span><input name="guest_phone" type="tel" value="${esc(v.guest_phone || '')}" autocomplete="off"></label></div>
      <label class="field"><span>Observação</span><input name="notes" value="${esc(v.notes || '')}" placeholder="Opcional"></label>
    </form>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn primary" id="save">${r ? 'Salvar' : 'Reservar'}</button>` });
  const form = $('#rf', m.el);
  let btype = v.billing_type, roomId = v.room_id, seq = 0;
  const toggle = () => $$('[data-only]', form).forEach(el => el.style.display = el.dataset.only === btype ? '' : 'none');
  const payload = () => {
    const f = formData(form);
    return { ...f, billing_type: btype, room_id: roomId, start_at: f.date && f.time ? localMs(f.date, f.time) : null };
  };
  const loadAv = async () => {
    const p = payload(), my = ++seq;
    if (!p.start_at) return;
    const q = new URLSearchParams({ billing_type: btype, start_at: p.start_at, hours: p.hours || '', days: p.days || '', exclude: r?.id || '' });
    const av = await run(() => api('GET', `/api/companies/${c.id}/availability?${q}`));
    if (!av || my !== seq) return;
    const people = +p.people || 0;
    const byId = Object.fromEntries(av.map(a => [a.room_id, a]));
    const anyEnd = av[0]?.end_at;
    $('#avinfo', m.el).textContent = anyEnd ? `até ${fmtDT(anyEnd)}` : '';
    if (roomId && !byId[roomId]?.available) roomId = r && roomId === r.room_id ? roomId : null;
    $('#rooms', m.el).innerHTML = S.rooms.map(x => {
      const a = byId[x.id] || {}, small = people && x.capacity && x.capacity < people;
      return `<button type="button" class="pick ${roomId === x.id ? 'on' : ''}" data-room="${x.id}" ${a.available ? '' : 'disabled'} title="${a.conflict ? 'Reservado ' + fmtDT(a.conflict.start_at) + ' a ' + fmtDT(a.conflict.end_at) : ''}">
        <b>${esc(x.name)}</b><span class="muted small">${esc(x.category_name)}${x.capacity ? ' · ' + x.capacity + 'p' : ''}</span>
        ${a.available ? (small ? '<span class="small warn-t">Pequeno</span>' : '') : '<span class="small busy-t">Reservado</span>'}</button>`;
    }).join('') || '<span class="muted small">Nenhum quarto cadastrado.</span>';
    $$('[data-room]', m.el).forEach(b => b.onclick = () => { roomId = +b.dataset.room; $$('[data-room]', m.el).forEach(x => x.classList.toggle('on', x === b)); });
  };
  $$('[data-bt]', m.el).forEach(b => b.onclick = () => { btype = b.dataset.bt; $$('[data-bt]', m.el).forEach(x => x.classList.toggle('on', x === b)); toggle(); loadAv(); });
  form.onchange = loadAv;
  toggle(); loadAv();
  $('#save', m.el).onclick = () => run(async () => {
    const p = payload();
    if (!p.room_id) throw new Error('Escolha um quarto disponível');
    if (!p.start_at) throw new Error('Informe data e horário');
    await (r ? api('PUT', `/api/reservations/${r.id}`, p) : api('POST', `/api/companies/${c.id}/reservations`, p));
    m.close(); toast(r ? 'Reserva atualizada' : 'Reserva criada'); after?.(); reloadRooms().catch(() => {});
  });
}

// ---------- Caixa ----------
async function viewCash(v) {
  const data = await run(() => api('GET', `/api/companies/${S.company.id}/cash`));
  if (!data) return;
  const sess = data.session;
  if (!sess) {
    v.innerHTML = `<div class="card stack cash-closed">
        <div><h2 style="font-size:20px">Caixa fechado</h2>
        <p class="muted small">Abra o caixa no começo do turno informando o troco que está na gaveta. Contas fechadas e lançamentos ficam ligados ao turno.</p>
        ${data.last_closed ? `<p class="muted small">Último fechamento: ${fmtDT(data.last_closed.closed_at)} · contado ${brl(data.last_closed.counted_cash)}</p>` : ''}</div>
        <form id="open" class="row wrap"><label class="field grow"><span>Troco inicial (R$)</span><input name="opening_amount" type="number" step="0.01" min="0" inputmode="decimal" value="${data.last_closed?.counted_cash ?? 0}"></label>
          <button class="btn primary" style="align-self:flex-end">Abrir caixa</button></form>
      </div>
      <div id="manual" class="actions" style="margin-top:14px"><button class="btn" data-new="entrada">+ Entrada</button><button class="btn" data-new="saida">+ Despesa</button></div>
      <div class="section-title">Turnos anteriores</div><div id="sessions"></div>`;
    $('#open', v).onsubmit = e => { e.preventDefault(); run(async () => { await api('POST', `/api/companies/${S.company.id}/cash`, formData(e.target)); toast('Caixa aberto'); viewCash(v); }); };
  } else {
    const cash = sess.by_payment['Dinheiro'] || { entradas: 0, saidas: 0 };
    v.innerHTML = `<div class="toolbar"><div class="grow"><h2 style="font-size:20px">Caixa aberto</h2>
        <div class="muted small">Desde ${fmtDT(sess.opened_at)} por ${esc(sess.opened_by || '—')}</div></div>
        <button class="btn primary" id="close">Fechar caixa</button></div>
      <div class="kpis">
        <div class="card kpi"><div class="muted small">Troco inicial</div><div class="v num">${brl(sess.opening_amount)}</div></div>
        <div class="card kpi"><div class="muted small">Entradas</div><div class="v num in-t">${brl(sess.entradas)}</div></div>
        <div class="card kpi"><div class="muted small">Saídas</div><div class="v num out-t">${brl(sess.saidas)}</div></div>
        <div class="card kpi"><div class="muted small">Dinheiro na gaveta</div><div class="v num">${brl(sess.expected_cash)}</div><div class="muted small">+${brl(cash.entradas)} / −${brl(cash.saidas)}</div></div>
      </div>
      ${Object.keys(sess.by_payment).length ? `<div class="chips">${Object.entries(sess.by_payment).map(([k, val]) => `<span class="chip static">${esc(k)}: <b class="num">${brl(val.entradas - val.saidas)}</b></span>`).join('')}</div>` : ''}
      <div class="actions" id="manual"><button class="btn" data-new="entrada">+ Entrada</button><button class="btn" data-new="saida">+ Despesa</button>
        <button class="btn" data-new="Sangria">Sangria</button><button class="btn" data-new="Suprimento">Suprimento</button></div>
      <div class="section-title">Lançamentos do turno</div>
      <div class="list">${sess.entries.map(entryRow).join('') || '<p class="muted">Nenhum lançamento ainda.</p>'}</div>
      <div class="section-title">Turnos anteriores</div><div id="sessions"></div>`;
    $('#close', v).onclick = () => closeCashForm(sess, () => viewCash(v));
    bindEntryRows(v, sess.entries, () => viewCash(v));
  }
  $$('[data-new]', v).forEach(b => b.onclick = () => entryForm(b.dataset.new, () => viewCash(v)));
  const hist = await run(() => api('GET', `/api/companies/${S.company.id}/cash/sessions?from=${Date.now() - 30 * 86400000}`)) || [];
  const closed = hist.filter(x => x.closed_at);
  const box = $('#sessions', v);
  if (!box) return;
  box.innerHTML = `<div class="list">${closed.map(x => `<div class="list-item" data-sess="${x.id}">
      <div style="flex:1;min-width:0"><b>${fmtDT(x.opened_at)} → ${fmtDT(x.closed_at)}</b>
        <div class="muted small">${esc(x.opened_by || '')}${x.closed_by && x.closed_by !== x.opened_by ? ' / ' + esc(x.closed_by) : ''} · entradas ${brl(x.entradas)} · saídas ${brl(x.saidas)}</div></div>
      ${diffBadge(x.difference)}</div>`).join('') || '<p class="muted small">Nenhum turno fechado nos últimos 30 dias.</p>'}</div>`;
  $$('[data-sess]', box).forEach(el => el.onclick = () => sessionDetail(+el.dataset.sess));
}
function diffBadge(d) {
  if (d === null || d === undefined) return '';
  return Math.abs(d) < 0.005 ? '<span class="badge ok">Conferido</span>' : `<span class="badge ${d < 0 ? 'bad' : 'warn'}">${d < 0 ? 'Falta' : 'Sobra'} ${brl(Math.abs(d))}</span>`;
}
function entryRow(e) {
  return `<div class="list-item entry ${e.cancelled ? 'cancelled' : ''}" data-entry="${e.id}">
    <span class="kind ${e.kind}">${e.kind === 'entrada' ? '+' : '−'}</span>
    <div style="flex:1;min-width:0"><b>${esc(e.category)}</b>${e.cancelled ? ' <span class="badge">Estornado</span>' : ''}
      <div class="muted small ellipsis">${fmtDT(e.occurred_at)}${e.description ? ' · ' + esc(e.description) : ''}${e.payment_method ? ' · ' + esc(e.payment_method) : ''}${e.created_by ? ' · ' + esc(e.created_by) : ''}</div></div>
    <b class="num ${e.kind === 'entrada' ? 'in-t' : 'out-t'}">${brl(e.amount)}</b></div>`;
}
function bindEntryRows(root, entries, after) {
  $$('[data-entry]', root).forEach(el => el.onclick = () => {
    const e = entries.find(x => x.id === +el.dataset.entry);
    if (e.stay_id) return openStay(e.stay_id);
    if (e.cancelled) return;
    confirmDialog(`Estornar o lançamento "${esc(e.category)}" de ${brl(e.amount)}?`, 'Estornar', true).then(ok => ok && run(async () => {
      await api('POST', `/api/cash/entries/${e.id}/cancel`); toast('Lançamento estornado'); after();
    }));
  });
}
function entryForm(type, after) {
  const transfer = type === 'Sangria' || type === 'Suprimento';
  const kind = type === 'Sangria' || type === 'saida' ? 'saida' : 'entrada';
  const cats = kind === 'entrada' ? INCOME_CATS : EXPENSE_CATS;
  const title = transfer ? type : kind === 'entrada' ? 'Nova entrada' : 'Nova despesa';
  const m = modal({ title, body: `<form id="ef" class="stack">
      ${transfer ? `<p class="muted small">${type === 'Sangria' ? 'Retirada de dinheiro da gaveta (ex.: levar para o cofre).' : 'Dinheiro colocado na gaveta (ex.: reforço de troco).'} Não conta como despesa nem receita.</p>`
        : `<label class="field"><span>Categoria</span><input name="category" list="cats" value="${cats[0]}" required><datalist id="cats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>`}
      <label class="field"><span>Valor (R$)</span><input name="amount" type="number" step="0.01" min="0.01" inputmode="decimal" required autofocus></label>
      ${transfer ? '' : `<div><div class="muted small" style="margin-bottom:6px">Forma de pagamento</div><div class="pay">${PAYMENTS.map((p, i) => `<button type="button" class="choice ${i === 0 ? 'on' : ''}" data-pay="${esc(p)}"><b style="font-size:14px">${p}</b></button>`).join('')}</div></div>
        <label class="field"><span>Data</span><input type="datetime-local" name="when" value="${dateStrOf(Date.now())}T${timeStrOf(Date.now())}"></label>`}
      <label class="field"><span>Descrição</span><input name="description" placeholder="Opcional"></label>
    </form>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn primary" id="save">Lançar</button>` });
  let pay = PAYMENTS[0];
  $$('[data-pay]', m.el).forEach(b => b.onclick = () => { pay = b.dataset.pay; $$('[data-pay]', m.el).forEach(x => x.classList.toggle('on', x === b)); });
  $('#save', m.el).onclick = () => run(async () => {
    const f = formData($('#ef', m.el));
    const body = { kind, category: transfer ? type : f.category, amount: f.amount, description: f.description, payment_method: transfer ? 'Dinheiro' : pay };
    if (f.when && f.when !== `${dateStrOf(Date.now())}T${timeStrOf(Date.now())}`) body.occurred_at = localMs(f.when.slice(0, 10), f.when.slice(11, 16));
    await api('POST', `/api/companies/${S.company.id}/cash/entries`, body);
    m.close(); toast('Lançamento registrado'); after();
  });
}
function closeCashForm(sess, after) {
  const m = modal({ title: 'Fechar caixa', body: `<form id="cf" class="stack">
      <div class="totals">
        <div class="row"><span>Troco inicial</span><span class="num">${brl(sess.opening_amount)}</span></div>
        ${Object.entries(sess.by_payment).map(([k, val]) => `<div class="row"><span>${esc(k)}</span><span class="num">${brl(val.entradas - val.saidas)}</span></div>`).join('')}
        <div class="row grand"><span>Dinheiro esperado</span><span class="num">${brl(sess.expected_cash)}</span></div>
      </div>
      <label class="field"><span>Dinheiro contado na gaveta (R$)</span><input name="counted_cash" type="number" step="0.01" min="0" inputmode="decimal" required></label>
      <div id="diff"></div>
      <label class="field"><span>Observação</span><input name="notes" placeholder="Opcional"></label>
    </form>`,
    foot: `<button class="btn" data-close>Voltar</button><button class="btn primary" id="save">Fechar caixa</button>` });
  const form = $('#cf', m.el);
  form.oninput = () => { const c = formData(form).counted_cash; $('#diff', m.el).innerHTML = c === '' ? '' : diffBadge(Math.round((+c - sess.expected_cash) * 100) / 100); };
  $('#save', m.el).onclick = () => run(async () => {
    if (formData(form).counted_cash === '') throw new Error('Informe o dinheiro contado');
    const done = await api('POST', `/api/cash/sessions/${sess.id}/close`, formData(form));
    m.close(); toast('Caixa fechado'); after(); sessionDetail(done.id, done);
  });
}
async function sessionDetail(id, data) {
  const x = data || await run(() => api('GET', `/api/cash/sessions/${id}`));
  if (!x) return;
  const m = modal({ title: 'Turno de caixa', wide: true, body: `<div class="stack print-area" id="sessprint">
      <div class="report-head"><b>${esc(S.company.name)}</b> · Turno de caixa<br><span class="muted small">${fmtDT(x.opened_at)} → ${x.closed_at ? fmtDT(x.closed_at) : 'aberto'}</span></div>
      <div class="totals">
        <div class="row"><span>Aberto por</span><span>${esc(x.opened_by || '—')}</span></div>
        ${x.closed_by ? `<div class="row"><span>Fechado por</span><span>${esc(x.closed_by)}</span></div>` : ''}
        <div class="row"><span>Troco inicial</span><span class="num">${brl(x.opening_amount)}</span></div>
        <div class="row"><span>Entradas</span><span class="num">${brl(x.entradas)}</span></div>
        <div class="row"><span>Saídas</span><span class="num">${brl(x.saidas)}</span></div>
        ${Object.entries(x.by_payment).map(([k, val]) => `<div class="row small"><span>· ${esc(k)}</span><span class="num">${brl(val.entradas - val.saidas)}</span></div>`).join('')}
        <div class="row"><span>Dinheiro esperado</span><span class="num">${brl(x.expected_cash)}</span></div>
        ${x.counted_cash !== null ? `<div class="row grand"><span>Contado</span><span class="num">${brl(x.counted_cash)}</span></div><div class="row"><span></span>${diffBadge(x.difference)}</div>` : ''}
      </div>
      ${x.notes ? `<div class="small">Obs.: ${esc(x.notes)}</div>` : ''}
      <div class="section-title">Lançamentos</div><div class="list">${x.entries.map(entryRow).join('') || '<p class="muted small">Nenhum.</p>'}</div>
    </div>`, foot: `<button class="btn" data-close>Fechar</button><button class="btn primary" id="print">Imprimir</button>` });
  $('#print', m.el).onclick = () => printArea($('#sessprint', m.el));
}
function printArea(el) {
  document.body.classList.add('printing-area'); el.classList.add('print-now');
  window.print();
  setTimeout(() => { document.body.classList.remove('printing-area'); el.classList.remove('print-now'); }, 500);
}

// ---------- Relatórios ----------
let repRange = null;
function presetRange(k) {
  const t = todayStr();
  if (k === 'hoje') return { from: t, to: t };
  if (k === 'ontem') return { from: addDays(t, -1), to: addDays(t, -1) };
  if (k === '7') return { from: addDays(t, -6), to: t };
  if (k === 'mes') return { from: monthStart(t), to: t };
  if (k === 'mespassado') { const end = addDays(monthStart(t), -1); return { from: monthStart(end), to: end }; }
}
async function viewReports(v) {
  repRange ??= { ...presetRange('hoje'), preset: 'hoje' };
  v.innerHTML = `<div class="card toolbar-card" style="margin-bottom:14px"><form id="rf" class="row wrap">
      <div class="seg wrap">${[['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7', '7 dias'], ['mes', 'Este mês'], ['mespassado', 'Mês passado']].map(([k, l]) => `<button type="button" data-p="${k}" class="${repRange.preset === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="row grow" style="min-width:260px"><label class="field grow"><span>De</span><input type="date" name="from" value="${repRange.from}"></label>
        <label class="field grow"><span>Até</span><input type="date" name="to" value="${repRange.to}"></label></div>
      <div class="row" style="align-self:flex-end"><button type="button" class="btn sm" id="csv">Exportar CSV</button><button type="button" class="btn sm" id="print">Imprimir</button></div>
    </form></div><div id="rres" class="print-area"><p class="muted">Carregando…</p></div>`;
  const form = $('#rf', v);
  let last = null;
  const load = () => run(async () => {
    const f = formData(form);
    repRange = { ...repRange, from: f.from, to: f.to };
    const from = dayStart(f.from), to = dayStart(f.to) + 86400000 - 1;
    const d = last = await api('GET', `/api/companies/${S.company.id}/report?from=${from}&to=${to}`);
    $('#rres', v).innerHTML = reportHTML(d, f);
    $$('[data-stay]', v).forEach(el => el.onclick = () => openStay(+el.dataset.stay));
  });
  form.onchange = () => { repRange.preset = null; $$('[data-p]', form).forEach(x => x.classList.remove('on')); load(); };
  $$('[data-p]', form).forEach(b => b.onclick = () => {
    Object.assign(repRange, presetRange(b.dataset.p), { preset: b.dataset.p });
    form.from.value = repRange.from; form.to.value = repRange.to;
    $$('[data-p]', form).forEach(x => x.classList.toggle('on', x === b)); load();
  });
  $('#print', v).onclick = () => printArea($('#rres', v));
  $('#csv', v).onclick = () => run(async () => {
    const from = dayStart(repRange.from), to = dayStart(repRange.to) + 86400000 - 1;
    const rows = await api('GET', `/api/companies/${S.company.id}/cash/entries?from=${from}&to=${to}`);
    const n = v => (+v).toFixed(2).replace('.', ',');
    downloadCSV(`fluxo-de-caixa_${repRange.from}_${repRange.to}.csv`, [['Data', 'Tipo', 'Categoria', 'Descrição', 'Forma de pagamento', 'Valor', 'Usuário', 'Situação'],
      ...rows.reverse().map(e => [fmtDT(e.occurred_at, { year: 'numeric' }), e.kind === 'entrada' ? 'Entrada' : 'Saída', e.category, e.description || '', e.payment_method || '',
        (e.kind === 'saida' ? '-' : '') + n(e.amount), e.created_by || '', e.cancelled ? 'Estornado' : ''])]);
  });
  load();
}
function bars(daily) {
  if (daily.length < 2) return '';
  const max = Math.max(1, ...daily.map(d => Math.max(d.entradas, d.saidas)));
  return `<div class="card"><div class="row"><b>Entradas e saídas por dia</b><span class="spacer"></span>
      <span class="legend"><i class="in"></i>Entradas</span><span class="legend"><i class="out"></i>Saídas</span></div>
    <div class="bars" style="--n:${daily.length}">${daily.map(d => `<div class="bar-col" title="${d.date.split('-').reverse().join('/')}: entradas ${brl(d.entradas)}, saídas ${brl(d.saidas)}">
      <div class="bar-pair"><span class="b in" style="height:${d.entradas / max * 100}%"></span><span class="b out" style="height:${d.saidas / max * 100}%"></span></div>
      <span class="bar-l">${daily.length <= 16 || +d.date.slice(8) % 5 === 1 ? d.date.slice(8) : ''}</span></div>`).join('')}</div></div>`;
}
function table(title, head, rows, empty = 'Sem dados no período.') {
  return `<div class="card"><b>${title}</b>${rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr>${head.map((h, i) => `<th class="${i ? 'right' : ''}">${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${i ? 'right num' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : `<p class="muted small">${empty}</p>`}</div>`;
}
function reportHTML(d, f) {
  const t = d.totals, st = d.stays;
  const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';
  return `<div class="report-head print-only"><b>${esc(S.company.name)}</b> · Relatório de ${f.from.split('-').reverse().join('/')} a ${f.to.split('-').reverse().join('/')}</div>
    <div class="kpis">
      <div class="card kpi"><div class="muted small">Entradas</div><div class="v num in-t">${brl(t.entradas)}</div></div>
      <div class="card kpi"><div class="muted small">Saídas</div><div class="v num out-t">${brl(t.saidas)}</div></div>
      <div class="card kpi"><div class="muted small">Saldo</div><div class="v num">${brl(t.saldo)}</div></div>
      <div class="card kpi"><div class="muted small">Estadias</div><div class="v num">${st.count}</div><div class="muted small">ticket médio ${brl(st.ticket)}</div></div>
      <div class="card kpi"><div class="muted small">Hospedagem</div><div class="v num">${brl(st.room_amount)}</div><div class="muted small">${pct(st.room_amount, st.room_amount + st.items_amount)} do faturado</div></div>
      <div class="card kpi"><div class="muted small">Consumo</div><div class="v num">${brl(st.items_amount)}</div><div class="muted small">${pct(st.items_amount, st.room_amount + st.items_amount)} do faturado</div></div>
    </div>
    ${(st.discount || st.surcharge || st.cancelled) ? `<p class="muted small">Descontos ${brl(st.discount)} · acréscimos ${brl(st.surcharge)} · ${st.cancelled} estadia(s) cancelada(s)</p>` : ''}
    <div class="report-grid">
      ${bars(d.daily)}
      ${table('Entradas por forma de pagamento', ['Forma', 'Valor', '%'], d.income_by_payment.map(x => [esc(x.name), brl(x.total), pct(x.total, t.entradas)]))}
      ${table('Por tipo de cobrança', ['Cobrança', 'Estadias', 'Hospedagem', 'Total'], d.by_billing.filter(x => x.count).map(x => [x.name, x.count, brl(x.room_amount), brl(x.total)]))}
      ${table('Despesas por categoria', ['Categoria', 'Valor', '%'], d.expense_by_category.map(x => [esc(x.name), brl(x.total), pct(x.total, t.saidas)]), 'Nenhuma despesa lançada.')}
      ${table('Entradas por categoria', ['Categoria', 'Valor'], d.income_by_category.map(x => [esc(x.name), brl(x.total)]))}
      ${table('Por quarto', ['Quarto', 'Estadias', 'Tempo', 'Hospedagem', 'Consumo', 'Total'], d.by_room.map(x => [esc(x.name), x.count, fmtDur(x.minutes * 60000), brl(x.room_amount), brl(x.items_amount), brl(x.total)]))}
      ${table('Produtos vendidos', ['Produto', 'Qtd.', 'Total'], d.by_product.map(x => [esc(x.name), +x.qty, brl(x.total)]), 'Nenhum consumo no período.')}
      ${Object.keys(d.reservations).length ? table('Reservas no período', ['Situação', 'Qtd.'], Object.entries(d.reservations).map(([k, n]) => [RES_STATUS[k], n])) : ''}
    </div>
    <div class="section-title">Estadias encerradas</div>
    <div class="list">${d.stay_rows.map(r => `<div class="list-item" data-stay="${r.id}">
        <div style="flex:1;min-width:0"><b>Quarto ${esc(r.room_name)}</b> <span class="badge">${BILLING[r.billing_type]}</span> ${r.status === 'cancelada' ? '<span class="badge bad">Cancelada</span>' : ''}
          <div class="muted small ellipsis">${fmtDT(r.check_in)} → ${fmtDT(r.check_out)}${r.guest_name ? ' · ' + esc(r.guest_name) : ''}${r.payment_method ? ' · ' + esc(r.payment_method) : ''}</div></div>
        <b class="num">${brl(r.total)}</b></div>`).join('') || '<p class="muted">Nenhuma estadia encerrada no período.</p>'}</div>`;
}

// ---------- Configurações ----------
async function viewConfig(v) {
  await run(loadCompanyData);
  const tabs = [['empresa', 'Empresa e horários'], ['precos', 'Categorias e preços'], ['quartos', 'Quartos'], ['produtos', 'Produtos']];
  if (isAdmin()) tabs.push(['usuarios', 'Usuários'], ['empresas', 'Empresas']);
  if (!tabs.some(t => t[0] === S.configTab)) S.configTab = 'empresa';
  v.innerHTML = `<div class="subtabs">${tabs.map(([k, l]) => `<button data-ct="${k}" class="${S.configTab === k ? 'active' : ''}">${l}</button>`).join('')}</div>
    <div id="cfg"></div>`;
  $$('[data-ct]', v).forEach(b => b.onclick = () => { S.configTab = b.dataset.ct; viewConfig(v); });
  const c = $('#cfg', v);
  ({ empresa: cfgCompany, precos: cfgCategories, quartos: cfgRooms, produtos: cfgProducts, usuarios: cfgUsers, empresas: cfgCompanies })[S.configTab](c);
}
const adminOnly = () => isAdmin() ? '' : 'disabled title="Somente o administrador do sistema altera"';

function companyFieldsHTML(co) {
  return `<label class="field"><span>Nome da empresa</span><input name="name" value="${esc(co.name)}" required ${adminOnly()}></label>
    <div class="section-title">Pernoite</div>
    <div class="grid2"><label class="field"><span>Começa às</span><input type="time" name="overnight_start" value="${co.overnight_start}"></label>
      <label class="field"><span>Termina às</span><input type="time" name="overnight_end" value="${co.overnight_end}"></label></div>
    <div class="section-title">Diária</div>
    <div class="grid2"><label class="field"><span>Entrada a partir de</span><input type="time" name="daily_start" value="${co.daily_start}"></label>
      <label class="field"><span>Saída até</span><input type="time" name="daily_end" value="${co.daily_end}"></label></div>
    <div class="section-title">Outros</div>
    <div class="grid2"><label class="field"><span>Tolerância (minutos)</span><input type="number" min="0" name="tolerance_min" value="${co.tolerance_min}"></label>
      <label class="field"><span>Fuso horário</span><input name="timezone" value="${esc(co.timezone)}" ${adminOnly()}></label></div>
    <p class="muted small">A tolerância vale para frações de hora, saída após o pernoite e saída após o horário da diária.</p>`;
}
function cfgCompany(c) {
  const co = S.company;
  c.innerHTML = `<form class="card stack" id="cf">${companyFieldsHTML(co)}<button class="btn primary">Salvar</button></form>`;
  $('#cf', c).onsubmit = e => { e.preventDefault(); run(async () => {
    const upd = await api('PUT', `/api/companies/${co.id}`, formData(e.target));
    Object.assign(co, upd); toast('Empresa salva'); render();
  }); };
}
function companyForm() {
  const m = modal({ title: 'Nova empresa', body: `<form id="nf" class="stack">${companyFieldsHTML({ name: '', overnight_start: '20:00', overnight_end: '12:00', daily_start: '12:00', daily_end: '12:00', tolerance_min: 15, timezone: 'America/Sao_Paulo' })}</form>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn primary" id="save">Criar</button>` });
  $('#save', m.el).onclick = () => run(async () => {
    const co = await api('POST', '/api/companies', formData($('#nf', m.el)));
    m.close(); await loadCompanies(); S.company = S.companies.find(x => x.id === co.id); localStorage.setItem('companyId', co.id);
    toast('Empresa criada. Configure preços e quartos.'); S.tab = 'config'; S.configTab = 'precos'; render();
  });
}
function cfgCompanies(c) {
  c.innerHTML = `<div class="row" style="margin-bottom:10px"><span class="spacer"></span><button class="btn primary" id="add">+ Nova empresa</button></div>
    <div class="list">${S.companies.map(co => `<div class="list-item" data-id="${co.id}"><b style="flex:1">${esc(co.name)}</b><span class="muted small">${co.id === S.company.id ? 'selecionada' : 'abrir'}</span></div>`).join('')}</div>`;
  $('#add', c).onclick = companyForm;
  $$('.list-item', c).forEach(el => el.onclick = () => { S.company = S.companies.find(x => x.id === +el.dataset.id); localStorage.setItem('companyId', S.company.id); S.configTab = 'empresa'; render(); });
}

function cfgCategories(c) {
  c.innerHTML = `<p class="muted small" style="margin-top:0">Cada quarto pertence a uma categoria. Os preços de hora, pernoite e diária são definidos por categoria. Mudanças valem para as próximas estadias.</p>
    <div class="row" style="margin-bottom:10px"><span class="spacer"></span><button class="btn primary" id="add">+ Nova categoria</button></div>
    <div class="list">${S.categories.map(k => `<div class="list-item" data-id="${k.id}"><div style="flex:1"><b>${esc(k.name)}</b>
      <div class="muted small num">Hora ${brl(k.hour_price)} (mín. ${k.hour_min_hours}h, adicional ${brl(k.extra_hour_price ?? k.hour_price)}) · Pernoite ${brl(k.overnight_price)} · Diária ${brl(k.daily_price)}</div></div></div>`).join('')}</div>`;
  $('#add', c)?.addEventListener('click', () => categoryForm());
  $$('.list-item', c).forEach(el => el.onclick = () => categoryForm(S.categories.find(k => k.id === +el.dataset.id)));
}
function categoryForm(k) {
  const v = k || { name: '', hour_price: 0, hour_min_hours: 1, extra_hour_price: '', overnight_price: 0, daily_price: 0 };
  const m = modal({ title: k ? 'Editar categoria' : 'Nova categoria', body: `<form id="kf" class="stack">
      <label class="field"><span>Nome</span><input name="name" value="${esc(v.name)}" placeholder="Ex.: Standard, Luxo, Suíte" required></label>
      <div class="section-title">Por hora</div>
      <div class="grid3"><label class="field"><span>Preço da hora</span><input name="hour_price" type="number" step="0.01" min="0" inputmode="decimal" value="${v.hour_price}"></label>
        <label class="field"><span>Mínimo de horas</span><input name="hour_min_hours" type="number" min="1" value="${v.hour_min_hours}"></label>
        <label class="field"><span>Hora adicional</span><input name="extra_hour_price" type="number" step="0.01" min="0" inputmode="decimal" value="${v.extra_hour_price ?? ''}" placeholder="= hora"></label></div>
      <p class="muted small">A hora adicional é usada nas horas excedentes do pernoite. Em branco, usa o preço da hora.</p>
      <div class="grid2"><label class="field"><span>Pernoite</span><input name="overnight_price" type="number" step="0.01" min="0" inputmode="decimal" value="${v.overnight_price}"></label>
        <label class="field"><span>Diária</span><input name="daily_price" type="number" step="0.01" min="0" inputmode="decimal" value="${v.daily_price}"></label></div>
    </form>`,
    foot: `${k ? '<button class="btn danger" id="del">Excluir</button>' : '<button class="btn" data-close>Cancelar</button>'}<button class="btn primary" id="save">Salvar</button>` });
  $('#save', m.el)?.addEventListener('click', () => run(async () => {
    const f = formData($('#kf', m.el));
    await (k ? api('PUT', `/api/categories/${k.id}`, f) : api('POST', `/api/companies/${S.company.id}/categories`, f));
    m.close(); toast('Categoria salva'); viewConfig($('#view'));
  }));
  $('#del', m.el)?.addEventListener('click', async () => {
    if (!await confirmDialog(`Excluir a categoria ${esc(k.name)}?`, 'Excluir', true)) return;
    run(async () => { await api('DELETE', `/api/categories/${k.id}`); m.close(); toast('Categoria excluída'); viewConfig($('#view')); });
  });
}

function cfgRooms(c) {
  c.innerHTML = `<div class="row" style="margin-bottom:10px"><span class="spacer"></span><button class="btn" id="bulk">+ Vários</button><button class="btn primary" id="add">+ Novo quarto</button></div>
    <div class="list">${S.rooms.map(r => `<div class="list-item" data-id="${r.id}"><b style="min-width:60px">${esc(r.name)}</b><span style="flex:1;min-width:0" class="muted ellipsis">${esc(r.category_name)}${r.capacity ? ` · ${r.capacity} ${r.capacity > 1 ? 'pessoas' : 'pessoa'}` : ''}</span><span class="badge">${STATUS[r.status]}</span></div>`).join('') || '<p class="muted">Nenhum quarto.</p>'}</div>`;
  $('#add', c)?.addEventListener('click', () => roomForm());
  $('#bulk', c)?.addEventListener('click', bulkRooms);
  $$('.list-item', c).forEach(el => el.onclick = () => roomForm(S.rooms.find(r => r.id === +el.dataset.id)));
}
const capOptions = sel => `<option value="">Não informar</option>${[1, 2, 3, 4, 5, 6, 8, 10].concat(sel && ![1, 2, 3, 4, 5, 6, 8, 10].includes(sel) ? [sel] : []).sort((a, b) => a - b)
  .map(n => `<option value="${n}" ${n === sel ? 'selected' : ''}>${n} ${n > 1 ? 'pessoas' : 'pessoa'}</option>`).join('')}`;
const catOptions = sel => S.categories.map(k => `<option value="${k.id}" ${k.id === sel ? 'selected' : ''}>${esc(k.name)}</option>`).join('');
function roomForm(r) {
  const m = modal({ title: r ? `Quarto ${esc(r.name)}` : 'Novo quarto', body: `<form id="rf" class="stack">
      <label class="field"><span>Nome / número</span><input name="name" value="${esc(r?.name || '')}" required></label>
      <div class="grid2"><label class="field"><span>Categoria</span><select name="category_id">${catOptions(r?.category_id)}</select></label>
        <label class="field"><span>Capacidade (opcional)</span><select name="capacity">${capOptions(r?.capacity)}</select></label></div></form>`,
    foot: `${r ? '<button class="btn danger" id="del">Remover</button>' : '<button class="btn" data-close>Cancelar</button>'}<button class="btn primary" id="save">Salvar</button>` });
  $('#save', m.el).onclick = () => run(async () => {
    const f = formData($('#rf', m.el));
    await (r ? api('PUT', `/api/rooms/${r.id}`, f) : api('POST', `/api/companies/${S.company.id}/rooms`, f));
    m.close(); toast('Quarto salvo'); viewConfig($('#view'));
  });
  $('#del', m.el)?.addEventListener('click', async () => {
    if (!await confirmDialog(`Remover o quarto ${esc(r.name)}? O histórico é mantido.`, 'Remover', true)) return;
    run(async () => { await api('DELETE', `/api/rooms/${r.id}`); m.close(); toast('Quarto removido'); viewConfig($('#view')); });
  });
}
function bulkRooms() {
  const m = modal({ title: 'Cadastrar vários quartos', body: `<form id="bf" class="stack">
      <div class="grid3"><label class="field"><span>Do número</span><input name="from" type="number" value="1"></label>
        <label class="field"><span>Até</span><input name="to" type="number" value="10"></label>
        <label class="field"><span>Prefixo</span><input name="prefix" placeholder="opcional"></label></div>
      <div class="grid2"><label class="field"><span>Categoria</span><select name="category_id">${catOptions()}</select></label>
        <label class="field"><span>Capacidade (opcional)</span><select name="capacity">${capOptions()}</select></label></div></form>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn primary" id="save">Criar</button>` });
  $('#save', m.el).onclick = () => run(async () => {
    const f = formData($('#bf', m.el)); const a = +f.from, b = +f.to;
    if (!(b >= a) || b - a > 300) throw new Error('Intervalo inválido');
    for (let i = a; i <= b; i++) await api('POST', `/api/companies/${S.company.id}/rooms`, { name: f.prefix + i, category_id: f.category_id, capacity: f.capacity });
    m.close(); toast(`${b - a + 1} quartos criados`); viewConfig($('#view'));
  });
}

function cfgProducts(c) {
  c.innerHTML = `<div class="row" style="margin-bottom:10px"><span class="spacer"></span><button class="btn primary" id="add">+ Novo produto</button></div>
    <div class="list">${S.products.map(p => `<div class="list-item" data-id="${p.id}"><span style="flex:1">${esc(p.name)}</span><b class="num">${brl(p.price)}</b></div>`).join('') || '<p class="muted">Nenhum produto.</p>'}</div>`;
  $('#add', c)?.addEventListener('click', () => productForm());
  $$('.list-item', c).forEach(el => el.onclick = () => productForm(S.products.find(p => p.id === +el.dataset.id)));
}
function productForm(p) {
  const m = modal({ title: p ? 'Editar produto' : 'Novo produto', body: `<form id="pf" class="stack">
      <label class="field"><span>Nome</span><input name="name" value="${esc(p?.name || '')}" required></label>
      <label class="field"><span>Preço (R$)</span><input name="price" type="number" step="0.01" min="0" inputmode="decimal" value="${p?.price ?? ''}" required></label></form>`,
    foot: `${p ? '<button class="btn danger" id="del">Excluir</button>' : '<button class="btn" data-close>Cancelar</button>'}<button class="btn primary" id="save">Salvar</button>` });
  $('#save', m.el).onclick = () => run(async () => {
    const f = formData($('#pf', m.el));
    await (p ? api('PUT', `/api/products/${p.id}`, f) : api('POST', `/api/companies/${S.company.id}/products`, f));
    m.close(); toast('Produto salvo'); viewConfig($('#view'));
  });
  $('#del', m.el)?.addEventListener('click', async () => {
    if (!await confirmDialog(`Excluir ${esc(p.name)}? Notas antigas não mudam.`, 'Excluir', true)) return;
    run(async () => { await api('DELETE', `/api/products/${p.id}`); m.close(); toast('Produto excluído'); viewConfig($('#view')); });
  });
}

async function cfgUsers(c) {
  const users = await run(() => api('GET', '/api/users')) || [];
  const coName = id => S.companies.find(x => x.id === id)?.name || '—';
  c.innerHTML = `<div class="row" style="margin-bottom:10px"><span class="spacer"></span><button class="btn primary" id="add">+ Novo usuário</button></div>
    <div class="list">${users.map(u => `<div class="list-item" data-id="${u.id}" style="${u.active ? '' : 'opacity:.5'}"><div style="flex:1"><b>${esc(u.name)}</b> <span class="muted small">@${esc(u.username)}</span>
      <div class="muted small">${ROLES[u.role]}${u.role !== 'admin' ? ' · ' + esc(coName(u.company_id)) : ''}${u.active ? '' : ' · inativo'}</div></div></div>`).join('')}</div>`;
  $('#add', c).onclick = () => userForm();
  $$('.list-item', c).forEach(el => el.onclick = () => userForm(users.find(u => u.id === +el.dataset.id)));
}
function userForm(u) {
  const roles = ['usuario', 'admin'];
  const m = modal({ title: u ? 'Editar usuário' : 'Novo usuário', body: `<form id="uf" class="stack">
      <label class="field"><span>Nome</span><input name="name" value="${esc(u?.name || '')}" required></label>
      <label class="field"><span>Usuário (login)</span><input name="username" value="${esc(u?.username || '')}" autocapitalize="none" required></label>
      <label class="field"><span>${u ? 'Nova senha (deixe em branco para manter)' : 'Senha'}</span><input name="password" type="password" minlength="4" ${u ? '' : 'required'}></label>
      <div class="grid2"><label class="field"><span>Perfil</span><select name="role">${roles.map(r => `<option value="${r}" ${u?.role === r ? 'selected' : ''}>${ROLES[r]}</option>`).join('')}</select></label>
        <label class="field"><span>Empresa</span><select name="company_id">${S.companies.map(co => `<option value="${co.id}" ${(u?.company_id ?? S.company.id) === co.id ? 'selected' : ''}>${esc(co.name)}</option>`).join('')}</select></label></div>
      ${u ? `<label class="row"><input type="checkbox" name="active" style="width:auto;min-height:0" ${u.active ? 'checked' : ''}> Ativo</label>` : ''}
      <p class="muted small">Usuário: opera e configura somente a empresa escolhida (quartos, reservas, caixa, preços, produtos e horários). Administrador: vê todas as empresas e cadastra empresas e usuários.</p></form>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn primary" id="save">Salvar</button>` });
  const roleSel = $('[name=role]', m.el), coField = $('[name=company_id]', m.el).closest('.field');
  const syncRole = () => coField.style.visibility = roleSel.value === 'admin' ? 'hidden' : '';
  roleSel.onchange = syncRole; syncRole();
  $('#save', m.el).onclick = () => run(async () => {
    const f = formData($('#uf', m.el));
    if (u && f.active === undefined) f.active = true;
    await (u ? api('PUT', `/api/users/${u.id}`, f) : api('POST', '/api/users', f));
    m.close(); toast('Usuário salvo'); viewConfig($('#view'));
  });
}

boot();
