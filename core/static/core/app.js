'use strict';
// ---------- utilidades ----------
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const BILLING = { hora: 'Por hora', pernoite: 'Pernoite', diaria: 'Diária' };
const STATUS = { livre: 'Livre', ocupado: 'Ocupado', limpeza: 'Limpeza', manutencao: 'Manutenção' };
const ROLES = { admin: 'Administrador', gerente: 'Gerente', operador: 'Operador' };
const PAYMENTS = ['Dinheiro', 'Pix', 'Cartão de débito', 'Cartão de crédito'];

function tz() { return S.company?.timezone || 'America/Sao_Paulo'; }
function fmtDT(ms, opts = {}) {
  return new Date(ms).toLocaleString('pt-BR', { timeZone: tz(), day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', ...opts });
}
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
const canManage = () => S.me && S.me.role !== 'operador';

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
  const tabs = [['quartos', 'Quartos'], ['historico', 'Histórico'], ['config', 'Configurações']];
  app.innerHTML = `
    <header class="top">
      <div class="row">
        <span class="brand">🛏️ Quartos</span>
        ${S.companies.length > 1 ? `<select id="company">${S.companies.map(c => `<option value="${c.id}" ${c.id === S.company?.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`
          : `<span class="muted small">${esc(S.company?.name || '')}</span>`}
        <span class="spacer"></span>
        <button class="btn ghost sm" id="userbtn" title="Conta">${esc(S.me.name.split(' ')[0])} ▾</button>
      </div>
      <nav class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${S.tab === k ? 'active' : ''}">${l}</button>`).join('')}</nav>
    </header>
    <main id="view"></main>`;
  $('#company')?.addEventListener('change', async e => {
    S.company = S.companies.find(c => c.id === +e.target.value); localStorage.setItem('companyId', S.company.id); S.filter = null; renderView();
  });
  $$('nav.tabs button').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; render(); });
  $('#userbtn').onclick = userMenu;
  renderView();
}
function renderView() {
  const v = $('#view');
  if (!S.company) {
    v.innerHTML = `<div class="card"><p>Nenhuma empresa cadastrada.</p>${S.me.role === 'admin' ? '<button class="btn primary" id="newco">Cadastrar empresa</button>' : ''}</div>`;
    $('#newco')?.addEventListener('click', () => companyForm());
    return;
  }
  if (S.tab === 'quartos') return viewRooms(v);
  if (S.tab === 'historico') return viewHistory(v);
  if (S.tab === 'config') return viewConfig(v);
}

function renderLogin(app) {
  app.innerHTML = `<div class="login"><form class="card stack" id="login">
    <div><h1 style="font-size:22px">🛏️ Gerência de Quartos</h1><p class="muted small">Entre com seu usuário</p></div>
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
  const rooms = S.filter ? S.rooms.filter(r => r.status === S.filter) : S.rooms;
  const openTotal = S.rooms.reduce((s, r) => s + (r.stay?.preview_total || 0), 0);
  v.innerHTML = `
    <div class="chips">
      ${Object.entries(STATUS).map(([k, l]) => `<button class="chip s-${k} ${S.filter === k ? 'on' : ''}" data-f="${k}"><span class="dot" style="background:var(--c)"></span>${l} · ${count(k)}</button>`).join('')}
      <span class="spacer"></span><span class="chip" style="cursor:default">Em aberto: ${brl(openTotal)}</span>
    </div>
    ${S.rooms.length ? '' : `<div class="card"><p>Nenhum quarto cadastrado.</p>${canManage() ? '<p class="muted small">Cadastre em Configurações → Quartos.</p>' : ''}</div>`}
    <div class="rooms">${rooms.map(roomCard).join('')}</div>`;
  $$('.chip[data-f]', v).forEach(b => b.onclick = () => { S.filter = S.filter === b.dataset.f ? null : b.dataset.f; drawRooms(v); });
  $$('.room', v).forEach(el => el.onclick = () => openRoom(S.rooms.find(r => r.id === +el.dataset.id)));
}
function roomCard(r) {
  const s = r.stay;
  return `<button class="room s-${r.status}" data-id="${r.id}">
    <div class="row"><span class="name">${esc(r.name)}</span><span class="spacer"></span></div>
    <span class="cat">${esc(r.category_name)}</span>
    <span class="status">${STATUS[r.status]}</span>
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
  const m = modal({ title: `Quarto ${esc(r.name)}`, body: `<p>Status atual: <b>${STATUS[r.status]}</b></p>`,
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
  const m = modal({ title: `Iniciar estadia · Quarto ${esc(r.name)}`,
    body: `<div class="stack">
      <div class="muted small">${esc(r.category_name)} · escolha a cobrança</div>
      <div class="choices">${opts.map(([k, l, p, d]) => `<button class="choice" data-t="${k}"><b>${l}</b><div class="price num">${p}</div><div class="muted small">${d}</div></button>`).join('')}</div>
      <label class="field"><span>Nome do cliente (opcional)</span><input id="guest" autocomplete="off" placeholder="Ex.: Maria"></label>
    </div>`,
    foot: `<button class="btn" id="maint">Manutenção</button><button class="btn primary" id="go" disabled>Iniciar</button>` });
  $$('.choice', m.el).forEach(b => b.onclick = () => { type = b.dataset.t; $$('.choice', m.el).forEach(x => x.classList.toggle('on', x === b)); $('#go', m.el).disabled = false; });
  $('#go', m.el).onclick = () => run(async () => {
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
let histRange = null;
async function viewHistory(v) {
  histRange ??= { from: todayStr(), to: todayStr() };
  v.innerHTML = `<div class="card" style="margin-bottom:14px"><form id="hf" class="row wrap">
      <label class="field" style="flex:1;min-width:140px"><span>De</span><input type="date" name="from" value="${histRange.from}"></label>
      <label class="field" style="flex:1;min-width:140px"><span>Até</span><input type="date" name="to" value="${histRange.to}"></label>
      <div class="row" style="align-self:flex-end"><button type="button" class="btn sm" data-q="0">Hoje</button><button type="button" class="btn sm" data-q="-1">Ontem</button><button type="button" class="btn sm" data-q="7">7 dias</button></div>
    </form></div><div id="hres"><p class="muted">Carregando…</p></div>`;
  const form = $('#hf', v);
  const load = () => run(async () => {
    histRange = formData(form);
    const from = dayStart(histRange.from), to = dayStart(histRange.to) + 86400000 - 1;
    const d = await api('GET', `/api/companies/${S.company.id}/stays?from=${from}&to=${to}`);
    const s = d.summary;
    $('#hres', v).innerHTML = `
      <div class="kpis">
        <div class="card kpi"><div class="muted small">Faturamento</div><div class="v num">${brl(s.total)}</div></div>
        <div class="card kpi"><div class="muted small">Estadias</div><div class="v num">${s.count}</div></div>
        <div class="card kpi"><div class="muted small">Hospedagem</div><div class="v num">${brl(s.room_amount)}</div></div>
        <div class="card kpi"><div class="muted small">Consumo</div><div class="v num">${brl(s.items_amount)}</div></div>
      </div>
      ${Object.keys(s.by_payment).length ? `<div class="chips">${Object.entries(s.by_payment).map(([k, val]) => `<span class="chip" style="cursor:default">${esc(k)}: ${brl(val)}</span>`).join('')}</div>` : ''}
      <div class="list">${d.rows.map(r => `<div class="list-item" data-id="${r.id}">
          <div style="flex:1"><b>Quarto ${esc(r.room_name)}</b> <span class="badge">${BILLING[r.billing_type]}</span> ${r.status === 'cancelada' ? '<span class="badge" style="color:var(--busy)">Cancelada</span>' : ''}
            <div class="muted small">${fmtDT(r.check_in)} → ${fmtDT(r.check_out)}${r.guest_name ? ' · ' + esc(r.guest_name) : ''}${r.payment_method ? ' · ' + esc(r.payment_method) : ''}</div></div>
          <b class="num">${brl(r.total)}</b></div>`).join('') || '<p class="muted">Nenhuma estadia encerrada no período.</p>'}</div>`;
    $$('.list-item', v).forEach(el => el.onclick = () => openStay(+el.dataset.id));
  });
  form.onchange = load;
  $$('[data-q]', form).forEach(b => b.onclick = () => {
    const q = +b.dataset.q;
    form.from.value = q === 7 ? todayStr(-6) : todayStr(q); form.to.value = q === 7 ? todayStr() : todayStr(q); load();
  });
  load();
}

// ---------- Configurações ----------
async function viewConfig(v) {
  await run(loadCompanyData);
  const tabs = [['empresa', 'Empresa e horários'], ['precos', 'Categorias e preços'], ['quartos', 'Quartos'], ['produtos', 'Produtos']];
  if (canManage()) tabs.push(['usuarios', 'Usuários']);
  if (S.me.role === 'admin') tabs.push(['empresas', 'Empresas']);
  if (!tabs.some(t => t[0] === S.configTab)) S.configTab = 'empresa';
  v.innerHTML = `<div class="subtabs">${tabs.map(([k, l]) => `<button data-ct="${k}" class="${S.configTab === k ? 'active' : ''}">${l}</button>`).join('')}</div>
    ${!canManage() ? '<p class="muted small">Somente gerente ou administrador pode alterar as configurações.</p>' : ''}<div id="cfg"></div>`;
  $$('[data-ct]', v).forEach(b => b.onclick = () => { S.configTab = b.dataset.ct; viewConfig(v); });
  const c = $('#cfg', v);
  ({ empresa: cfgCompany, precos: cfgCategories, quartos: cfgRooms, produtos: cfgProducts, usuarios: cfgUsers, empresas: cfgCompanies })[S.configTab](c);
}
const dis = () => canManage() ? '' : 'disabled';

function companyFieldsHTML(co) {
  return `<label class="field"><span>Nome da empresa</span><input name="name" value="${esc(co.name)}" required ${dis()}></label>
    <div class="section-title">Pernoite</div>
    <div class="grid2"><label class="field"><span>Começa às</span><input type="time" name="overnight_start" value="${co.overnight_start}" ${dis()}></label>
      <label class="field"><span>Termina às</span><input type="time" name="overnight_end" value="${co.overnight_end}" ${dis()}></label></div>
    <div class="section-title">Diária</div>
    <div class="grid2"><label class="field"><span>Entrada a partir de</span><input type="time" name="daily_start" value="${co.daily_start}" ${dis()}></label>
      <label class="field"><span>Saída até</span><input type="time" name="daily_end" value="${co.daily_end}" ${dis()}></label></div>
    <div class="section-title">Outros</div>
    <div class="grid2"><label class="field"><span>Tolerância (minutos)</span><input type="number" min="0" name="tolerance_min" value="${co.tolerance_min}" ${dis()}></label>
      <label class="field"><span>Fuso horário</span><input name="timezone" value="${esc(co.timezone)}" ${dis()}></label></div>
    <p class="muted small">A tolerância vale para frações de hora, saída após o pernoite e saída após o horário da diária.</p>`;
}
function cfgCompany(c) {
  const co = S.company;
  c.innerHTML = `<form class="card stack" id="cf">${companyFieldsHTML(co)}${canManage() ? '<button class="btn primary">Salvar</button>' : ''}</form>`;
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
    ${canManage() ? '<div class="row" style="margin-bottom:10px"><span class="spacer"></span><button class="btn primary" id="add">+ Nova categoria</button></div>' : ''}
    <div class="list">${S.categories.map(k => `<div class="list-item" data-id="${k.id}"><div style="flex:1"><b>${esc(k.name)}</b>
      <div class="muted small num">Hora ${brl(k.hour_price)} (mín. ${k.hour_min_hours}h, adicional ${brl(k.extra_hour_price ?? k.hour_price)}) · Pernoite ${brl(k.overnight_price)} · Diária ${brl(k.daily_price)}</div></div></div>`).join('')}</div>`;
  $('#add', c)?.addEventListener('click', () => categoryForm());
  $$('.list-item', c).forEach(el => el.onclick = () => categoryForm(S.categories.find(k => k.id === +el.dataset.id)));
}
function categoryForm(k) {
  const v = k || { name: '', hour_price: 0, hour_min_hours: 1, extra_hour_price: '', overnight_price: 0, daily_price: 0 };
  const m = modal({ title: k ? 'Editar categoria' : 'Nova categoria', body: `<form id="kf" class="stack">
      <label class="field"><span>Nome</span><input name="name" value="${esc(v.name)}" placeholder="Ex.: Standard, Luxo, Suíte" required ${dis()}></label>
      <div class="section-title">Por hora</div>
      <div class="grid3"><label class="field"><span>Preço da hora</span><input name="hour_price" type="number" step="0.01" min="0" inputmode="decimal" value="${v.hour_price}" ${dis()}></label>
        <label class="field"><span>Mínimo de horas</span><input name="hour_min_hours" type="number" min="1" value="${v.hour_min_hours}" ${dis()}></label>
        <label class="field"><span>Hora adicional</span><input name="extra_hour_price" type="number" step="0.01" min="0" inputmode="decimal" value="${v.extra_hour_price ?? ''}" placeholder="= hora" ${dis()}></label></div>
      <p class="muted small">A hora adicional é usada nas horas excedentes do pernoite. Em branco, usa o preço da hora.</p>
      <div class="grid2"><label class="field"><span>Pernoite</span><input name="overnight_price" type="number" step="0.01" min="0" inputmode="decimal" value="${v.overnight_price}" ${dis()}></label>
        <label class="field"><span>Diária</span><input name="daily_price" type="number" step="0.01" min="0" inputmode="decimal" value="${v.daily_price}" ${dis()}></label></div>
    </form>`,
    foot: canManage() ? `${k ? '<button class="btn danger" id="del">Excluir</button>' : '<button class="btn" data-close>Cancelar</button>'}<button class="btn primary" id="save">Salvar</button>` : '' });
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
  c.innerHTML = `${canManage() ? '<div class="row" style="margin-bottom:10px"><span class="spacer"></span><button class="btn" id="bulk">+ Vários</button><button class="btn primary" id="add">+ Novo quarto</button></div>' : ''}
    <div class="list">${S.rooms.map(r => `<div class="list-item" data-id="${r.id}"><b style="min-width:60px">${esc(r.name)}</b><span style="flex:1" class="muted">${esc(r.category_name)}</span><span class="badge">${STATUS[r.status]}</span></div>`).join('') || '<p class="muted">Nenhum quarto.</p>'}</div>`;
  $('#add', c)?.addEventListener('click', () => roomForm());
  $('#bulk', c)?.addEventListener('click', bulkRooms);
  $$('.list-item', c).forEach(el => el.onclick = () => canManage() && roomForm(S.rooms.find(r => r.id === +el.dataset.id)));
}
const catOptions = sel => S.categories.map(k => `<option value="${k.id}" ${k.id === sel ? 'selected' : ''}>${esc(k.name)}</option>`).join('');
function roomForm(r) {
  const m = modal({ title: r ? `Quarto ${esc(r.name)}` : 'Novo quarto', body: `<form id="rf" class="stack">
      <label class="field"><span>Nome / número</span><input name="name" value="${esc(r?.name || '')}" required></label>
      <label class="field"><span>Categoria</span><select name="category_id">${catOptions(r?.category_id)}</select></label></form>`,
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
      <label class="field"><span>Categoria</span><select name="category_id">${catOptions()}</select></label></form>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn primary" id="save">Criar</button>` });
  $('#save', m.el).onclick = () => run(async () => {
    const f = formData($('#bf', m.el)); const a = +f.from, b = +f.to;
    if (!(b >= a) || b - a > 300) throw new Error('Intervalo inválido');
    for (let i = a; i <= b; i++) await api('POST', `/api/companies/${S.company.id}/rooms`, { name: f.prefix + i, category_id: f.category_id });
    m.close(); toast(`${b - a + 1} quartos criados`); viewConfig($('#view'));
  });
}

function cfgProducts(c) {
  c.innerHTML = `${canManage() ? '<div class="row" style="margin-bottom:10px"><span class="spacer"></span><button class="btn primary" id="add">+ Novo produto</button></div>' : ''}
    <div class="list">${S.products.map(p => `<div class="list-item" data-id="${p.id}"><span style="flex:1">${esc(p.name)}</span><b class="num">${brl(p.price)}</b></div>`).join('') || '<p class="muted">Nenhum produto.</p>'}</div>`;
  $('#add', c)?.addEventListener('click', () => productForm());
  $$('.list-item', c).forEach(el => el.onclick = () => canManage() && productForm(S.products.find(p => p.id === +el.dataset.id)));
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
  const admin = S.me.role === 'admin';
  const roles = admin ? ['operador', 'gerente', 'admin'] : ['operador', 'gerente'];
  const m = modal({ title: u ? 'Editar usuário' : 'Novo usuário', body: `<form id="uf" class="stack">
      <label class="field"><span>Nome</span><input name="name" value="${esc(u?.name || '')}" required></label>
      <label class="field"><span>Usuário (login)</span><input name="username" value="${esc(u?.username || '')}" autocapitalize="none" required></label>
      <label class="field"><span>${u ? 'Nova senha (deixe em branco para manter)' : 'Senha'}</span><input name="password" type="password" minlength="4" ${u ? '' : 'required'}></label>
      <div class="grid2"><label class="field"><span>Perfil</span><select name="role">${roles.map(r => `<option value="${r}" ${u?.role === r ? 'selected' : ''}>${ROLES[r]}</option>`).join('')}</select></label>
        <label class="field"><span>Empresa</span><select name="company_id" ${admin ? '' : 'disabled'}>${S.companies.map(co => `<option value="${co.id}" ${(u?.company_id ?? S.company.id) === co.id ? 'selected' : ''}>${esc(co.name)}</option>`).join('')}</select></label></div>
      ${u ? `<label class="row"><input type="checkbox" name="active" style="width:auto;min-height:0" ${u.active ? 'checked' : ''}> Ativo</label>` : ''}
      <p class="muted small">Operador: abre e fecha quartos e lança consumo. Gerente: também altera preços, quartos, produtos e usuários da empresa. Administrador: todas as empresas.</p></form>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn primary" id="save">Salvar</button>` });
  $('#save', m.el).onclick = () => run(async () => {
    const f = formData($('#uf', m.el));
    if (!admin) f.company_id = S.me.company_id;
    if (u && f.active === undefined) f.active = true;
    await (u ? api('PUT', `/api/users/${u.id}`, f) : api('POST', '/api/users', f));
    m.close(); toast('Usuário salvo'); viewConfig($('#view'));
  });
}

boot();
