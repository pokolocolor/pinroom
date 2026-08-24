const $ = id => document.getElementById(id);

const STORAGE = {
  rooms: 'pinhigh_rooms_v3',
  people: 'pinhigh_people_v5',
  database: 'pinhigh_participant_database_v5',
  event: 'pinhigh_event_info_v1',
  places: 'pinhigh_place_database_v1'
};

let participantDB = normalizePeople(readJSON(STORAGE.database));
let rooms = normalizeRooms(readJSON(STORAGE.rooms));
let people = normalizePeople(readJSON(STORAGE.people));
let placeDB = normalizePlaces(readJSON(STORAGE.places));
let selectedHandicap = null;
let eventInfo = readEventInfo();
let lastDrawResult = null; // { groups: [{room, people}], mode: 'random' | 'handicap' }

function readJSON(key, fallback = []) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return Array.isArray(value) ? value : fallback;
  } catch { return fallback; }
}

function readEventInfo() {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE.event) || 'null');
    if (v && typeof v === 'object') {
      return { date: String(v.date || ''), place: String(v.place || '') };
    }
  } catch {}
  return { date: '', place: '' };
}

function saveEventInfo() {
  localStorage.setItem(STORAGE.event, JSON.stringify(eventInfo));
}

function formatEventDate(dateStr) {
  if (!dateStr) return '날짜 미정';
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return dateStr;
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

function loadEventInfoUI() {
  $('eventDateInput').value = eventInfo.date;
  $('eventPlaceInput').value = eventInfo.place;
  updateEventCurrentLabel();
  renderPlaceDB();
}

function updateEventCurrentLabel() {
  const label = $('eventCurrentLabel');
  if (!eventInfo.date && !eventInfo.place) {
    label.textContent = '날짜와 장소를 입력해주세요.';
    return;
  }
  label.textContent = `현재 설정: ${formatEventDate(eventInfo.date)} · ${eventInfo.place || '장소 미정'}`;
}

// =========================================================
// 장소 데이터베이스 (참가자 DB와 동일한 방식으로 로컬 저장)
// =========================================================

function normalizePlaces(list) {
  const seen = new Set();
  const result = [];
  (Array.isArray(list) ? list : []).forEach(p => {
    const name = String(p || '').trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  });
  return result.slice(0, 20);
}

function savePlaceDB() {
  placeDB = normalizePlaces(placeDB);
  localStorage.setItem(STORAGE.places, JSON.stringify(placeDB));
}

function rememberPlace(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return;
  placeDB = normalizePlaces([trimmed, ...placeDB.filter(p => p !== trimmed)]);
  savePlaceDB();
  renderPlaceDB();
}

function removePlaceFromDB(index) {
  const p = placeDB[index];
  if (!p) return;
  if (!window.confirm(`"${p}" 장소를 목록에서 삭제할까요?`)) return;
  placeDB.splice(index, 1);
  savePlaceDB();
  renderPlaceDB();
}

function selectPlace(index) {
  const p = placeDB[index];
  if (!p) return;
  $('eventPlaceInput').value = p;
  eventInfo.place = p;
  saveEventInfo();
  updateEventCurrentLabel();
  rememberPlace(p);
}

function renderPlaceDB() {
  const row = $('placeDbRow');
  const wrap = $('placeDbChips');
  if (!row || !wrap) return;

  if (!placeDB.length) {
    wrap.innerHTML = '';
    row.style.display = 'none';
    return;
  }

  row.style.display = 'flex';
  wrap.innerHTML = placeDB.map((p, i) => `
    <span class="place-chip${eventInfo.place === p ? ' active' : ''}">
      <button type="button" class="place-chip-select" onclick="selectPlace(${i})">${esc(p)}</button>
      <button type="button" class="place-chip-remove" onclick="removePlaceFromDB(${i})" aria-label="${esc(p)} 삭제">×</button>
    </span>
  `).join('');
}

function normalizePeople(list) {
  const map = new Map();
  (Array.isArray(list) ? list : []).forEach(p => {
    if (p && typeof p === 'object') {
      const name = String(p.name || '').trim();
      const handicap = Number(p.handicap);
      if (name && Number.isFinite(handicap)) {
        map.set(name, { name, left: !!p.left, handicap });
      }
    }
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

function roomNumber(room) {
  return Number.parseInt(String(room?.name ?? '').replace(/\D/g, ''), 10);
}

function compareRooms(a, b) {
  const na = roomNumber(a), nb = roomNumber(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  if (Number.isFinite(na)) return -1;
  if (Number.isFinite(nb)) return 1;
  return String(a?.name || '').localeCompare(String(b?.name || ''), 'ko', { numeric: true });
}

function normalizeRooms(list) {
  const map = new Map();
  (Array.isArray(list) ? list : []).forEach(r => {
    const name = typeof r === 'string' ? r.replace(/\D/g, '') : String(r?.name || '').replace(/\D/g, '');
    if (name) map.set(name, { name, left: !!r?.left });
  });
  return [...map.values()].sort(compareRooms);
}

function saveCurrent() {
  rooms = normalizeRooms(rooms);
  people = normalizePeople(people);
  localStorage.setItem(STORAGE.rooms, JSON.stringify(rooms));
  localStorage.setItem(STORAGE.people, JSON.stringify(people));
}

function saveDatabaseLocal() {
  participantDB = normalizePeople(participantDB);
  localStorage.setItem(STORAGE.database, JSON.stringify(participantDB));
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(window.__toast);
  window.__toast = setTimeout(() => el.classList.remove('show'), 2600);
}

function alertUser(msg) { window.alert(msg); }

function esc(s) {
  return String(s).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}

function leftTag(isLeft) {
  return isLeft ? '<small class="left-tag">좌타</small>' : '';
}

function handiTag(h) {
  return `<small class="handi-tag">HDCP ${h}</small>`;
}

function buildHandicapGrid() {
  const grid = $('handicapGrid');
  grid.innerHTML = '';
  for (let h = 40; h >= -25; h--) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'handicap-grid-btn';
    btn.textContent = h;
    btn.dataset.value = h;
    btn.addEventListener('click', () => {
      selectedHandicap = h;
      $('personHandicapBtnLabel').textContent = h;
      $('personHandicapBtn').classList.add('selected');
      $('handicapDialog').close();
      highlightHandicapGrid();
    });
    grid.appendChild(btn);
  }
}

function highlightHandicapGrid() {
  document.querySelectorAll('.handicap-grid-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.value) === selectedHandicap);
  });
}

function render() {
  rooms = normalizeRooms(rooms);
  people = normalizePeople(people);
  participantDB = normalizePeople(participantDB);

  $('roomCount').textContent = `${rooms.length}개`;
  $('personCount').textContent = `${people.length}명`;
  $('databaseCount').textContent = `${participantDB.length}명`;
  $('roomEmpty').style.display = rooms.length ? 'none' : 'block';
  $('personEmpty').style.display = people.length ? 'none' : 'block';
  $('databaseEmpty').style.display = participantDB.length ? 'none' : 'block';

  $('roomList').innerHTML = rooms.map((r, i) => `
    <div class="chip">
      <span>${esc(r.name)}번 방</span>
      ${leftTag(r.left)}
      <button type="button" onclick="removeRoom(${i})" aria-label="${esc(r.name)}번 방 삭제">×</button>
    </div>
  `).join('');

  $('personList').innerHTML = people.map((p, i) => `
    <div class="chip">
      <span>${esc(p.name)}</span>
      ${handiTag(p.handicap)}
      ${leftTag(p.left)}
      <button type="button" onclick="removePerson(${i})" aria-label="${esc(p.name)} 삭제">×</button>
    </div>
  `).join('');

  const currentNames = new Set(people.map(p => p.name));
  $('databaseList').innerHTML = participantDB.map((p, i) => {
    const selected = currentNames.has(p.name);
    return `
      <div class="db-row">
        <button type="button" class="db-person-btn ${selected ? 'selected' : ''}" onclick="addPersonFromDB(${i})" ${selected ? 'disabled' : ''}>
          <span class="db-name">${esc(p.name)}</span>
          ${handiTag(p.handicap)}
          ${leftTag(p.left)}
          <span class="db-action">${selected ? '등록됨' : '+ 등록'}</span>
        </button>
        <button type="button" class="db-delete" onclick="removeFromDB(${i})" aria-label="${esc(p.name)} DB 삭제">×</button>
      </div>
    `;
  }).join('');
}

function addRoom() {
  const raw = $('roomInput').value.trim();
  const name = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!name) {
    alertUser('방 번호를 숫자로 입력해주세요.');
    $('roomInput').focus();
    return;
  }
  if (rooms.some(r => r.name === name)) {
    alertUser(`${name}번 방은 이미 등록되어 있습니다.`);
    return;
  }
  rooms.push({ name, left: $('leftRoomToggle').checked });
  rooms = normalizeRooms(rooms);
  $('roomInput').value = '';
  $('leftRoomToggle').checked = false;
  saveCurrent();
  render();
  $('roomInput').focus();
}

function addPerson(name, handicapValue) {
  name = String(name || '').trim();
  const left = $('leftPersonToggle').checked;

  if (!name) {
    alertUser('참석자 이름을 입력해주세요.');
    $('personInput').focus();
    return false;
  }
  if (people.some(p => p.name === name)) {
    alertUser(`${name}님은 이미 이번 모임에 등록되어 있습니다.`);
    return false;
  }

  if (handicapValue === null || handicapValue === undefined || handicapValue === '') {
    alertUser('핸디를 선택해주세요.');
    $('personHandicapBtn').focus();
    return false;
  }
  const handicap = Number(handicapValue);
  if (!Number.isFinite(handicap)) {
    alertUser('핸디 값이 올바르지 않습니다. 다시 선택해주세요.');
    return false;
  }

  people.push({ name, left, handicap });
  participantDB = normalizePeople([...participantDB, { name, left, handicap }]);
  saveCurrent();
  saveDatabaseLocal();
  render();
  toast(`${name}${left ? ' (좌타)' : ''} · 핸디 ${handicap}님을 참석자로 등록했습니다.`);
  return true;
}

function addPersonFromInput() {
  const name = $('personInput').value.trim();
  if (addPerson(name, selectedHandicap)) {
    $('personInput').value = '';
    selectedHandicap = null;
    $('personHandicapBtnLabel').textContent = '핸디';
    $('personHandicapBtn').classList.remove('selected');
    $('leftPersonToggle').checked = false;
    $('personInput').focus();
  }
}

function addPersonFromDB(index) {
  const entry = participantDB[index];
  if (!entry) return;
  if (people.some(p => p.name === entry.name)) {
    alertUser(`${entry.name}님은 이미 이번 모임에 등록되어 있습니다.`);
    return;
  }
  people.push({ name: entry.name, left: entry.left, handicap: entry.handicap });
  saveCurrent();
  render();
  toast(`${entry.name}${entry.left ? ' (좌타)' : ''} · 핸디 ${entry.handicap}님을 참석자로 등록했습니다.`);
}

function removeRoom(i) {
  const room = rooms[i];
  if (!room) return;
  if (!window.confirm(`${room.name}번 방을 삭제할까요?`)) return;
  rooms.splice(i, 1);
  saveCurrent();
  render();
}

function removePerson(i) {
  const p = people[i];
  if (!p) return;
  if (!window.confirm(`${p.name}님을 이번 모임에서 삭제할까요?\n참가자 DB에서는 삭제되지 않습니다.`)) return;
  people.splice(i, 1);
  saveCurrent();
  render();
}

function removeFromDB(i) {
  const p = participantDB[i];
  if (!p) return;
  if (!window.confirm(`${p.name}님을 참가자 DB에서도 삭제할까요?`)) return;
  participantDB.splice(i, 1);
  saveDatabaseLocal();
  render();
}

function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function leftRoomWarningHTML() {
  const hasLeftRoom = rooms.some(r => r.left);
  const hasLeftPeople = people.some(p => p.left);
  if (hasLeftPeople && !hasLeftRoom) {
    return `<div class="result-warning">⚠️ 좌타 참석자가 있지만 좌타방이 등록되어 있지 않아, 좌타 여부와 관계없이 배정되었습니다.</div>`;
  }
  return '';
}

function getGroupSizes(roomCount, personCount) {
  const min = roomCount * 2;
  const extra = Math.max(0, personCount - min);
  const sizes = Array(roomCount).fill(2);
  shuffle(Array.from({ length: roomCount }, (_, i) => i)).slice(0, extra).forEach(i => { sizes[i] = 3; });
  return sizes;
}

function buildAssignments() {
  const shuffledRooms = shuffle(normalizeRooms(rooms));
  const sizes = getGroupSizes(shuffledRooms.length, people.length);
  const groups = shuffledRooms.map((room, i) => ({ room, capacity: sizes[i], people: [] }));

  const leftPeople = shuffle(people.filter(p => p.left));
  const rightPeople = shuffle(people.filter(p => !p.left));

  const leftRoomGroups = shuffle(groups.filter(g => g.room.left));
  let li = 0;
  leftRoomGroups.forEach(group => {
    while (group.people.length < group.capacity && li < leftPeople.length) {
      group.people.push(leftPeople[li++]);
    }
  });

  const remaining = shuffle([...rightPeople, ...leftPeople.slice(li)]);
  let cursor = 0;
  groups.forEach(group => {
    while (group.people.length < group.capacity && cursor < remaining.length) {
      group.people.push(remaining[cursor++]);
    }
  });

  return groups;
}

function validateForDraw() {
  const roomCount = rooms.length;
  const personCount = people.length;
  if (!roomCount) { alertUser('방이 등록되지 않았습니다.\n먼저 방을 등록해주세요.'); return false; }
  if (!personCount) { alertUser('참석자가 등록되지 않았습니다.\n먼저 참석자를 등록해주세요.'); return false; }
  const minPeople = roomCount * 2;
  const maxPeople = roomCount * 3;
  if (personCount < minPeople) {
    alertUser(`참석자가 부족합니다.\n\n현재: ${personCount}명\n필요: 최소 ${minPeople}명\n방 ${roomCount}개 × 최소 2명`);
    return false;
  }
  if (personCount > maxPeople) {
    alertUser(`방이 부족합니다.\n\n현재: ${personCount}명\n수용 가능: 최대 ${maxPeople}명\n방 ${roomCount}개 × 최대 3명\n\n방을 추가하거나 참석자를 줄여주세요.`);
    return false;
  }
  return true;
}

let isBusy = false;
let drawRandomBtnHTML = '';
let drawHandicapBtnHTML = '';

function setButtonsBusy(activeHTML, which) {
  const r = $('drawRandomBtn');
  const h = $('drawHandicapBtn');
  r.disabled = true;
  h.disabled = true;
  if (which === 'random') {
    r.innerHTML = activeHTML;
    r.classList.add('drawing');
  } else {
    h.innerHTML = activeHTML;
    h.classList.add('drawing');
  }
}

function resetButtons() {
  const r = $('drawRandomBtn');
  const h = $('drawHandicapBtn');
  r.disabled = false;
  h.disabled = false;
  r.classList.remove('drawing');
  h.classList.remove('drawing');
  r.innerHTML = drawRandomBtnHTML;
  h.innerHTML = drawHandicapBtnHTML;
}

function recoverFromDrawError(err) {
  console.error('방배정 진행 중 오류:', err);
  resetButtons();
  isBusy = false;
  refreshMakeCardButton();
  alertUser('방배정을 진행하는 중 오류가 발생했습니다.\n다시 시도해주세요. 문제가 계속되면 페이지를 새로고침해주세요.');
}

function draw() {
  if (isBusy) return;
  if (!validateForDraw()) return;

  let groups;
  try {
    groups = buildAssignments();
    if (!groups.every(g => g.people.length >= 2 && g.people.length <= 3)) {
      alertUser('방배정 조건을 만족하는 결과를 만들지 못했습니다. 다시 시도해주세요.');
      return;
    }
    groups.sort((a, b) => compareRooms(a.room, b.room));
  } catch (err) {
    console.error(err);
    alertUser('방배정 계산 중 오류가 발생했습니다. 다시 시도해주세요.');
    return;
  }

  isBusy = true;
  setButtonsBusy('<span class="dice-spin">🎲</span> 방배정 중...', 'random');

  const totalRooms = groups.length;
  const warningHTML = leftRoomWarningHTML();

  $('result').innerHTML = `
    <div class="result-card">
      <div class="result-head">
        <strong>🎲 방배정 중...</strong>
        <span id="progressLabel">0/${totalRooms}개 방 완료</span>
      </div>
      ${warningHTML}
      <div class="assignment" id="assignmentArea">
        <div id="revealedList"></div>
        <div id="currentRoomSlot"></div>
        <div id="pendingList"></div>
      </div>
    </div>
  `;

  $('result').scrollIntoView({ behavior: 'smooth', block: 'center' });

  const shuffleDurationPerRoom = 2000;
  const shuffleInterval = 100;
  const pauseBetweenRooms = 300;

  let roomIndex = 0;
  const revealedNames = new Set();

  function renderPending() {
    const pendingCount = Math.max(0, totalRooms - roomIndex - 1);
    $('pendingList').innerHTML = Array.from({ length: pendingCount }).map(() => `
      <div class="room-result pending-room">
        <div class="room-result-title"><b>🏌️ 대기 중...</b></div>
      </div>
    `).join('');
  }

  function startRoom() {
    try {
      if (roomIndex >= totalRooms) {
        finishAll();
        return;
      }

      const currentGroup = groups[roomIndex];
      const pool = people.filter(p => !revealedNames.has(p.name));

      $('currentRoomSlot').innerHTML = `
        <div class="room-result shuffling-room">
          <div class="room-result-title"><b>🏌️ ${esc(currentGroup.room.name)}번 방</b><span>배정 중...</span></div>
          <div class="result-people" id="shuffleChips"></div>
        </div>
      `;
      renderPending();

      let elapsed = 0;
      const chipsEl = $('shuffleChips');

      function tick() {
        try {
          const previewPeople = shuffle(pool).slice(0, currentGroup.people.length);
          chipsEl.innerHTML = previewPeople.map(p => `<span class="person shuffle-chip">${esc(p.name)}</span>`).join('');
          elapsed += shuffleInterval;
          if (elapsed >= shuffleDurationPerRoom) {
            clearInterval(timer);
            finalizeRoom(currentGroup);
          }
        } catch (err) {
          clearInterval(timer);
          recoverFromDrawError(err);
        }
      }

      tick();
      var timer = setInterval(tick, shuffleInterval);
    } catch (err) {
      recoverFromDrawError(err);
    }
  }

  function finalizeRoom(currentGroup) {
    try {
      currentGroup.people.forEach(p => revealedNames.add(p.name));
      $('currentRoomSlot').innerHTML = '';

      $('revealedList').insertAdjacentHTML('beforeend', `
        <div class="room-result reveal-item-done">
          <div class="room-result-title"><b>🏌️ ${esc(currentGroup.room.name)}번 방</b><span>${currentGroup.people.length}명${currentGroup.room.left ? ' · 좌타방' : ''}</span></div>
          <div class="result-people">${currentGroup.people.map(p => `
            <span class="person${p.left ? ' left' : ''}">${esc(p.name)}${leftTag(p.left)}</span>
          `).join('')}</div>
        </div>
      `);

      roomIndex++;
      $('progressLabel').textContent = `${roomIndex}/${totalRooms}개 방 완료`;
      setTimeout(startRoom, pauseBetweenRooms);
    } catch (err) {
      recoverFromDrawError(err);
    }
  }

  function finishAll() {
    try {
      $('result').querySelector('.result-head strong').textContent = '🎉 방배정 완료';
      $('progressLabel').textContent = `${people.length}명 · ${totalRooms}개 방`;
      resetButtons();
      isBusy = false;

      lastDrawResult = {
        groups: groups.map(g => ({ room: g.room, people: g.people })),
        mode: 'random'
      };
      refreshMakeCardButton();

      $('result').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      recoverFromDrawError(err);
    }
  }

  startRoom();
}

function computeRoomCapacities(totalPeople, roomCount) {
  const base = Math.floor(totalPeople / roomCount);
  const remainder = totalPeople % roomCount;
  const capacities = Array(roomCount).fill(base);
  shuffle(Array.from({ length: roomCount }, (_, i) => i))
    .slice(0, remainder)
    .forEach(i => { capacities[i] += 1; });
  return capacities;
}

function pickTargetGroup(candidateGroups) {
  const available = candidateGroups.filter(g => g.people.length < g.capacity);
  if (!available.length) return null;
  available.sort((a, b) => {
    if (a.people.length !== b.people.length) return a.people.length - b.people.length;
    const avgA = a.people.length ? a.sum / a.people.length : 0;
    const avgB = b.people.length ? b.sum / b.people.length : 0;
    return avgB - avgA;
  });
  return available[0];
}

function assignByHandicap(entries, roomList) {
  const totalPeople = entries.length;
  const roomCount = roomList.length;
  const capacities = computeRoomCapacities(totalPeople, roomCount);

  const groups = shuffle(roomList.map(r => ({ ...r }))).map((room, i) => ({
    room,
    capacity: capacities[i],
    people: [],
    sum: 0
  }));

  const leftGroups = groups.filter(g => g.room.left);
  const hasLeftRoom = leftGroups.length > 0;

  const leftPeopleSorted = shuffle(entries.filter(p => p.left)).sort((a, b) => a.handicap - b.handicap);
  const overflow = [];

  leftPeopleSorted.forEach(person => {
    const target = hasLeftRoom ? pickTargetGroup(leftGroups) : null;
    if (target) {
      target.people.push(person);
      target.sum += person.handicap;
    } else {
      overflow.push(person);
    }
  });

  const rightPeople = entries.filter(p => !p.left);
  const remaining = shuffle([...rightPeople, ...overflow]).sort((a, b) => a.handicap - b.handicap);

  remaining.forEach(person => {
    const target = pickTargetGroup(groups);
    if (!target) return;
    target.people.push(person);
    target.sum += person.handicap;
  });

  const result = groups.map(g => ({
    room: g.room,
    people: g.people,
    sum: g.sum,
    avg: g.people.length ? g.sum / g.people.length : 0
  }));

  result.sort((a, b) => compareRooms(a.room, b.room));
  return result;
}

function renderHandicapLoading() {
  $('result').innerHTML = `
    <div class="result-card shuffling">
      <div class="result-head">
        <strong><span class="calc-spin">⚖️</span> 핸디 균형 계산 중...</strong>
        <span>참가자 실력을 분석하고 있어요...</span>
      </div>
    </div>
  `;
}

function renderHandicapResult(groups) {
  const allPeople = groups.flatMap(g => g.people);
  const totalSum = allPeople.reduce((s, p) => s + p.handicap, 0);
  const totalAvg = allPeople.length ? totalSum / allPeople.length : 0;
  const maxAvg = Math.max(...groups.map(g => g.avg), 1);

  $('result').innerHTML = `
    <div class="result-card">
      <div class="result-head">
        <strong>🎉 핸디 균형 배정 완료</strong>
        <span>${allPeople.length}명 · ${groups.length}개 방</span>
      </div>

      ${leftRoomWarningHTML()}

      <div class="handicap-overview">
        <div class="overview-item"><span>전체 참가자</span><b>${allPeople.length}명</b></div>
        <div class="overview-item"><span>전체 총합 핸디</span><b>${totalSum}</b></div>
        <div class="overview-item"><span>전체 평균 핸디</span><b>${totalAvg.toFixed(2)}</b></div>
      </div>

      <div class="assignment">
        ${groups.map((g, i) => {
          const dev = g.avg - totalAvg;
          const devAbs = Math.abs(dev);
          const devClass = devAbs < 0.5 ? 'dev-good' : (devAbs < 1.5 ? 'dev-ok' : 'dev-warn');
          const barPct = maxAvg ? (g.avg / maxAvg) * 100 : 0;
          return `
            <div class="room-result reveal-item-done handicap-room" style="animation-delay: ${i * 0.15}s">
              <div class="room-result-title">
                <b>🏌️ ${esc(g.room.name)}번 방${g.room.left ? ' · 좌타방' : ''}</b>
                <span>${g.people.length}명</span>
              </div>
              <div class="result-people">
                ${g.people.map(p => `
                  <span class="person${p.left ? ' left' : ''}">${esc(p.name)}${leftTag(p.left)} <small class="handi-badge">핸디 ${p.handicap}</small></span>
                `).join('')}
              </div>
              <div class="handicap-stats">
                <span class="stat-chip">총합 핸디 <b>${g.sum}</b></span>
                <span class="stat-chip">평균 핸디 <b>${g.avg.toFixed(2)}</b></span>
                <span class="stat-chip ${devClass}">전체 평균과 편차 ${dev >= 0 ? '+' : ''}${dev.toFixed(2)}</span>
              </div>
              <div class="balance-bar-track">
                <div class="balance-bar-fill" style="width:${barPct}%"></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function drawHandicap() {
  if (isBusy) return;

  if (!rooms.length) {
    alertUser('방이 등록되지 않았습니다.\n먼저 방을 등록해주세요.');
    return;
  }
  if (!people.length) {
    alertUser('참석자가 등록되지 않았습니다.\n먼저 참석자를 등록해주세요.');
    return;
  }
  if (people.length < rooms.length) {
    alertUser(`참석자 수가 부족합니다.\n\n현재: ${people.length}명\n필요: 최소 ${rooms.length}명 (방 1개당 최소 1명 이상 필요)`);
    return;
  }

  isBusy = true;
  setButtonsBusy('<span class="calc-spin">⚖️</span> 계산 중...', 'handicap');

  try {
    const entries = people.map(p => ({ name: p.name, handicap: p.handicap, left: p.left }));
    const groups = assignByHandicap(entries, rooms);

    renderHandicapLoading();
    $('result').scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(() => {
      try {
        renderHandicapResult(groups);
        lastDrawResult = {
          groups: groups.map(g => ({ room: g.room, people: g.people })),
          mode: 'handicap'
        };
        refreshMakeCardButton();
        $('result').scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (err) {
        recoverFromDrawError(err);
        return;
      }
      resetButtons();
      isBusy = false;
    }, 1200);
  } catch (err) {
    recoverFromDrawError(err);
  }
}

// =========================================================
// 방배정 결과 카드(공유용) 생성
// =========================================================

function refreshMakeCardButton() {
  const btn = $('makeCardBtn');
  if (btn) btn.disabled = !lastDrawResult;
}

function modeLabel(mode) {
  return mode === 'handicap' ? '핸디 균형 배정' : '랜덤 배정';
}

function buildTarotCardMarkup() {
  if (!lastDrawResult) return '';
  const sortedGroups = [...lastDrawResult.groups].sort((a, b) => compareRooms(a.room, b.room));
  const totalPeople = sortedGroups.reduce((s, g) => s + g.people.length, 0);

  return `
    <div class="tarot-stars"></div>
    <div class="tarot-inner-border"></div>
    <span class="tarot-corner tl">✦</span>
    <span class="tarot-corner tr">✦</span>
    <span class="tarot-corner bl">✦</span>
    <span class="tarot-corner br">✦</span>
    <div class="tarot-content">
      <div class="tarot-kicker">THE ROOM ASSIGNMENT</div>
      <div class="tarot-compass"><div class="tarot-compass-ring"><span class="tarot-compass-star">✦</span></div></div>
      <div class="tarot-meta">
        <span class="tarot-meta-item">📅 ${esc(formatEventDate(eventInfo.date))}</span>
        <span class="tarot-meta-item">📍 ${esc(eventInfo.place || '장소 미정')}</span>
      </div>
      <h1 class="tarot-title">TEAM <em>PINHIGH</em></h1>
      <div class="tarot-subtitle">GOLF CLUB &nbsp;·&nbsp; ${esc(modeLabel(lastDrawResult.mode))}</div>
      <div class="tarot-divider"><span>◆</span></div>
      <p class="tarot-tagline">좋은사람, 좋은 샷, 좋은 하루</p>

      <div class="tarot-rooms">
        ${sortedGroups.map(g => `
          <div class="tarot-room">
            <div class="tarot-room-head">
              <span class="tarot-room-badge">${esc(g.room.name)}</span>
              <span class="tarot-room-name">${esc(g.room.name)}번 방</span>
              ${g.room.left ? '<span class="tarot-left-badge">좌타방</span>' : ''}
              <span class="tarot-room-count">${g.people.length}명</span>
            </div>
            <div class="tarot-room-people">
              ${g.people.map(p => `
                <span class="tarot-person${p.left ? ' left' : ''}">
                  <span class="tarot-person-name">${esc(p.name)}</span>
                  ${p.left ? '<span class="tarot-left-dot">좌타</span>' : ''}
                  <span class="tarot-person-h">H${p.handicap}</span>
                </span>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>

      <div class="tarot-footer">
        <div class="tarot-sun"></div>
        <div class="tarot-footer-text">TEAM PINHIGH GOLF CLUB · ${totalPeople}명 · ${sortedGroups.length}개 방</div>
      </div>
    </div>
  `;
}

function openShareCardDialog() {
  try {
    if (!lastDrawResult) {
      alertUser('먼저 방배정을 진행해주세요.');
      return;
    }
    const dialog = $('shareCardDialog');
    if (!dialog || typeof dialog.showModal !== 'function') {
      alertUser('현재 브라우저에서는 카드 보기 기능을 지원하지 않습니다. 최신 브라우저(크롬, 사파리 등)로 다시 시도해주세요.');
      return;
    }
    $('tarotCard').innerHTML = buildTarotCardMarkup();
    dialog.showModal();
  } catch (err) {
    console.error('카드 생성 중 오류:', err);
    alertUser('카드를 만드는 중 오류가 발생했습니다.\n페이지를 새로고침한 뒤 다시 시도해주세요.');
  }
}

async function captureTarotCard() {
  if (typeof html2canvas === 'undefined') {
    alertUser('이미지 생성 라이브러리를 불러오지 못했습니다.\n인터넷 연결을 확인한 뒤 다시 시도해주세요.');
    return null;
  }
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch {}
  }
  const target = $('tarotCard');
  const scale = Math.min(3, Math.max(2, (window.devicePixelRatio || 1) * 2));
  return html2canvas(target, {
    scale,
    backgroundColor: null,
    useCORS: true
  });
}

function tarotFileName() {
  const dateLabel = eventInfo.date || 'result';
  return `핀하이_방배정_${dateLabel}.png`;
}

async function withCardBusy(btnId, label, fn) {
  const btn = $(btnId);
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = label;
  try {
    await fn();
  } catch (err) {
    console.error(err);
    alertUser('이미지를 만드는 중 오류가 발생했습니다. 다시 시도해주세요.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

function isMobileDevice() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

async function buildCardFile() {
  const canvas = await captureTarotCard();
  if (!canvas) return null;
  return new Promise(resolve => {
    canvas.toBlob(blob => {
      if (!blob) { resolve(null); return; }
      resolve(new File([blob], tarotFileName(), { type: 'image/png' }));
    }, 'image/png');
  });
}

function openImageSaveOverlay(file) {
  const url = URL.createObjectURL(file);
  $('imageSaveTarget').src = url;
  $('imageSaveOverlay').showModal();
}

async function saveCardToGallery() {
  const file = await buildCardFile();
  if (!file) {
    alertUser('이미지를 만드는 중 문제가 발생했습니다. 다시 시도해주세요.');
    return;
  }

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'TEAM PINHIGH 방배정 결과' });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }

  if (isMobileDevice()) {
    openImageSaveOverlay(file);
    toast('이미지를 길게 눌러 사진첩에 저장해주세요.');
  } else {
    const link = document.createElement('a');
    link.download = tarotFileName();
    link.href = URL.createObjectURL(file);
    link.click();
  }
}

async function shareCardToOtherApps() {
  const file = await buildCardFile();
  if (!file) {
    alertUser('이미지를 만드는 중 문제가 발생했습니다. 다시 시도해주세요.');
    return;
  }

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'TEAM PINHIGH 방배정 결과', text: '방배정 결과를 확인해보세요!' });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }

  if (isMobileDevice()) {
    openImageSaveOverlay(file);
    toast('공유 기능을 지원하지 않아 이미지를 길게 눌러 저장하는 방식으로 안내합니다.');
  } else {
    const link = document.createElement('a');
    link.download = tarotFileName();
    link.href = URL.createObjectURL(file);
    link.click();
    toast('공유 기능을 지원하지 않는 환경이라 이미지로 저장했습니다.');
  }
}

// =========================================================
// 이미지(캡처) 인식 기반 참석자 일괄 등록 (베타)
// =========================================================

let importCandidates = [];
let importSeq = 0;
let lastRawOcrText = '';

// 영역 크롭 관련 상태
let cropOriginalImage = null;
let cropSelection = null;
let cropDragStart = null;

function normalizeDashChars(text) {
  return String(text || '').replace(/[–—−‐‑]/g, '-');
}

function parseOcrTextToCandidates(rawText) {
  const lines = normalizeDashChars(rawText)
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length >= 2);

  const candidates = [];

  lines.forEach(line => {
    if (/^첫\s*참여$/.test(line)) return;
    if (!/[가-힣a-zA-Z0-9]/.test(line)) return;

    const left = /좌타/.test(line);

    let handicap = null;
    const hMatch = line.match(/g[^0-9-]{0,4}(-?\d+(?:\.\d+)?)/i);
    if (hMatch) {
      const n = Number(hMatch[1]);
      if (Number.isFinite(n)) handicap = n;
    }

    const parenIdx = line.indexOf('(');
    const slashIdx = line.indexOf('/');
    let cutIdx = -1;
    if (parenIdx >= 0 && slashIdx >= 0) cutIdx = Math.min(parenIdx, slashIdx);
    else if (parenIdx >= 0) cutIdx = parenIdx;
    else if (slashIdx >= 0) cutIdx = slashIdx;

    let name = cutIdx > 0 ? line.slice(0, cutIdx) : line;
    name = name.replace(/좌타/g, '').trim();
    if (!name) return;

    candidates.push({
      id: ++importSeq,
      raw: line,
      name,
      handicap,
      left,
      selected: true
    });
  });

  return candidates;
}

function renderImportList() {
  const listEl = $('importList');
  $('importCountLabel').textContent = `${importCandidates.length}명 인식됨`;

  if (!importCandidates.length) {
    listEl.innerHTML = `<p class="import-empty">인식된 항목이 없습니다. 다른 이미지로 다시 시도해보세요.</p>`;
    return;
  }

  listEl.innerHTML = importCandidates.map(c => `
    <div class="import-row" data-id="${c.id}">
      <label class="import-check">
        <input type="checkbox" class="import-row-check" data-id="${c.id}" ${c.selected ? 'checked' : ''}>
      </label>
      <div class="import-fields">
        <input type="text" class="import-name-input" data-id="${c.id}" value="${esc(c.name)}" placeholder="이름" maxlength="20">
        <input type="number" class="import-handi-input" data-id="${c.id}" value="${c.handicap === null || c.handicap === undefined ? '' : c.handicap}" placeholder="핸디" step="1">
        <label class="import-left-check"><input type="checkbox" class="import-left-input" data-id="${c.id}" ${c.left ? 'checked' : ''}> 좌타</label>
      </div>
      <div class="import-raw" title="${esc(c.raw)}">${esc(c.raw)}</div>
    </div>
  `).join('');

  listEl.querySelectorAll('.import-row-check').forEach(el => {
    el.addEventListener('change', e => {
      const id = Number(e.target.dataset.id);
      const item = importCandidates.find(c => c.id === id);
      if (item) item.selected = e.target.checked;
      syncSelectAllCheckbox();
    });
  });
  listEl.querySelectorAll('.import-name-input').forEach(el => {
    el.addEventListener('input', e => {
      const id = Number(e.target.dataset.id);
      const item = importCandidates.find(c => c.id === id);
      if (item) item.name = e.target.value;
    });
  });
  listEl.querySelectorAll('.import-handi-input').forEach(el => {
    el.addEventListener('input', e => {
      const id = Number(e.target.dataset.id);
      const item = importCandidates.find(c => c.id === id);
      if (item) item.handicap = e.target.value === '' ? null : Number(e.target.value);
    });
  });
  listEl.querySelectorAll('.import-left-input').forEach(el => {
    el.addEventListener('change', e => {
      const id = Number(e.target.dataset.id);
      const item = importCandidates.find(c => c.id === id);
      if (item) item.left = e.target.checked;
    });
  });
}

function syncSelectAllCheckbox() {
  const all = importCandidates.length > 0 && importCandidates.every(c => c.selected);
  $('importSelectAll').checked = all;
}

function openImportDialog(rawText) {
  lastRawOcrText = rawText || '';
  importCandidates = parseOcrTextToCandidates(rawText);
  renderImportList();
  syncSelectAllCheckbox();
  $('importDialog').showModal();
}

function showRawTextViewer() {
  $('rawTextArea').value = lastRawOcrText || '(인식된 텍스트가 없습니다)';
  $('rawTextDialog').showModal();
  setTimeout(() => {
    $('rawTextArea').focus();
    $('rawTextArea').select();
  }, 50);
}

function setOcrLoading(visible, percent) {
  if (visible) {
    $('ocrLoadingText').textContent = `이미지 분석 중... ${percent ?? 0}%`;
    if (!$('ocrLoadingDialog').open) $('ocrLoadingDialog').showModal();
  } else {
    if ($('ocrLoadingDialog').open) $('ocrLoadingDialog').close();
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function computeOtsuThreshold(histogram, totalPixels) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];

  let sumB = 0, weightB = 0, maxVariance = 0, threshold = 127;
  for (let t = 0; t < 256; t++) {
    weightB += histogram[t];
    if (weightB === 0) continue;
    const weightF = totalPixels - weightB;
    if (weightF === 0) break;

    sumB += t * histogram[t];
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const variance = weightB * weightF * (meanB - meanF) * (meanB - meanF);

    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }
  return threshold;
}

async function preprocessImageForOcr(sourceCanvas) {
  const srcWidth = sourceCanvas.width;
  const srcHeight = sourceCanvas.height;

  const targetWidth = Math.max(srcWidth, 1600);
  let scale = targetWidth / srcWidth;

  const maxPixels = 6000000;
  if (srcWidth * srcHeight * scale * scale > maxPixels) {
    scale = Math.sqrt(maxPixels / (srcWidth * srcHeight));
  }
  scale = Math.max(scale, 1);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(srcWidth * scale));
  canvas.height = Math.max(1, Math.round(srcHeight * scale));

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width, h = canvas.height;
  const pixelCount = w * h;

  const gray = new Float32Array(pixelCount);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }

  const blurred = new Float32Array(pixelCount);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          sum += gray[ny * w + nx];
          count++;
        }
      }
      blurred[y * w + x] = sum / count;
    }
  }

  const sharpenAmount = 0.8;
  const sharpened = new Float32Array(pixelCount);
  for (let p = 0; p < pixelCount; p++) {
    let v = gray[p] + sharpenAmount * (gray[p] - blurred[p]);
    sharpened[p] = Math.max(0, Math.min(255, v));
  }

  const contrast = 1.25;
  const intercept = 128 * (1 - contrast);
  for (let p = 0; p < pixelCount; p++) {
    sharpened[p] = Math.max(0, Math.min(255, sharpened[p] * contrast + intercept));
  }

  const histogram = new Array(256).fill(0);
  for (let p = 0; p < pixelCount; p++) {
    histogram[Math.round(sharpened[p])]++;
  }
  const threshold = computeOtsuThreshold(histogram, pixelCount);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const v = sharpened[p] > threshold ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = v;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

async function recognizeWithTesseract(imageSource, onProgress) {
  const { data } = await Tesseract.recognize(imageSource, 'kor+eng', {
    tessedit_pageseg_mode: '4',
    preserve_interword_spaces: '1',
    logger: m => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number' && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    }
  });
  return data.text || '';
}

async function openCropDialogWithFile(file) {
  try {
    const dataUrl = await fileToDataUrl(file);
    const img = await loadImageElement(dataUrl);
    cropOriginalImage = img;
    clearCropSelection();
    $('cropImagePreview').src = dataUrl;
    $('cropDialog').showModal();
  } catch (err) {
    alertUser('이미지를 불러오지 못했습니다.\n다른 이미지로 다시 시도해주세요.');
  }
}

function clearCropSelection() {
  cropSelection = null;
  const box = $('cropSelectionBox');
  box.style.display = 'none';
  box.style.width = '0px';
  box.style.height = '0px';
}

function getCropFrameRelativePoint(e) {
  const rect = $('cropFrame').getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: Math.min(Math.max(clientX - rect.left, 0), rect.width),
    y: Math.min(Math.max(clientY - rect.top, 0), rect.height)
  };
}

function onCropPointerDown(e) {
  if (!cropOriginalImage) return;
  e.preventDefault();
  cropDragStart = getCropFrameRelativePoint(e);
  const box = $('cropSelectionBox');
  box.style.display = 'block';
  box.style.left = cropDragStart.x + 'px';
  box.style.top = cropDragStart.y + 'px';
  box.style.width = '0px';
  box.style.height = '0px';
}

function onCropPointerMove(e) {
  if (!cropDragStart) return;
  e.preventDefault();
  const point = getCropFrameRelativePoint(e);
  const x = Math.min(cropDragStart.x, point.x);
  const y = Math.min(cropDragStart.y, point.y);
  const w = Math.abs(point.x - cropDragStart.x);
  const h = Math.abs(point.y - cropDragStart.y);
  const box = $('cropSelectionBox');
  box.style.left = x + 'px';
  box.style.top = y + 'px';
  box.style.width = w + 'px';
  box.style.height = h + 'px';
}

function onCropPointerUp(e) {
  if (!cropDragStart) return;
  const point = getCropFrameRelativePoint(e);
  const displayX = Math.min(cropDragStart.x, point.x);
  const displayY = Math.min(cropDragStart.y, point.y);
  const displayW = Math.abs(point.x - cropDragStart.x);
  const displayH = Math.abs(point.y - cropDragStart.y);
  cropDragStart = null;

  if (displayW < 16 || displayH < 16 || !cropOriginalImage) {
    clearCropSelection();
    return;
  }

  const previewImg = $('cropImagePreview');
  const displayedWidth = previewImg.clientWidth;
  const displayedHeight = previewImg.clientHeight;
  if (!displayedWidth || !displayedHeight) { clearCropSelection(); return; }

  const scaleX = cropOriginalImage.naturalWidth / displayedWidth;
  const scaleY = cropOriginalImage.naturalHeight / displayedHeight;

  cropSelection = {
    x: Math.round(displayX * scaleX),
    y: Math.round(displayY * scaleY),
    w: Math.round(displayW * scaleX),
    h: Math.round(displayH * scaleY)
  };
}

function closeCropDialog() {
  if ($('cropDialog').open) $('cropDialog').close();
  clearCropSelection();
}

async function runOcrPipeline() {
  if (!cropOriginalImage) return;
  if (typeof Tesseract === 'undefined') {
    alertUser('이미지 인식 라이브러리를 불러오지 못했습니다.\n인터넷 연결을 확인한 뒤 다시 시도해주세요.');
    return;
  }

  setOcrLoading(true, 0);

  try {
    const naturalW = cropOriginalImage.naturalWidth;
    const naturalH = cropOriginalImage.naturalHeight;

    let sx = 0, sy = 0, sw = naturalW, sh = naturalH;
    if (cropSelection && cropSelection.w > 0 && cropSelection.h > 0) {
      sx = Math.max(0, Math.min(cropSelection.x, naturalW - 1));
      sy = Math.max(0, Math.min(cropSelection.y, naturalH - 1));
      sw = Math.max(1, Math.min(cropSelection.w, naturalW - sx));
      sh = Math.max(1, Math.min(cropSelection.h, naturalH - sy));
    }

    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = sw;
    sourceCanvas.height = sh;
    sourceCanvas.getContext('2d').drawImage(cropOriginalImage, sx, sy, sw, sh, 0, 0, sw, sh);

    let ocrSource;
    try {
      ocrSource = await preprocessImageForOcr(sourceCanvas);
    } catch (prepErr) {
      console.warn('이미지 전처리에 실패해 원본(크롭) 이미지로 인식합니다.', prepErr);
      ocrSource = sourceCanvas.toDataURL('image/png');
    }

    const text = await recognizeWithTesseract(ocrSource, percent => setOcrLoading(true, percent));
    setOcrLoading(false);

    console.log('[OCR RAW TEXT]\n' + text);
    openImportDialog(text);
  } catch (err) {
    setOcrLoading(false);
    alertUser('이미지 인식에 실패했습니다.\n다른 이미지로 다시 시도해주세요.');
  }
}

function confirmImport() {
  const selected = importCandidates.filter(c => c.selected);
  if (!selected.length) {
    alertUser('등록할 항목을 선택해주세요.');
    return;
  }

  let addedCount = 0;
  const skipped = [];
  const usedNames = new Set(people.map(p => p.name));

  selected.forEach(c => {
    const name = String(c.name || '').trim();
    const handicap = Number(c.handicap);

    if (!name) { skipped.push('(이름 미입력)'); return; }
    if (!Number.isFinite(handicap)) { skipped.push(`${name} (핸디 미입력)`); return; }
    if (usedNames.has(name)) { skipped.push(`${name} (중복)`); return; }

    people.push({ name, left: !!c.left, handicap });
    participantDB = normalizePeople([...participantDB, { name, left: !!c.left, handicap }]);
    usedNames.add(name);
    addedCount++;
  });

  saveCurrent();
  saveDatabaseLocal();
  render();
  $('importDialog').close();

  if (addedCount) toast(`${addedCount}명을 참석자로 등록했습니다.`);
  if (skipped.length) {
    alertUser(`다음 ${skipped.length}건은 등록되지 않았습니다:\n\n${skipped.join('\n')}`);
  }
}

// =========================================================
// 이벤트 바인딩
// =========================================================

$('eventDateInput').addEventListener('change', () => {
  eventInfo.date = $('eventDateInput').value;
  saveEventInfo();
  updateEventCurrentLabel();
});

$('eventPlaceInput').addEventListener('input', () => {
  eventInfo.place = $('eventPlaceInput').value;
  saveEventInfo();
  updateEventCurrentLabel();
});
$('eventPlaceInput').addEventListener('change', () => {
  rememberPlace($('eventPlaceInput').value);
});
$('eventPlaceInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    rememberPlace($('eventPlaceInput').value);
    $('eventPlaceInput').blur();
  }
});

$('setTodayBtn').addEventListener('click', () => {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  $('eventDateInput').value = iso;
  eventInfo.date = iso;
  saveEventInfo();
  updateEventCurrentLabel();
});

$('addRoomBtn').addEventListener('click', addRoom);
$('addPersonBtn').addEventListener('click', addPersonFromInput);
$('drawRandomBtn').addEventListener('click', draw);
$('drawHandicapBtn').addEventListener('click', drawHandicap);

$('roomInput').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, ''); });
$('roomInput').addEventListener('keydown', e => { if (e.key === 'Enter') addRoom(); });

$('personInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    highlightHandicapGrid();
    $('handicapDialog').showModal();
  }
});

$('personHandicapBtn').addEventListener('click', () => {
  highlightHandicapGrid();
  $('handicapDialog').showModal();
});
$('closeHandicapDialog').addEventListener('click', () => $('handicapDialog').close());

$('importImageBtn').addEventListener('click', () => $('importImageInput').click());
$('importImageInput').addEventListener('change', e => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (file) openCropDialogWithFile(file);
});

$('cropFrame').addEventListener('pointerdown', onCropPointerDown);
$('cropFrame').addEventListener('pointermove', onCropPointerMove);
window.addEventListener('pointerup', onCropPointerUp);
window.addEventListener('pointercancel', () => { cropDragStart = null; });

$('cropResetBtn').addEventListener('click', clearCropSelection);
$('closeCropDialog').addEventListener('click', closeCropDialog);
$('cropCancelBtn').addEventListener('click', closeCropDialog);
$('cropConfirmBtn').addEventListener('click', () => {
  $('cropDialog').close();
  runOcrPipeline();
});

$('closeImportDialog').addEventListener('click', () => $('importDialog').close());
$('importCancelBtn').addEventListener('click', () => $('importDialog').close());
$('importConfirmBtn').addEventListener('click', confirmImport);
$('importSelectAll').addEventListener('change', e => {
  importCandidates.forEach(c => c.selected = e.target.checked);
  renderImportList();
});

$('viewRawTextBtn').addEventListener('click', showRawTextViewer);
$('closeRawTextDialog').addEventListener('click', () => $('rawTextDialog').close());

$('makeCardBtn').addEventListener('click', openShareCardDialog);
$('closeShareCardDialog').addEventListener('click', () => $('shareCardDialog').close());
$('saveCardBtn').addEventListener('click', () => withCardBusy('saveCardBtn', '저장 준비 중...', saveCardToGallery));
$('shareCardBtn').addEventListener('click', () => withCardBusy('shareCardBtn', '공유 준비 중...', shareCardToOtherApps));
$('closeImageSaveOverlay').addEventListener('click', () => $('imageSaveOverlay').close());

$('helpBtn').addEventListener('click', () => $('helpDialog').showModal());
$('closeHelp').addEventListener('click', () => $('helpDialog').close());
$('clearDatabaseBtn').addEventListener('click', () => {
  if (!participantDB.length) { alertUser('삭제할 참가자 DB가 없습니다.'); return; }
  if (!window.confirm('저장된 참가자 DB를 모두 삭제할까요?\n현재 모임 참석자는 삭제되지 않습니다.')) return;
  participantDB = [];
  saveDatabaseLocal();
  render();
});
$('resetBtn').addEventListener('click', () => {
  if (!window.confirm('현재 모임의 방과 참석자를 초기화할까요?\n참가자 DB, 장소 목록, 모임 정보는 유지됩니다.')) return;
  rooms = [];
  people = [];
  saveCurrent();
  $('result').innerHTML = '';
  lastDrawResult = null;
  refreshMakeCardButton();
  render();
  toast('현재 모임을 초기화했습니다. 참가자 DB, 장소 목록, 모임 정보는 유지됩니다.');
});

drawRandomBtnHTML = $('drawRandomBtn').innerHTML;
drawHandicapBtnHTML = $('drawHandicapBtn').innerHTML;

buildHandicapGrid();
loadEventInfoUI();
render();
refreshMakeCardButton();
