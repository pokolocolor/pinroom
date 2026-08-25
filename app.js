'use strict';

/* =========================================================
   0. 상태 & 상수
   ========================================================= */
const LS_PERSON_DB = 'pinhigh_person_db_v1';
const LS_PLACE_DB = 'pinhigh_place_db_v1';
const HANDICAP_MIN = -25;
const HANDICAP_MAX = 40;
const SHUFFLE_MS = 2000;
const SHUFFLE_TICK_MS = 130;
const ROOM_GAP_MS = 250;

let rooms = [];          // { id, name, left }
let people = [];         // { id, name, handicap, left }
let personDB = [];       // { id, name, handicap, left }
let placeDB = [];        // string[]
let eventInfo = { date: '', place: '' };
let lastDrawResult = null; // { mode, groups, warning, stats }
let selectedHandicap = null;
let ocrRawText = '';
let ocrParsedRows = [];  // { name, handicap, left, selected }
let cropDragState = null;
let idCounter = 1;
let isDrawing = false;

/* =========================================================
   1. DOM 헬퍼 & 유틸
   ========================================================= */
function $(id) { return document.getElementById(id); }
function $$(sel) { return document.querySelectorAll(sel); }

function nextId() { return 'id' + (idCounter++) + '_' + Date.now(); }

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function compareRooms(a, b) {
  return (parseInt(a.name, 10) || 0) - (parseInt(b.name, 10) || 0);
}

function modeLabel(mode) {
  if (mode === 'random') return '랜덤 방배정';
  if (mode === 'handicap') return '핸디 균형 배정';
  return '방배정';
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatEventDate(dateStr) {
  if (!dateStr) return '날짜 미정';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const week = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${week[d.getDay()]})`;
}

/* =========================================================
   2. 토스트
   ========================================================= */
let toastTimer = null;
function showToast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* =========================================================
   3. 로컬스토리지: 참가자 DB / 장소 DB
   ========================================================= */
function loadPersonDB() {
  try {
    const raw = localStorage.getItem(LS_PERSON_DB);
    personDB = raw ? JSON.parse(raw) : [];
  } catch (err) {
    personDB = [];
  }
}
function savePersonDB() {
  try { localStorage.setItem(LS_PERSON_DB, JSON.stringify(personDB)); } catch (err) {}
}
function loadPlaceDB() {
  try {
    const raw = localStorage.getItem(LS_PLACE_DB);
    placeDB = raw ? JSON.parse(raw) : [];
  } catch (err) {
    placeDB = [];
  }
}
function savePlaceDB() {
  try { localStorage.setItem(LS_PLACE_DB, JSON.stringify(placeDB)); } catch (err) {}
}

function upsertPersonDB(person) {
  const existing = personDB.find(p => p.name === person.name);
  if (existing) {
    existing.handicap = person.handicap;
    existing.left = person.left;
  } else {
    personDB.push({ id: nextId(), name: person.name, handicap: person.handicap, left: person.left });
  }
  savePersonDB();
  renderDatabase();
}

function upsertPlaceDB(place) {
  placeDB = [place, ...placeDB.filter(p => p.toLowerCase() !== place.toLowerCase())].slice(0, 12);
  savePlaceDB();
  renderPlaceChips();
}

/* =========================================================
   4. 모임 정보 (날짜 / 장소)
   ========================================================= */
function updateEventLabel() {
  const label = $('eventCurrentLabel');
  if (!eventInfo.date && !eventInfo.place) {
    label.textContent = '날짜와 장소를 입력해주세요.';
    return;
  }
  const datePart = eventInfo.date ? formatEventDate(eventInfo.date) : '날짜 미정';
  const placePart = eventInfo.place ? eventInfo.place.trim() : '장소 미정';
  label.textContent = `${datePart} · ${placePart}`;
}

function renderPlaceChips() {
  const row = $('placeDbRow');
  const chipsEl = $('placeDbChips');
  row.style.display = placeDB.length ? 'flex' : 'none';
  chipsEl.innerHTML = placeDB.map(place => `
    <span class="place-chip${eventInfo.place === place ? ' active' : ''}">
      <button type="button" class="place-chip-select" data-place="${esc(place)}">${esc(place)}</button>
      <button type="button" class="place-chip-remove" data-place="${esc(place)}" aria-label="장소 삭제">×</button>
    </span>
  `).join('');
}

/* =========================================================
   5. 방 등록
   ========================================================= */
function renderRooms() {
  const listEl = $('roomList');
  const emptyEl = $('roomEmpty');
  const sorted = [...rooms].sort(compareRooms);
  $('roomCount').textContent = `${rooms.length}개`;
  emptyEl.style.display = rooms.length ? 'none' : 'block';
  listEl.innerHTML = sorted.map(r => `
    <div class="chip">${esc(r.name)}번 방${r.left ? '<span class="left-tag">좌타</span>' : ''}<button type="button" data-id="${r.id}" aria-label="방 삭제">×</button></div>
  `).join('');
}

function handleAddRoomClick() {
  const input = $('roomInput');
  const value = input.value.trim();
  if (!value) { showToast('방 번호를 입력해주세요.'); input.focus(); return; }
  if (rooms.some(r => r.name === value)) { showToast('이미 등록된 방입니다.'); return; }
  rooms.push({ id: nextId(), name: value, left: $('leftRoomToggle').checked });
  invalidateResultIfNeeded();
  renderRooms();
  input.value = '';
  $('leftRoomToggle').checked = false;
  input.focus();
}

function removeRoom(id) {
  rooms = rooms.filter(r => r.id !== id);
  invalidateResultIfNeeded();
  renderRooms();
}

/* =========================================================
   6. 참가자 등록
   ========================================================= */
function renderPeople() {
  const listEl = $('personList');
  const emptyEl = $('personEmpty');
  $('personCount').textContent = `${people.length}명`;
  emptyEl.style.display = people.length ? 'none' : 'block';
  listEl.innerHTML = people.map(p => `
    <div class="chip">${esc(p.name)}${p.left ? '<span class="left-tag">좌타</span>' : ''}<span class="handi-tag">H${p.handicap}</span><button type="button" data-id="${p.id}" aria-label="참가자 삭제">×</button></div>
  `).join('');
}

function addPersonObject({ name, handicap, left }) {
  const person = { id: nextId(), name: String(name).trim(), handicap: Number(handicap) || 0, left: !!left };
  people.push(person);
  upsertPersonDB(person);
  return person;
}

function handleAddPersonClick() {
  const nameInput = $('personInput');
  const name = nameInput.value.trim();
  if (!name) { showToast('이름을 입력해주세요.'); nameInput.focus(); return; }
  if (selectedHandicap === null) { showToast('핸디를 선택해주세요.'); return; }
  const left = $('leftPersonToggle').checked;
  addPersonObject({ name, handicap: selectedHandicap, left });
  invalidateResultIfNeeded();
  renderPeople();
  renderDatabase();
  nameInput.value = '';
  $('leftPersonToggle').checked = false;
  selectedHandicap = null;
  $('personHandicapBtnLabel').textContent = '핸디';
  nameInput.focus();
}

function removePerson(id) {
  people = people.filter(p => p.id !== id);
  invalidateResultIfNeeded();
  renderPeople();
  renderDatabase();
}

function invalidateResultIfNeeded() {
  if (lastDrawResult) {
    lastDrawResult = null;
    $('result').innerHTML = '';
    $('makeCardBtn').disabled = true;
  }
}

/* =========================================================
   7. 참가자 데이터베이스
   ========================================================= */
function renderDatabase() {
  $('databaseCount').textContent = `${personDB.length}명`;
  $('databaseEmpty').style.display = personDB.length ? 'none' : 'block';
  const currentNames = new Set(people.map(p => p.name));
  $('databaseList').innerHTML = personDB.map(dp => {
    const already = currentNames.has(dp.name);
    return `
    <div class="db-row">
      <button type="button" class="db-person-btn${already ? ' selected' : ''}" data-name="${esc(dp.name)}" ${already ? 'disabled' : ''}>
        <span class="db-name">${esc(dp.name)} ${dp.left ? '· 좌타 ' : ''}· H${dp.handicap}</span>
        <span class="db-action">${already ? '등록됨' : '추가'}</span>
      </button>
      <button type="button" class="db-delete" data-id="${dp.id}" aria-label="DB에서 삭제">🗑</button>
    </div>`;
  }).join('');
}

/* =========================================================
   8. 핸디 선택 다이얼로그
   ========================================================= */
function buildHandicapGrid() {
  let html = '';
  for (let v = HANDICAP_MIN; v <= HANDICAP_MAX; v++) {
    html += `<button type="button" class="handicap-grid-btn" data-value="${v}">${v}</button>`;
  }
  $('handicapGrid').innerHTML = html;
}

/* =========================================================
   9. OCR 이미지 일괄 등록 (영역 선택 + 인식 + 확인)
   ========================================================= */
function getCroppedImageDataURL() {
  const img = $('cropImagePreview');
  if (cropDragState && cropDragState.final && cropDragState.final.width > 15 && cropDragState.final.height > 15) {
    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;
    const sx = cropDragState.final.left * scaleX;
    const sy = cropDragState.final.top * scaleY;
    const sw = cropDragState.final.width * scaleX;
    const sh = cropDragState.final.height * scaleY;
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas.toDataURL('image/png');
  }
  return img.src;
}

function parseOcrLine(line) {
  const leftFlag = /좌타|left/i.test(line);
  const cleaned = line.replace(/좌타|left/gi, '').trim();
  const nameMatch = cleaned.match(/([가-힣]{2,6}|[A-Za-z]{2,15})/);
  const numMatch = cleaned.match(/-?\d{1,2}/);
  if (!nameMatch) return null;
  return {
    name: nameMatch[1].trim(),
    handicap: numMatch ? parseInt(numMatch[0], 10) : 0,
    left: leftFlag,
    selected: true
  };
}

function parseOcrText(text) {
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(parseOcrLine).filter(Boolean);
}

async function runOcr(dataUrl) {
  const loadingDialog = $('ocrLoadingDialog');
  const loadingText = $('ocrLoadingText');
  loadingText.textContent = '이미지 분석 중... 0%';
  loadingDialog.showModal();
  try {
    const { data } = await Tesseract.recognize(dataUrl, 'kor+eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          const pct = Math.round((m.progress || 0) * 100);
          loadingText.textContent = `이미지 분석 중... ${pct}%`;
        }
      }
    });
    ocrRawText = data.text || '';
    ocrParsedRows = parseOcrText(ocrRawText);
    loadingDialog.close();
    renderImportList();
    $('importDialog').showModal();
  } catch (err) {
    console.error(err);
    loadingDialog.close();
    showToast('이미지 인식에 실패했어요. 다시 시도해주세요.');
  }
}

function renderImportList() {
  const list = $('importList');
  $('importCountLabel').textContent = `${ocrParsedRows.length}명 인식됨`;
  $('importSelectAll').checked = ocrParsedRows.length > 0 && ocrParsedRows.every(r => r.selected);
  if (!ocrParsedRows.length) {
    list.innerHTML = '<div class="import-empty">인식된 이름이 없어요. 원문을 확인하거나 이미지를 다시 선택해보세요.</div>';
    return;
  }
  list.innerHTML = ocrParsedRows.map((row, i) => `
    <div class="import-row" data-index="${i}">
      <div class="import-check"><input type="checkbox" class="import-row-check" ${row.selected ? 'checked' : ''}></div>
      <div class="import-fields">
        <input type="text" class="import-name-input" value="${esc(row.name)}" maxlength="20">
        <input type="number" class="import-handi-input" value="${row.handicap}" step="1">
        <label class="import-left-check"><input type="checkbox" class="import-left-input" ${row.left ? 'checked' : ''}> 좌타</label>
      </div>
    </div>
  `).join('');
}

/* =========================================================
   10. 방배정: 랜덤 배정 / 핸디 균형 배정 (계산 로직)
   ========================================================= */
function computeRandomAssignment() {
  const total = people.length;
  const roomCount = rooms.length;
  const minTotal = roomCount * 2;
  const maxTotal = roomCount * 3;
  if (total < minTotal || total > maxTotal) {
    throw new Error(`현재 인원(${total}명)으로는 각 방을 2~3명으로 배정할 수 없어요. ${minTotal}~${maxTotal}명이 필요합니다.`);
  }

  const extra = total - minTotal;
  const targetMap = new Map();
  rooms.forEach(r => targetMap.set(r.id, 2));
  shuffle([...rooms]).slice(0, extra).forEach(r => targetMap.set(r.id, 3));

  const bucket = new Map();
  rooms.forEach(r => bucket.set(r.id, []));

  const leftRooms = shuffle(rooms.filter(r => r.left));
  const leftQueue = shuffle(people.filter(p => p.left));
  const normalPeople = shuffle(people.filter(p => !p.left));

  for (const room of leftRooms) {
    const target = targetMap.get(room.id);
    while (bucket.get(room.id).length < target && leftQueue.length) {
      bucket.get(room.id).push(leftQueue.shift());
    }
  }

  const warning = leftQueue.length > 0;
  const remainingPeople = shuffle([...leftQueue, ...normalPeople]);

  for (const room of shuffle([...rooms])) {
    const target = targetMap.get(room.id);
    while (bucket.get(room.id).length < target && remainingPeople.length) {
      bucket.get(room.id).push(remainingPeople.shift());
    }
  }

  const groups = rooms.map(r => ({ room: r, people: bucket.get(r.id) }));
  return { groups, warning };
}

function computeHandicapAssignment() {
  const roomCount = rooms.length;
  const total = people.length;
  if (total < roomCount) {
    throw new Error(`참가자(${total}명)가 방 개수(${roomCount}개)보다 적어 배정할 수 없어요.`);
  }

  const base = Math.floor(total / roomCount);
  const remainder = total % roomCount;
  const targetMap = new Map();
  rooms.forEach(r => targetMap.set(r.id, base));
  shuffle([...rooms]).slice(0, remainder).forEach(r => targetMap.set(r.id, targetMap.get(r.id) + 1));

  const bucket = new Map();
  rooms.forEach(r => bucket.set(r.id, []));

  const leftRoomsOrdered = rooms.filter(r => r.left).sort(compareRooms);
  const leftPeopleSorted = people.filter(p => p.left).sort((a, b) => a.handicap - b.handicap);

  let li = 0;
  while (li < leftPeopleSorted.length) {
    let placedAny = false;
    for (const room of leftRoomsOrdered) {
      if (li >= leftPeopleSorted.length) break;
      if (bucket.get(room.id).length < targetMap.get(room.id)) {
        bucket.get(room.id).push(leftPeopleSorted[li]);
        li++;
        placedAny = true;
      }
    }
    if (!placedAny) break;
  }
  const leftoverLeft = leftPeopleSorted.slice(li);
  const warning = leftoverLeft.length > 0;

  const normalPeopleAll = people.filter(p => !p.left);
  const remainingSorted = [...leftoverLeft, ...normalPeopleAll].sort((a, b) => a.handicap - b.handicap);
  const roomsOrdered = [...rooms].sort(compareRooms);

  let idx = 0;
  while (idx < remainingSorted.length) {
    let placedAny = false;
    for (const room of roomsOrdered) {
      if (idx >= remainingSorted.length) break;
      if (bucket.get(room.id).length < targetMap.get(room.id)) {
        bucket.get(room.id).push(remainingSorted[idx]);
        idx++;
        placedAny = true;
      }
    }
    if (!placedAny) break;
  }

  const groups = rooms.map(r => ({ room: r, people: bucket.get(r.id) }));
  const overallAvg = people.reduce((s, p) => s + p.handicap, 0) / people.length;
  const roomStats = groups.map(g => {
    const avg = g.people.length ? g.people.reduce((s, p) => s + p.handicap, 0) / g.people.length : 0;
    return { roomId: g.room.id, avg, deviation: avg - overallAvg };
  });
  const maxDev = Math.max(0, ...roomStats.map(s => Math.abs(s.deviation)));
  const balanceScore = Math.max(0, 100 - maxDev * 12);

  return { groups, warning, stats: { overallAvg, roomStats, balanceScore } };
}

function validateRoomsAndPeople() {
  if (!rooms.length) { showToast('방을 먼저 등록해주세요.'); return false; }
  if (!people.length) { showToast('참가자를 먼저 등록해주세요.'); return false; }
  return true;
}

/* =========================================================
   11. 방배정 결과 화면: 방 순서대로 셔플 애니메이션 후 순차 공개
   ========================================================= */
function renderResultShell(result) {
  const container = $('result');
  const sortedGroups = [...result.groups].sort((a, b) => compareRooms(a.room, b.room));
  const totalPeople = sortedGroups.reduce((s, g) => s + g.people.length, 0);

  let html = `<div class="result-card">
    <div class="result-head"><strong>배정 결과</strong><span>${esc(modeLabel(result.mode))} · 참가자 ${totalPeople}명 · ${sortedGroups.length}개 방</span></div>`;

  if (result.warning) {
    html += `<div class="result-warning">⚠️ 좌타 참가자가 있지만 좌타방이 부족하거나 없어 일부 좌타 참가자가 일반 방에 배정되었습니다.</div>`;
  }

  if (result.mode === 'handicap' && result.stats) {
    html += `<div class="handicap-overview" id="handicapOverview" style="opacity:0;transition:opacity .4s ease;">
      <div class="overview-item"><span>전체 평균 핸디</span><b>${result.stats.overallAvg.toFixed(1)}</b></div>
      <div class="overview-item"><span>방별 균형도</span><b id="balanceScoreLabel">0%</b></div>
    </div>
    <div class="balance-bar-track"><div class="balance-bar-fill" id="balanceBarFill" style="width:0%"></div></div>`;
  }

  html += `<div class="assignment" id="assignmentWrap">`;
  sortedGroups.forEach(g => {
    html += `<div class="room-result pending-room" data-room-id="${g.room.id}">
      <div class="room-result-title"><b>${esc(g.room.name)}번 방</b>${g.room.left ? '<span class="left-tag">좌타방</span>' : ''}<span class="room-status">대기 중</span></div>
      <div class="result-people"></div>
    </div>`;
  });
  html += `</div></div>`;

  container.innerHTML = html;
}

async function revealResultSequentially(result) {
  const sortedGroups = [...result.groups].sort((a, b) => compareRooms(a.room, b.room));
  const allNames = people.map(p => p.name);

  for (const g of sortedGroups) {
    const roomEl = document.querySelector(`.room-result[data-room-id="${g.room.id}"]`);
    if (!roomEl) continue;
    const statusEl = roomEl.querySelector('.room-status');
    const peopleWrap = roomEl.querySelector('.result-people');

    roomEl.classList.remove('pending-room');
    roomEl.classList.add('shuffling-room');
    statusEl.textContent = '배정 중...';
    statusEl.classList.add('shuffle-label');

    const shuffleCount = Math.max(1, g.people.length);
    const timer = setInterval(() => {
      const picks = shuffle(allNames).slice(0, shuffleCount);
      peopleWrap.innerHTML = picks.map(n => `<span class="person shuffle-chip">${esc(n)}</span>`).join('');
    }, SHUFFLE_TICK_MS);

    await delay(SHUFFLE_MS);
    clearInterval(timer);

    roomEl.classList.remove('shuffling-room');
    statusEl.classList.remove('shuffle-label');
    statusEl.textContent = `${g.people.length}명`;

    peopleWrap.innerHTML = g.people.map(p =>
      `<span class="person${p.left ? ' left' : ''}">${esc(p.name)}${p.left ? ' · 좌타' : ''}<span class="handi-badge">· H${p.handicap}</span></span>`
    ).join('');
    Array.from(peopleWrap.children).forEach((el, idx) => {
      el.classList.add('reveal-item-done');
      el.style.animationDelay = `${idx * 70}ms`;
    });

    if (result.mode === 'handicap' && result.stats) {
      const stat = result.stats.roomStats.find(s => s.roomId === g.room.id);
      if (stat) {
        const devAbs = Math.abs(stat.deviation);
        const devClass = devAbs <= 1 ? 'dev-good' : devAbs <= 3 ? 'dev-ok' : 'dev-warn';
        const statsHtml = `<div class="handicap-stats reveal-item-done">
          <span class="stat-chip">평균 <b>${stat.avg.toFixed(1)}</b></span>
          <span class="stat-chip ${devClass}">편차 <b>${stat.deviation >= 0 ? '+' : ''}${stat.deviation.toFixed(1)}</b></span>
        </div>`;
        roomEl.insertAdjacentHTML('beforeend', statsHtml);
      }
    }

    await delay(ROOM_GAP_MS);
  }

  if (result.mode === 'handicap' && result.stats) {
    const overviewEl = $('handicapOverview');
    const fillEl = $('balanceBarFill');
    const scoreLabel = $('balanceScoreLabel');
    if (overviewEl) overviewEl.style.opacity = '1';
    if (fillEl) fillEl.style.width = `${Math.round(result.stats.balanceScore)}%`;
    if (scoreLabel) scoreLabel.textContent = `${Math.round(result.stats.balanceScore)}%`;
  }
}

async function runDrawSequence(result) {
  isDrawing = true;
  const randomBtn = $('drawRandomBtn');
  const handicapBtn = $('drawHandicapBtn');
  const makeCardBtn = $('makeCardBtn');
  const originalRandomHTML = randomBtn.innerHTML;
  const originalHandicapHTML = handicapBtn.innerHTML;
  const activeBtn = result.mode === 'random' ? randomBtn : handicapBtn;

  randomBtn.disabled = true;
  handicapBtn.disabled = true;
  makeCardBtn.disabled = true;
  activeBtn.innerHTML = '<span class="btn-spinner"></span> 배정 중...';

  try {
    lastDrawResult = null;
    renderResultShell(result);
    await revealResultSequentially(result);
    lastDrawResult = result;
    makeCardBtn.disabled = false;
  } catch (err) {
    console.error(err);
    showToast('배정 애니메이션 중 오류가 발생했어요. 다시 시도해주세요.');
  } finally {
    randomBtn.disabled = false;
    handicapBtn.disabled = false;
    randomBtn.innerHTML = originalRandomHTML;
    handicapBtn.innerHTML = originalHandicapHTML;
    isDrawing = false;
  }
}

async function handleRandomDraw() {
  if (isDrawing) return;
  if (!validateRoomsAndPeople()) return;
  let result;
  try {
    const { groups, warning } = computeRandomAssignment();
    result = { mode: 'random', groups, warning };
  } catch (err) {
    showToast(err.message || '배정 중 오류가 발생했어요. 다시 시도해주세요.');
    return;
  }
  await runDrawSequence(result);
}

async function handleHandicapDraw() {
  if (isDrawing) return;
  if (!validateRoomsAndPeople()) return;
  let result;
  try {
    const r = computeHandicapAssignment();
    result = { mode: 'handicap', groups: r.groups, warning: r.warning, stats: r.stats };
  } catch (err) {
    showToast(err.message || '배정 중 오류가 발생했어요. 다시 시도해주세요.');
    return;
  }
  await runDrawSequence(result);
}

/* =========================================================
   12. 배정 결과 카드 생성 / 저장 / 공유
   ========================================================= */
function buildTarotCardMarkup() {
  if (!lastDrawResult) return '';
  const sortedGroups = [...lastDrawResult.groups].sort((a, b) => compareRooms(a.room, b.room));
  const totalPeople = sortedGroups.reduce((s, g) => s + g.people.length, 0);

  return `
    <div class="tarot-header">
      <div class="tarot-date">${esc(formatEventDate(eventInfo.date))} · ${esc(eventInfo.place || '장소 미정')}</div>
      <div class="tarot-title">TEAM PINHIGH</div>
      <div class="tarot-mode">${esc(modeLabel(lastDrawResult.mode))}</div>
    </div>
    <div class="tarot-body">
      ${sortedGroups.map(g => `
        <div class="tarot-room">
          <div class="tarot-room-title">
            🏌️ ${esc(g.room.name)}번 방${g.room.left ? ' · 좌타방' : ''}
            <span>${g.people.length}명</span>
          </div>
          <div class="tarot-room-people">
            ${g.people.map(p => `
              <span class="tarot-person${p.left ? ' left' : ''}">${esc(p.name)}${p.left ? ' · 좌타' : ''} · H${p.handicap}</span>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
    <div class="tarot-footer">TEAM PINHIGH GOLF CLUB · ${totalPeople}명 · ${sortedGroups.length}개 방</div>
  `;
}

async function generateCardImage() {
  const node = $('tarotCard');
  const canvas = await html2canvas(node, { scale: 3, backgroundColor: null, useCORS: true });
  return await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

function showImageForLongPressSave(blob) {
  const url = URL.createObjectURL(blob);
  $('imageSaveTarget').src = url;
  $('imageSaveOverlay').showModal();
}

async function handleSaveCard() {
  const btn = $('saveCardBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '이미지 생성 중...';
  try {
    const blob = await generateCardImage();
    const file = new File([blob], `핀하이_방배정_${todayISO()}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: '핀하이 방배정 결과' });
      showToast('공유창에서 사진첩에 저장해주세요.');
    } else {
      showImageForLongPressSave(blob);
    }
  } catch (err) {
    if (!(err && err.name === 'AbortError')) {
      console.error(err);
      showToast('이미지 생성에 실패했어요. 다시 시도해주세요.');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function handleShareCard() {
  const btn = $('shareCardBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '이미지 생성 중...';
  try {
    const blob = await generateCardImage();
    const file = new File([blob], `핀하이_방배정_${todayISO()}.png`, { type: 'image/png' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: '핀하이 방배정 결과', text: '핀하이 정모 방배정 결과입니다.' });
    } else {
      showImageForLongPressSave(blob);
      showToast('이 브라우저는 공유가 지원되지 않아 길게 눌러 저장하는 화면으로 안내합니다.');
    }
  } catch (err) {
    if (!(err && err.name === 'AbortError')) {
      console.error(err);
      showToast('공유에 실패했어요. 다시 시도해주세요.');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

/* =========================================================
   13. 초기화 / 배경 클릭 시 다이얼로그 닫기
   ========================================================= */
function attachBackdropClose(dialog) {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
}

/* =========================================================
   14. 이벤트 리스너 바인딩 & 초기화
   ========================================================= */
function bindEvents() {
  // 모임 정보
  $('eventDateInput').addEventListener('input', () => {
    eventInfo.date = $('eventDateInput').value;
    updateEventLabel();
  });
  $('setTodayBtn').addEventListener('click', () => {
    $('eventDateInput').value = todayISO();
    eventInfo.date = $('eventDateInput').value;
    updateEventLabel();
  });
  $('eventPlaceInput').addEventListener('input', () => {
    eventInfo.place = $('eventPlaceInput').value;
    updateEventLabel();
  });
  $('eventPlaceInput').addEventListener('blur', () => {
    const val = (eventInfo.place || '').trim();
    if (val && !placeDB.some(p => p.toLowerCase() === val.toLowerCase())) {
      upsertPlaceDB(val);
    } else {
      renderPlaceChips();
    }
  });
  $('placeDbChips').addEventListener('click', (e) => {
    const selectBtn = e.target.closest('.place-chip-select');
    const removeBtn = e.target.closest('.place-chip-remove');
    if (selectBtn) {
      const place = selectBtn.dataset.place;
      $('eventPlaceInput').value = place;
      eventInfo.place = place;
      updateEventLabel();
      renderPlaceChips();
    } else if (removeBtn) {
      const place = removeBtn.dataset.place;
      placeDB = placeDB.filter(p => p !== place);
      savePlaceDB();
      renderPlaceChips();
    }
  });

  // 방 등록
  $('addRoomBtn').addEventListener('click', handleAddRoomClick);
  $('roomInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAddRoomClick(); }
  });
  $('roomList').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-id]');
    if (btn) removeRoom(btn.dataset.id);
  });

  // 참가자 등록
  $('addPersonBtn').addEventListener('click', handleAddPersonClick);
  $('personInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAddPersonClick(); }
  });
  $('personList').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-id]');
    if (btn) removePerson(btn.dataset.id);
  });

  // 핸디 선택 다이얼로그
  $('personHandicapBtn').addEventListener('click', () => {

    $$('#handicapGrid .handicap-grid-btn').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.value) === selectedHandicap);
    });
    $('handicapDialog').showModal();
  });
  $('handicapGrid').addEventListener('click', (e) => {
    const btn = e.target.closest('.handicap-grid-btn');
    if (!btn) return;
    selectedHandicap = Number(btn.dataset.value);
    $('personHandicapBtnLabel').textContent = `H${selectedHandicap}`;
    $('handicapDialog').close();
  });
  $('closeHandicapDialog').addEventListener('click', () => $('handicapDialog').close());

  // 참가자 DB
  $('databaseList').addEventListener('click', (e) => {
    const addBtn = e.target.closest('.db-person-btn');
    const delBtn = e.target.closest('.db-delete');
    if (addBtn && !addBtn.disabled) {
      const name = addBtn.dataset.name;
      const dp = personDB.find(p => p.name === name);
      if (dp) {
        addPersonObject({ name: dp.name, handicap: dp.handicap, left: dp.left });
        invalidateResultIfNeeded();
        renderPeople();
        renderDatabase();
      }
    } else if (delBtn) {
      personDB = personDB.filter(p => p.id !== delBtn.dataset.id);
      savePersonDB();
      renderDatabase();
    }
  });
  $('clearDatabaseBtn').addEventListener('click', () => {
    if (!personDB.length) return;
    if (!confirm('참가자 DB를 전체 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) return;
    personDB = [];
    savePersonDB();
    renderDatabase();
    showToast('참가자 DB를 모두 삭제했습니다.');
  });

  // OCR 일괄 등록
  $('importImageBtn').addEventListener('click', () => $('importImageInput').click());
  $('importImageInput').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = $('cropImagePreview');
      img.onload = () => {
        $('cropSelectionBox').style.display = 'none';
        cropDragState = null;
        $('cropDialog').showModal();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  const cropFrame = $('cropFrame');
  const selBox = $('cropSelectionBox');
  cropFrame.addEventListener('pointerdown', (e) => {
    const rect = cropFrame.getBoundingClientRect();
    cropDragState = { startX: e.clientX - rect.left, startY: e.clientY - rect.top, rect };
    selBox.style.display = 'block';
    selBox.style.left = cropDragState.startX + 'px';
    selBox.style.top = cropDragState.startY + 'px';
    selBox.style.width = '0px';
    selBox.style.height = '0px';
    try { cropFrame.setPointerCapture(e.pointerId); } catch (err) {}
  });
  cropFrame.addEventListener('pointermove', (e) => {
    if (!cropDragState) return;
    const rect = cropDragState.rect;
    let curX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    let curY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    const left = Math.min(curX, cropDragState.startX);
    const top = Math.min(curY, cropDragState.startY);
    const width = Math.abs(curX - cropDragState.startX);
    const height = Math.abs(curY - cropDragState.startY);
    selBox.style.left = left + 'px';
    selBox.style.top = top + 'px';
    selBox.style.width = width + 'px';
    selBox.style.height = height + 'px';
    cropDragState.current = { left, top, width, height };
  });
  function endCropDrag() {
    if (!cropDragState) return;
    cropDragState.final = cropDragState.current || null;
  }
  cropFrame.addEventListener('pointerup', endCropDrag);
  cropFrame.addEventListener('pointercancel', endCropDrag);

  $('cropResetBtn').addEventListener('click', () => {
    selBox.style.display = 'none';
    cropDragState = null;
  });
  $('closeCropDialog').addEventListener('click', () => $('cropDialog').close());
  $('cropCancelBtn').addEventListener('click', () => $('cropDialog').close());
  $('cropConfirmBtn').addEventListener('click', async () => {
    const dataUrl = getCroppedImageDataURL();
    $('cropDialog').close();
    await runOcr(dataUrl);
  });

  $('closeImportDialog').addEventListener('click', () => $('importDialog').close());
  $('importCancelBtn').addEventListener('click', () => $('importDialog').close());
  $('importSelectAll').addEventListener('change', (e) => {
    const checked = e.target.checked;
    ocrParsedRows.forEach(r => r.selected = checked);

    $$('#importList .import-row-check').forEach(cb => cb.checked = checked);
  });
  $('importList').addEventListener('change', (e) => {
    const row = e.target.closest('.import-row');
    if (!row) return;
    const idx = Number(row.dataset.index);
    if (e.target.classList.contains('import-row-check')) {
      ocrParsedRows[idx].selected = e.target.checked;
    } else if (e.target.classList.contains('import-name-input')) {
      ocrParsedRows[idx].name = e.target.value;
    } else if (e.target.classList.contains('import-handi-input')) {
      ocrParsedRows[idx].handicap = Number(e.target.value) || 0;
    } else if (e.target.classList.contains('import-left-input')) {
      ocrParsedRows[idx].left = e.target.checked;
    }
  });
  $('importConfirmBtn').addEventListener('click', () => {
    const rows = ocrParsedRows.filter(r => r.selected && r.name && r.name.trim());
    if (!rows.length) { showToast('등록할 항목을 선택해주세요.'); return; }
    rows.forEach(r => addPersonObject({ name: r.name.trim(), handicap: r.handicap, left: r.left }));
    invalidateResultIfNeeded();
    renderPeople();
    renderDatabase();
    $('importDialog').close();
    showToast(`${rows.length}명이 등록되었습니다.`);
  });
  $('viewRawTextBtn').addEventListener('click', () => {
    $('rawTextArea').value = ocrRawText || '(인식된 텍스트가 없습니다)';
    $('rawTextDialog').showModal();
  });
  $('closeRawTextDialog').addEventListener('click', () => $('rawTextDialog').close());

  // 방배정
  $('drawRandomBtn').addEventListener('click', handleRandomDraw);
  $('drawHandicapBtn').addEventListener('click', handleHandicapDraw);

  // 결과 카드
  $('makeCardBtn').addEventListener('click', () => {
    if (!lastDrawResult) return;
    $('tarotCard').innerHTML = buildTarotCardMarkup();
    $('shareCardDialog').showModal();
  });
  $('closeShareCardDialog').addEventListener('click', () => $('shareCardDialog').close());
  $('saveCardBtn').addEventListener('click', handleSaveCard);
  $('shareCardBtn').addEventListener('click', handleShareCard);
  $('closeImageSaveOverlay').addEventListener('click', () => {
    $('imageSaveOverlay').close();
    const img = $('imageSaveTarget');
    if (img.src && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
  });

  // 도움말 / 초기화
  $('helpBtn').addEventListener('click', () => $('helpDialog').showModal());
  $('closeHelp').addEventListener('click', () => $('helpDialog').close());
  $('resetBtn').addEventListener('click', () => {
    if (isDrawing) { showToast('배정 애니메이션이 끝난 뒤 초기화해주세요.'); return; }
    if (!rooms.length && !people.length && !lastDrawResult) { showToast('초기화할 내용이 없어요.'); return; }
    if (!confirm('등록된 방과 참가자, 배정 결과를 모두 초기화할까요?')) return;
    rooms = [];
    people = [];
    lastDrawResult = null;
    renderRooms();
    renderPeople();
    renderDatabase();
    $('result').innerHTML = '';
    $('makeCardBtn').disabled = true;
    showToast('초기화되었습니다.');
  });

  // 배경 클릭 시 닫히는 다이얼로그
  [$('helpDialog'), $('handicapDialog'), $('shareCardDialog'), $('rawTextDialog'), $('imageSaveOverlay')]
    .forEach(attachBackdropClose);
}

function init() {
  loadPersonDB();
  loadPlaceDB();
  buildHandicapGrid();

  const todayStr = todayISO();
  $('eventDateInput').value = todayStr;
  eventInfo.date = todayStr;
  updateEventLabel();

  renderRooms();
  renderPeople();
  renderDatabase();
  renderPlaceChips();

  bindEvents();
}

document.addEventListener('DOMContentLoaded', init);
