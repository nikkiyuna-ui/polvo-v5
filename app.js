// ═══════════════════════════════════════════════════════════
//  POLVO V5 — app.js  (v2 — corrigido)
// ═══════════════════════════════════════════════════════════
import { initializeApp }      from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, doc, collection,
  onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { FIREBASE_CONFIG } from './firebase-config.js';

// ── Firebase ──────────────────────────────────────────────
const fbApp  = initializeApp(FIREBASE_CONFIG);
const db     = getFirestore(fbApp);
const CFG    = doc(db, 'polvo-v5', 'config');
const CARDS  = collection(db, 'polvo-v5-cards');

// ── State ─────────────────────────────────────────────────
const S = { members: [], projects: [], cards: {}, colWidths: {} };
let pendingDay = null;
const debounces = {};   // cardId → timerId (pending Firebase saves)

// ── Date helpers ──────────────────────────────────────────
const DAYS_BACK = 60, DAYS_FWD = 120;
const WD  = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const MON = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
}
function p2(n) { return String(n).padStart(2,'0'); }
function shiftDay(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
}
function fmtDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return { wd: WD[d.getDay()], num: d.getDate(), mon: MON[d.getMonth()] };
}
function allDays() {
  const t = todayStr();
  return Array.from({ length: DAYS_BACK + DAYS_FWD + 1 }, (_, i) => shiftDay(t, i - DAYS_BACK));
}

// ── Icons ─────────────────────────────────────────────────
const I = {
  plus:  `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6.5" y1="1.5" x2="6.5" y2="11.5"/><line x1="1.5" y1="6.5" x2="11.5" y2="6.5"/></svg>`,
  check: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,7 5,10 11,3"/></svg>`,
  table: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="1" y="1" width="11" height="11" rx="1.2"/><line x1="1" y1="5" x2="12" y2="5"/><line x1="1" y1="9" x2="12" y2="9"/><line x1="5" y1="5" x2="5" y2="12"/><line x1="9" y1="5" x2="9" y2="12"/></svg>`,
  chevD: `<svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,3.5 5.5,7.5 9,3.5"/></svg>`,
  chevR: `<svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3.5,2 7.5,5.5 3.5,9"/></svg>`,
  x:     `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg>`,
};

function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function initials(name) { return (name||'').split(' ').map(w => w[0]||'').join('').slice(0,2).toUpperCase(); }
function placeCaretEnd(el) {
  const r = document.createRange(), s = window.getSelection();
  r.selectNodeContents(el); r.collapse(false);
  s.removeAllRanges(); s.addRange(r);
}

const COLORS = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#06b6d4','#84cc16','#f97316'];

// ═══════════════════════════════════════════════════════════
//  LOCAL-FIRST UPDATE
//  Atualiza estado local → re-renderiza card → salva Firebase
// ═══════════════════════════════════════════════════════════
function localUpdate(cardId, updates) {
  if (!S.cards[cardId]) return;
  Object.assign(S.cards[cardId], updates);
  replaceCard(cardId);
  saveCard(cardId, updates);
}

// Para digitação: atualiza estado local + debounce Firebase (sem re-render DOM)
function localUpdateText(cardId, updates) {
  if (!S.cards[cardId]) return;
  Object.assign(S.cards[cardId], updates);
  clearTimeout(debounces[cardId]);
  debounces[cardId] = setTimeout(() => {
    saveCard(cardId, updates);
    delete debounces[cardId];
  }, 600);
}

function replaceCard(id) {
  const card = S.cards[id];
  if (!card) return;
  const existing = document.querySelector(`.card[data-id="${id}"]`);
  if (!existing) return;
  existing.replaceWith(buildCard(card));
}

// ═══════════════════════════════════════════════════════════
//  BOARD
// ═══════════════════════════════════════════════════════════
function renderBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  const today = todayStr();
  allDays().forEach(day => board.appendChild(buildCol(day, day === today)));
}

function buildCol(day, isToday) {
  const { wd, num, mon } = fmtDay(day);
  const w = S.colWidths[day] || 280;
  const col = document.createElement('div');
  col.className = 'col' + (isToday ? ' today' : '');
  col.dataset.day = day;
  col.style.width = w + 'px';
  col.innerHTML = `
    <div class="col-header">
      <div>
        <div class="col-date-weekday">${wd} · ${mon}</div>
        <div class="col-date-num">${num}</div>
      </div>
      <button class="col-add-btn" title="Novo card">${I.plus}</button>
    </div>
    <div class="col-body" data-day="${day}"></div>
    <div class="col-resize-handle"></div>`;
  col.querySelector('.col-add-btn').addEventListener('click', () => openNewCard(day));
  initResize(col, day);
  return col;
}

function initResize(col, day) {
  const h = col.querySelector('.col-resize-handle');
  let sx, sw;
  h.addEventListener('mousedown', e => {
    e.preventDefault(); sx = e.clientX; sw = col.offsetWidth; h.classList.add('active');
    const mv = e => { const w = clamp(sw + e.clientX - sx, 180, 640); col.style.width = w + 'px'; };
    const up = e => {
      h.classList.remove('active');
      S.colWidths[day] = clamp(sw + e.clientX - sx, 180, 640);
      saveCfg({ colWidths: S.colWidths });
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  });
}

// ═══════════════════════════════════════════════════════════
//  RENDER DAY (coluna inteira)
// ═══════════════════════════════════════════════════════════
function renderDay(day) {
  const body = document.querySelector(`.col-body[data-day="${day}"]`);
  if (!body) return;

  const list = Object.values(S.cards)
    .filter(c => c.day === day)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  body.innerHTML = '';
  body.appendChild(mkIndicator(day, -1));
  list.forEach((card, i) => {
    body.appendChild(buildCard(card));
    body.appendChild(mkIndicator(day, i));
  });
}

function mkIndicator(day, after) {
  const d = document.createElement('div');
  d.className = 'drop-indicator';
  d.dataset.day = day;
  d.dataset.after = after;
  return d;
}

// ═══════════════════════════════════════════════════════════
//  BUILD CARD
// ═══════════════════════════════════════════════════════════
function buildCard(card) {
  const proj    = S.projects.find(p => p.id === card.projectId);
  const members = (card.memberIds || []).map(id => S.members.find(m => m.id === id)).filter(Boolean);
  const blocks  = card.blocks || [];
  const pct     = progress(blocks);
  const color   = members[0]?.color || '#5b4cf5';

  const el = document.createElement('div');
  el.className = 'card' + (card.collapsed ? ' collapsed' : '');
  el.dataset.id = card.id;
  el.draggable = true;

  const badge = proj
    ? `<span class="card-sigla" style="background:${proj.color}1a;color:${proj.color}">${esc(proj.sigla)}</span>`
    : '';

  const avs = members.map(m => m.photoURL
    ? `<img class="avatar" src="${m.photoURL}" title="${esc(m.name)}" alt="">`
    : `<div class="avatar-ini" style="background:${m.color}" title="${esc(m.name)}">${initials(m.name)}</div>`
  ).join('');

  el.innerHTML = `
    <div class="card-progress">
      <div class="card-progress-fill" style="width:${pct}%;background:${color}"></div>
    </div>
    <div class="card-header">
      <button class="card-toggle">${card.collapsed ? I.chevR : I.chevD}</button>
      <div class="card-meta">
        <div class="card-title-row">
          ${badge}
          <div class="card-name" contenteditable="false" spellcheck="false">${esc(card.name || 'Nova atividade')}</div>
        </div>
        <div class="card-avatars">${avs}</div>
      </div>
    </div>
    <div class="card-body">
      <div class="card-content">${renderBlocks(blocks, card.id)}</div>
    </div>
    <div class="card-footer">
      <button class="card-btn" data-act="check" title="Adicionar item">${I.check}</button>
      <button class="card-btn" data-act="table" title="Inserir tabela">${I.table}</button>
    </div>`;

  wireCard(el, card.id);
  wireDrag(el, card.id);
  return el;
}

// ═══════════════════════════════════════════════════════════
//  RENDER BLOCKS
// ═══════════════════════════════════════════════════════════
function renderBlocks(blocks, cardId) {
  return blocks.map((b, i) =>
    b.type === 'check' ? renderCheckItem(b, i) :
    b.type === 'table' ? renderTable(b, i, cardId) : ''
  ).join('');
}

function renderCheckItem(b, idx) {
  const pad = (b.level || 0) * 18;
  return `<div class="check-item${b.checked ? ' done' : ''}" style="padding-left:${pad}px">
    <input type="checkbox" data-bi="${idx}"${b.checked ? ' checked' : ''}>
    <div class="check-text" contenteditable="true" spellcheck="false"
         data-bi="${idx}" data-ph="Item...">${esc(b.text || '')}</div>
  </div>`;
}

function renderTable(blk, bi, cardId) {
  const rows = blk.rows || [[{checks:[]},{checks:[]}],[{checks:[]},{checks:[]}]];
  const rowsHtml = rows.map((row, ri) =>
    `<tr>${row.map((cell, ci) =>
      `<td>${(cell.checks||[]).map((chk,ki) => renderCellCheck(chk,bi,ri,ci,ki)).join('')}
       <div class="cell-add-check" data-cell-add="${bi}-${ri}-${ci}">+ item</div>
      </td>`
    ).join('')}</tr>`
  ).join('');

  return `<div class="tbl-wrap">
    <table class="card-tbl"><tbody>${rowsHtml}</tbody></table>
    <div class="tbl-actions">
      <button class="tbl-btn" data-add-row="${bi}">+ linha</button>
      <button class="tbl-btn" data-add-col="${bi}">+ coluna</button>
    </div>
  </div>`;
}

function renderCellCheck(chk, bi, ri, ci, ki) {
  const pad = (chk.level||0) * 14;
  const ckey = `${bi}-${ri}-${ci}-${ki}`;
  return `<div class="check-item${chk.checked ? ' done' : ''}" style="padding-left:${pad}px">
    <input type="checkbox" data-ck="${ckey}"${chk.checked ? ' checked' : ''}>
    <div class="check-text" contenteditable="true" spellcheck="false"
         data-ck-text="${ckey}" data-ph="...">${esc(chk.text||'')}</div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════
//  PROGRESS
// ═══════════════════════════════════════════════════════════
function progress(blocks) {
  let total = 0, done = 0;
  for (const b of (blocks || [])) {
    if (b.type === 'check') { total++; if (b.checked) done++; }
    else if (b.type === 'table') {
      for (const row of (b.rows||[]))
        for (const cell of (row||[]))
          for (const chk of (cell.checks||[])) { total++; if (chk.checked) done++; }
    }
  }
  return total ? Math.round(done / total * 100) : 0;
}

// ═══════════════════════════════════════════════════════════
//  WIRE CARD — toda a lógica de interação do card
// ═══════════════════════════════════════════════════════════
function wireCard(el, cardId) {
  const getCard = () => S.cards[cardId];

  // ── Toggle collapse ──
  el.querySelector('.card-toggle').addEventListener('click', e => {
    e.stopPropagation();
    const card = getCard(); if (!card) return;
    localUpdate(cardId, { collapsed: !card.collapsed });
  });

  // ── Nome: clique para editar ──
  const nameEl = el.querySelector('.card-name');
  nameEl.addEventListener('click', e => {
    e.stopPropagation();
    nameEl.contentEditable = 'true';
    nameEl.focus();
    placeCaretEnd(nameEl);
  });
  nameEl.addEventListener('blur', () => {
    nameEl.contentEditable = 'false';
    const card = getCard(); if (!card) return;
    const v = nameEl.textContent.trim() || 'Nova atividade';
    if (v !== card.name) localUpdate(cardId, { name: v });
  });
  nameEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); } });

  // ── Botões de rodapé ──
  el.querySelector('[data-act="check"]').addEventListener('click', e => {
    e.stopPropagation();
    const card = getCard(); if (!card) return;
    const blocks = clone(card.blocks || []);
    const last = [...blocks].reverse().find(b => b.type === 'check');
    blocks.push({ type:'check', text:'', checked:false, level: last?.level||0 });
    localUpdate(cardId, { blocks });
    setTimeout(() => {
      const fresh = document.querySelector(`.card[data-id="${cardId}"]`);
      if (!fresh) return;
      const items = fresh.querySelectorAll('.check-text[data-bi]');
      items[items.length - 1]?.focus();
    }, 30);
  });

  el.querySelector('[data-act="table"]').addEventListener('click', e => {
    e.stopPropagation();
    const card = getCard(); if (!card) return;
    const blocks = clone(card.blocks || []);
    blocks.push({ type:'table', rows: [
      [{checks:[]},{checks:[]}],
      [{checks:[]},{checks:[]}]
    ]});
    localUpdate(cardId, { blocks });
  });

  const content = el.querySelector('.card-content');

  // ── Checkbox toggles ──
  content.addEventListener('change', e => {
    if (e.target.type !== 'checkbox') return;
    const card = getCard(); if (!card) return;
    const blocks = clone(card.blocks || []);

    const ck = e.target.dataset.ck;
    if (ck) {
      const [bi,ri,ci,ki] = ck.split('-').map(Number);
      if (blocks[bi]?.rows?.[ri]?.[ci]?.checks?.[ki] !== undefined)
        blocks[bi].rows[ri][ci].checks[ki].checked = e.target.checked;
    } else {
      const bi = parseInt(e.target.dataset.bi);
      if (!isNaN(bi) && blocks[bi]) blocks[bi].checked = e.target.checked;
    }

    e.target.closest('.check-item')?.classList.toggle('done', e.target.checked);
    // Atualiza barra de progresso imediatamente no DOM
    const fill = el.querySelector('.card-progress-fill');
    if (fill) fill.style.width = progress(blocks) + '%';
    localUpdateText(cardId, { blocks });
  });

  // ── Digitação em check items ──
  content.addEventListener('input', e => {
    if (!e.target.classList.contains('check-text')) return;
    const card = getCard(); if (!card) return;
    const blocks = clone(card.blocks || []);

    const ckText = e.target.dataset.ckText;
    if (ckText) {
      const [bi,ri,ci,ki] = ckText.split('-').map(Number);
      if (blocks[bi]?.rows?.[ri]?.[ci]?.checks?.[ki] !== undefined)
        blocks[bi].rows[ri][ci].checks[ki].text = e.target.textContent;
    } else {
      const bi = parseInt(e.target.dataset.bi);
      if (!isNaN(bi) && blocks[bi]) blocks[bi].text = e.target.textContent;
    }

    localUpdateText(cardId, { blocks });
  });

  // ── Teclado nos check items ──
  content.addEventListener('keydown', e => {
    if (!e.target.classList.contains('check-text')) return;
    const card = getCard(); if (!card) return;

    // Tab dentro de célula de tabela
    if (e.target.dataset.ckText) {
      if (e.key !== 'Tab') return;
      e.preventDefault();
      const [bi,ri,ci,ki] = e.target.dataset.ckText.split('-').map(Number);
      const blocks = clone(card.blocks || []);
      const chk = blocks[bi]?.rows?.[ri]?.[ci]?.checks?.[ki];
      if (!chk) return;
      chk.level = Math.max(0, (chk.level||0) + (e.shiftKey ? -1 : 1));
      e.target.closest('.check-item').style.paddingLeft = chk.level * 14 + 'px';
      localUpdateText(cardId, { blocks });
      return;
    }

    const bi = parseInt(e.target.dataset.bi);
    if (isNaN(bi)) return;

    if (e.key === 'Tab') {
      e.preventDefault();
      const blocks = clone(card.blocks || []);
      blocks[bi].level = Math.max(0, (blocks[bi].level||0) + (e.shiftKey ? -1 : 1));
      e.target.closest('.check-item').style.paddingLeft = blocks[bi].level * 18 + 'px';
      localUpdateText(cardId, { blocks });
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const blocks = clone(card.blocks || []);
      const level = blocks[bi]?.level || 0;
      // Garante texto atual salvo antes de inserir novo
      blocks[bi].text = e.target.textContent;
      blocks.splice(bi + 1, 0, { type:'check', text:'', checked:false, level });
      localUpdate(cardId, { blocks });
      // Foca o novo item após re-render
      setTimeout(() => {
        const fresh = document.querySelector(`.card[data-id="${cardId}"]`);
        if (!fresh) return;
        const items = [...fresh.querySelectorAll('.check-text[data-bi]')];
        const newItem = items.find(i => parseInt(i.dataset.bi) === bi + 1);
        if (newItem) { newItem.focus(); placeCaretEnd(newItem); }
      }, 30);
    }

    if (e.key === 'Backspace' && e.target.textContent === '') {
      e.preventDefault();
      const blocks = clone(card.blocks || []);
      if (blocks.length <= 1) return;
      blocks.splice(bi, 1);
      localUpdate(cardId, { blocks });
      setTimeout(() => {
        const fresh = document.querySelector(`.card[data-id="${cardId}"]`);
        if (!fresh) return;
        const items = [...fresh.querySelectorAll('.check-text[data-bi]')];
        const prev = items.find(i => parseInt(i.dataset.bi) === bi - 1);
        if (prev) { prev.focus(); placeCaretEnd(prev); }
      }, 30);
    }
  }, true);

  // ── Clicks dentro do conteúdo (adicionar item em célula, add row/col) ──
  content.addEventListener('click', e => {
    const card = getCard(); if (!card) return;

    // Adicionar check em célula de tabela
    const cellAdd = e.target.closest('[data-cell-add]');
    if (cellAdd) {
      const [bi,ri,ci] = cellAdd.dataset.cellAdd.split('-').map(Number);
      const blocks = clone(card.blocks || []);
      if (!blocks[bi]?.rows?.[ri]?.[ci]) return;
      blocks[bi].rows[ri][ci].checks = blocks[bi].rows[ri][ci].checks || [];
      blocks[bi].rows[ri][ci].checks.push({ text:'', checked:false, level:0 });
      localUpdate(cardId, { blocks });
      setTimeout(() => {
        const fresh = document.querySelector(`.card[data-id="${cardId}"]`);
        if (!fresh) return;
        const all = fresh.querySelectorAll(`[data-ck-text^="${bi}-${ri}-${ci}-"]`);
        all[all.length-1]?.focus();
      }, 30);
      return;
    }

    // Adicionar linha na tabela
    const addRow = e.target.closest('[data-add-row]');
    if (addRow) {
      const bi = parseInt(addRow.dataset.addRow);
      const blocks = clone(card.blocks || []);
      if (blocks[bi]?.type !== 'table') return;
      const cols = blocks[bi].rows[0]?.length || 2;
      blocks[bi].rows.push(Array.from({length: cols}, () => ({checks:[]})));
      localUpdate(cardId, { blocks });
      return;
    }

    // Adicionar coluna na tabela
    const addCol = e.target.closest('[data-add-col]');
    if (addCol) {
      const bi = parseInt(addCol.dataset.addCol);
      const blocks = clone(card.blocks || []);
      if (blocks[bi]?.type !== 'table') return;
      blocks[bi].rows.forEach(row => row.push({checks:[]}));
      localUpdate(cardId, { blocks });
      return;
    }
  });
}

// ═══════════════════════════════════════════════════════════
//  DRAG & DROP
// ═══════════════════════════════════════════════════════════
let dragId = null;

function wireDrag(el, id) {
  el.addEventListener('dragstart', e => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    dragId = id;
    requestAnimationFrame(() => el.classList.add('dragging'));
    document.getElementById('trash-zone').classList.add('visible');
  });
  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    dragId = null;
    document.getElementById('trash-zone').classList.remove('visible','over');
    document.querySelectorAll('.drop-indicator.active').forEach(d => d.classList.remove('active'));
  });
}

function initDropZones() {
  const wrapper = document.getElementById('board-wrapper');

  wrapper.addEventListener('dragover', e => {
    e.preventDefault();
    if (!dragId) return;
    document.querySelectorAll('.drop-indicator.active').forEach(d => d.classList.remove('active'));
    const ind = bestIndicator(e.clientX, e.clientY);
    if (ind) ind.classList.add('active');
  });

  wrapper.addEventListener('drop', e => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    const ind = document.querySelector('.drop-indicator.active');
    document.querySelectorAll('.drop-indicator.active').forEach(d => d.classList.remove('active'));
    if (ind) moveCard(id, ind.dataset.day, parseInt(ind.dataset.after));
  });

  const trash = document.getElementById('trash-zone');
  trash.addEventListener('dragover', e => { e.preventDefault(); trash.classList.add('over'); });
  trash.addEventListener('dragleave', () => trash.classList.remove('over'));
  trash.addEventListener('drop', e => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (id) deleteCard(id);
    trash.classList.remove('over','visible');
  });
}

function bestIndicator(x, y) {
  const bodies = [...document.querySelectorAll('.col-body')];
  for (const body of bodies) {
    const br = body.getBoundingClientRect();
    if (x < br.left - 14 || x > br.right + 14) continue;
    const inds = [...body.querySelectorAll('.drop-indicator')];
    if (!inds.length) continue;
    if (y <= br.top + 30) return inds[0];
    if (y >= br.bottom - 30) return inds[inds.length - 1];
    let best = null, bestD = Infinity;
    for (const ind of inds) {
      const r = ind.getBoundingClientRect();
      const d = Math.abs(y - (r.top + r.height / 2));
      if (d < bestD) { bestD = d; best = ind; }
    }
    return best;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
//  CARD CRUD
// ═══════════════════════════════════════════════════════════
async function createCard(day, projectId, name, memberIds) {
  const dayCards = Object.values(S.cards).filter(c => c.day === day);
  const maxOrd   = dayCards.length ? Math.max(...dayCards.map(c => c.order ?? 0)) : -1;
  const id = 'c' + Date.now() + Math.random().toString(36).slice(2,5);
  const data = {
    id, day,
    projectId:  projectId || null,
    name:       name || 'Nova atividade',
    memberIds:  memberIds || [],
    blocks:     [],
    collapsed:  false,
    order:      maxOrd + 1,
    createdAt:  serverTimestamp(),
  };
  // Atualiza local imediatamente
  S.cards[id] = data;
  renderDay(day);
  // Salva Firebase
  await setDoc(doc(CARDS, id), data);
}

async function saveCard(id, updates) {
  await updateDoc(doc(CARDS, id), updates);
}

async function deleteCard(id) {
  const day = S.cards[id]?.day;
  delete S.cards[id];
  if (day) renderDay(day);
  await deleteDoc(doc(CARDS, id));
}

async function moveCard(id, targetDay, afterIdx) {
  const card = S.cards[id];
  if (!card) return;
  const siblings = Object.values(S.cards)
    .filter(c => c.day === targetDay && c.id !== id)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  siblings.splice(afterIdx + 1, 0, { ...card, day: targetDay });

  // Atualiza local
  const oldDay = card.day;
  siblings.forEach((c, i) => { S.cards[c.id] = { ...S.cards[c.id], order: i, day: targetDay }; });
  if (oldDay !== targetDay) renderDay(oldDay);
  renderDay(targetDay);

  const batch = writeBatch(db);
  siblings.forEach((c, i) => batch.update(doc(CARDS, c.id), { order: i, day: targetDay }));
  await batch.commit();
}

// ═══════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════
async function saveCfg(updates) {
  try { await updateDoc(CFG, updates); }
  catch { await setDoc(CFG, updates, { merge: true }); }
}

// ═══════════════════════════════════════════════════════════
//  FIREBASE LISTENERS
// ═══════════════════════════════════════════════════════════
function initListeners() {
  onSnapshot(CFG, snap => {
    if (!snap.exists()) return;
    const d = snap.data();
    S.members   = d.members   || [];
    S.projects  = d.projects  || [];
    S.colWidths = d.colWidths || {};

    Object.entries(S.colWidths).forEach(([day, w]) => {
      const col = document.querySelector(`.col[data-day="${day}"]`);
      if (col) col.style.width = w + 'px';
    });

    if (!document.getElementById('modal-members').classList.contains('hidden')) renderMembersModal();
    if (!document.getElementById('modal-projects').classList.contains('hidden')) renderProjectsModal();

    // Re-renderiza todos os cards visíveis (cores/fotos podem ter mudado)
    const days = new Set(Object.values(S.cards).map(c => c.day));
    days.forEach(day => renderDay(day));
  });

  onSnapshot(CARDS, snap => {
    const prev = { ...S.cards };
    const next = {};
    snap.forEach(d => {
      const data = d.data();
      // Se há debounce pendente (usuário está digitando), mantém estado local
      next[data.id] = debounces[data.id] ? (S.cards[data.id] || data) : data;
    });

    const changed = new Set();
    for (const id of new Set([...Object.keys(prev), ...Object.keys(next)])) {
      if (JSON.stringify(prev[id]) !== JSON.stringify(next[id])) {
        if (prev[id]?.day) changed.add(prev[id].day);
        if (next[id]?.day) changed.add(next[id].day);
      }
    }

    S.cards = next;
    changed.forEach(day => renderDay(day));
  });
}

// ═══════════════════════════════════════════════════════════
//  MEMBERS MODAL
// ═══════════════════════════════════════════════════════════
function renderMembersModal() {
  const list = document.getElementById('members-list');
  list.innerHTML = '';
  S.members.forEach((m, i) => {
    const ini = initials(m.name);
    const row = document.createElement('div');
    row.className = 'member-row';
    row.innerHTML = `
      <div class="photo-btn" title="Alterar foto">
        ${m.photoURL ? `<img src="${m.photoURL}" alt="">` : `<span>${ini}</span>`}
        <input type="file" accept="image/*">
      </div>
      <input type="text" value="${esc(m.name)}" placeholder="Nome" style="flex:1">
      <div class="color-dot" style="background:${m.color}">
        <input type="color" value="${m.color}">
      </div>
      <button class="btn-del">${I.x}</button>`;

    row.querySelector('input[type="file"]').addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      const url = await resizeImg(file, 80, 80);
      const members = clone(S.members); members[i].photoURL = url;
      await saveCfg({ members });
    });
    row.querySelector('input[type="text"]').addEventListener('blur', async e => {
      const members = clone(S.members); members[i].name = e.target.value || 'Membro';
      await saveCfg({ members });
    });
    row.querySelector('input[type="color"]').addEventListener('input', e => {
      row.querySelector('.color-dot').style.background = e.target.value;
    });
    row.querySelector('input[type="color"]').addEventListener('change', async e => {
      const members = clone(S.members); members[i].color = e.target.value;
      await saveCfg({ members });
    });
    row.querySelector('.btn-del').addEventListener('click', async () => {
      const members = S.members.filter((_,j) => j !== i);
      await saveCfg({ members });
    });
    list.appendChild(row);
  });
}

// ═══════════════════════════════════════════════════════════
//  PROJECTS MODAL
// ═══════════════════════════════════════════════════════════
function renderProjectsModal() {
  const list = document.getElementById('projects-list');
  list.innerHTML = '';
  S.projects.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.innerHTML = `
      <div class="color-dot" style="background:${p.color}">
        <input type="color" value="${p.color}">
      </div>
      <input type="text" value="${esc(p.sigla)}" placeholder="SIGLA"
             style="width:76px;text-transform:uppercase;font-weight:700;letter-spacing:.06em">
      <input type="text" value="${esc(p.name)}" placeholder="Nome do projeto" style="flex:1">
      <button class="btn-del">${I.x}</button>`;

    row.querySelector('input[type="color"]').addEventListener('input', e => {
      row.querySelector('.color-dot').style.background = e.target.value;
    });
    row.querySelector('input[type="color"]').addEventListener('change', async e => {
      const projects = clone(S.projects); projects[i].color = e.target.value;
      await saveCfg({ projects });
    });
    const [si, ni] = row.querySelectorAll('input[type="text"]');
    si.addEventListener('blur', async e => {
      const projects = clone(S.projects); projects[i].sigla = e.target.value.toUpperCase() || 'PROJ';
      await saveCfg({ projects });
    });
    ni.addEventListener('blur', async e => {
      const projects = clone(S.projects); projects[i].name = e.target.value || 'Projeto';
      await saveCfg({ projects });
    });
    row.querySelector('.btn-del').addEventListener('click', async () => {
      const projects = S.projects.filter((_,j) => j !== i);
      await saveCfg({ projects });
    });
    list.appendChild(row);
  });
}

// ═══════════════════════════════════════════════════════════
//  NEW CARD MODAL
// ═══════════════════════════════════════════════════════════
function openNewCard(day) {
  pendingDay = day;

  const sel = document.getElementById('new-card-project');
  sel.innerHTML = '<option value="">— Sem projeto —</option>';
  S.projects.forEach(p => {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = `${p.sigla} — ${p.name}`;
    sel.appendChild(o);
  });

  const md = document.getElementById('new-card-members');
  md.innerHTML = '';
  S.members.forEach(m => {
    const label = document.createElement('label');
    label.className = 'member-pick';
    label.innerHTML = `
      <input type="checkbox" value="${m.id}">
      <div class="avatar-ini" style="background:${m.color};width:22px;height:22px;font-size:7.5px">${initials(m.name)}</div>
      <span>${esc(m.name)}</span>`;
    md.appendChild(label);
  });

  document.getElementById('new-card-name').value = '';
  openModal('modal-new-card');
  setTimeout(() => document.getElementById('new-card-name').focus(), 60);
}

// ═══════════════════════════════════════════════════════════
//  MODAL HELPERS
// ═══════════════════════════════════════════════════════════
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  document.getElementById('overlay').classList.remove('hidden');
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  const any = ['modal-members','modal-projects','modal-new-card']
    .some(m => !document.getElementById(m).classList.contains('hidden'));
  if (!any) document.getElementById('overlay').classList.add('hidden');
}

// ═══════════════════════════════════════════════════════════
//  IMAGE RESIZE
// ═══════════════════════════════════════════════════════════
function resizeImg(file, w, h) {
  return new Promise(resolve => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      const sz = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width-sz)/2, (img.height-sz)/2, sz, sz, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', .82));
    };
    img.src = url;
  });
}

// ═══════════════════════════════════════════════════════════
//  SCROLL
// ═══════════════════════════════════════════════════════════
function scrollToToday() {
  const col = document.querySelector('.col.today');
  if (!col) return;
  const wrap = document.getElementById('board-wrapper');
  const wr = wrap.getBoundingClientRect(), cr = col.getBoundingClientRect();
  wrap.scrollBy({ left: cr.left - wr.left - 14, behavior: 'smooth' });
}

function initScroll() {
  document.getElementById('board-wrapper').addEventListener('wheel', e => {
    if (e.shiftKey) { e.preventDefault(); e.currentTarget.scrollLeft += e.deltaY; }
  }, { passive: false });
}

// ═══════════════════════════════════════════════════════════
//  TOOLBAR
// ═══════════════════════════════════════════════════════════
function initToolbar() {
  document.getElementById('btn-hoje').addEventListener('click', scrollToToday);

  document.getElementById('btn-members').addEventListener('click', () => {
    renderMembersModal(); openModal('modal-members');
  });
  document.getElementById('close-members').addEventListener('click', () => closeModal('modal-members'));
  document.getElementById('add-member-btn').addEventListener('click', async () => {
    const members = clone(S.members);
    members.push({ id:'m'+Date.now(), name:'Novo Membro', color:COLORS[members.length%COLORS.length], photoURL:null });
    await saveCfg({ members });
  });

  document.getElementById('btn-projects').addEventListener('click', () => {
    renderProjectsModal(); openModal('modal-projects');
  });
  document.getElementById('close-projects').addEventListener('click', () => closeModal('modal-projects'));
  document.getElementById('add-project-btn').addEventListener('click', async () => {
    const projects = clone(S.projects);
    projects.push({ id:'p'+Date.now(), sigla:'NOVO', name:'Novo Projeto', color:COLORS[projects.length%COLORS.length] });
    await saveCfg({ projects });
  });

  document.getElementById('close-new-card').addEventListener('click', () => closeModal('modal-new-card'));
  document.getElementById('create-card-btn').addEventListener('click', async () => {
    const name      = document.getElementById('new-card-name').value.trim();
    const projectId = document.getElementById('new-card-project').value || null;
    const memberIds = [...document.querySelectorAll('#new-card-members input:checked')].map(cb => cb.value);
    if (!name) { document.getElementById('new-card-name').focus(); return; }
    await createCard(pendingDay, projectId, name, memberIds);
    closeModal('modal-new-card');
  });
  document.getElementById('new-card-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('create-card-btn').click();
  });

  document.getElementById('overlay').addEventListener('click', () => {
    ['modal-members','modal-projects','modal-new-card'].forEach(closeModal);
  });
}

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════
function init() {
  renderBoard();
  initToolbar();
  initDropZones();
  initScroll();
  initListeners();
  setTimeout(scrollToToday, 250);
}

init();
