const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms));
const makeId = () => '10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c => (Number(c) ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> Number(c) / 4).toString(16));
let sessionId;
try { sessionId = localStorage.getItem('masha-letter-session'); if (!sessionId) { sessionId = makeId(); localStorage.setItem('masha-letter-session', sessionId); } } catch { sessionId = makeId(); }
let entries = [], mode = 'gift', saving = false, pending = null, editingId = null, back = false, turning = false;
async function apiFetch(path, options = {}) {
  let apiBase = '';
  if (location.hostname === 'nikitos812.github.io') {
    const configResponse = await fetch(new URL('./config.json', location.href), { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!configResponse.ok) throw Error('Не удалось подключиться. Попробуй немного позже.');
    const config = await configResponse.json();
    if (!config.apiBase || !/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(config.apiBase)) throw Error('Не удалось подключиться. Попробуй немного позже.');
    apiBase = config.apiBase;
  }
  return fetch(apiBase + path, { ...options, credentials: 'omit', signal: options.signal || AbortSignal.timeout(12000) });
}
function toast(text) { $('toast').textContent = text; $('toast').classList.add('visible'); setTimeout(() => $('toast').classList.remove('visible'), 3500); }
function render() {
  const gifts = entries.filter(e => e.type === 'gift');
  $('gift-list').replaceChildren(...gifts.map(g => {
    const li = document.createElement('li');
    const text = document.createElement('span'); text.className = 'gift-name'; text.textContent = g.text;
    const edit = document.createElement('button'); edit.className = 'edit-gift'; edit.type = 'button'; edit.textContent = 'Изменить';
    edit.setAttribute('aria-label', `Редактировать подарок: ${g.text}`);
    edit.addEventListener('click', () => openModal('gift', g));
    li.append(text, edit); return li;
  }));
  $('gift-tokens').replaceChildren(...gifts.slice(-7).map((g, i) => {
    const box = document.createElement('span');
    box.className = `gift-token gift-color-${i % 3}`;
    box.setAttribute('aria-hidden', 'true');
    box.innerHTML = `<svg viewBox="0 0 64 70" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="33" cy="64" rx="25" ry="4" fill="#25180f" opacity=".2"/>
      <path d="M9 29L32 21L56 29V55L33 64L9 55Z" fill="var(--wrap)"/>
      <path d="M33 38L56 29V55L33 64Z" fill="#40202a" opacity=".16"/>
      <path d="M9 29L33 38V64L9 55Z" fill="white" opacity=".1"/>
      <path d="M6 26L32 17L59 26L33 36Z" fill="var(--lid)"/>
      <path d="M6 26L33 36V42L6 32Z" fill="var(--wrap)"/>
      <path d="M33 36L59 26V32L33 42Z" fill="var(--wrap)"/>
      <path d="M33 36L59 26V32L33 42Z" fill="#40202a" opacity=".16"/>
      <path d="M17 22L24 20L47 30L40 33Z" fill="var(--ribbon)"/>
      <path d="M40 33L47 30V59L40 61.8Z" fill="var(--ribbon)"/>
      <path d="M44 21L50 23L25 33L19 31Z" fill="var(--ribbon)"/>
      <path d="M19 31L25 33V61L19 58.8Z" fill="var(--ribbon)"/>
      <path d="M32 22C16 23 13 9 20 9C26 9 30 17 32 22Z" fill="var(--ribbon)" stroke="var(--ribbon)" stroke-width="2" stroke-linejoin="round"/>
      <path d="M33 22C48 22 51 8 44 9C38 10 35 16 33 22Z" fill="var(--ribbon)" stroke="var(--ribbon)" stroke-width="2" stroke-linejoin="round"/>
      <path d="M29 20C23 18 18 12 20 11M36 20C40 18 45 12 44 11" stroke="white" stroke-opacity=".45" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M31 22L24 33L30 31L33 34L35 23L42 31L42 26L47 27L36 21Z" fill="var(--ribbon)"/>
      <ellipse cx="33" cy="22" rx="4" ry="3.5" fill="var(--ribbon)"/>
      <path d="M31 20.5L34 20" stroke="white" stroke-opacity=".45" stroke-linecap="round"/>
      <path d="M12 35L16 36.5M12 40L16 41.5M12 45L16 46.5M28 43L30 44M28 50L30 51" stroke="var(--lid)" stroke-width="1" stroke-linecap="round" opacity=".65"/>
    </svg>`;
    return box;
  }));
  $('gift-hint').textContent = gifts.length ? 'Желание сохранено. Можно добавить ещё ♡' : 'Нажми на плюсик рядом с ёлкой ♡';
  $('reply-area').hidden = !gifts.length;
  const reply = entries.filter(e => e.type === 'reply').at(-1);
  $('show-ending').hidden = !reply;
  $('reply-status').textContent = reply ? 'Твой ответ сохранён. Спасибо за искренность ♡' : '';
  $('reply').firstChild.textContent = reply ? 'Дополнить ответ ' : 'Ответить на письмо ';
}
function showEnding(personal = false) {
  $('envelope-scene').hidden = true;
  $('letter-scene').hidden = true;
  $('ending-telegram').hidden = !personal;
  $('ending-scene').hidden = false;
  window.scrollTo({ top: 0, behavior: 'instant' });
  $('ending-title').focus({ preventScroll: true });
}
$('show-ending').addEventListener('click', () => showEnding());
$('return-letter').addEventListener('click', () => {
  $('ending-scene').hidden = true;
  $('letter-scene').hidden = false;
  window.scrollTo({ top: 0, behavior: 'instant' });
  (back ? $('back') : $('front')).querySelector('h2').focus({ preventScroll: true });
});
apiFetch(`/api/entries?session=${sessionId}`).then(r => { if (!r.ok) throw Error(); return r.json(); }).then(data => { entries = data.entries; render(); }).catch(() => toast('Не получилось загрузить желания. Попробуй немного позже.'));
$('unseal').addEventListener('click', async () => {
  $('unseal').disabled = true; $('envelope').classList.add('opened');
  await sleep(1450); $('unseal').hidden = true; $('read').hidden = false; $('read').focus();
});
$('read').addEventListener('click', async () => {
  $('read').disabled = true; $('envelope').classList.add('departing'); await sleep(850);
  $('envelope-scene').hidden = true; $('letter-scene').hidden = false; window.scrollTo({top:0,behavior:'instant'}); $('front').querySelector('h2').focus({preventScroll:true});
});
$('flip').addEventListener('click', async () => {
  if (turning) return; turning = true; $('letter').classList.add('turning'); await sleep(350); back = !back;
  $('front').hidden = back; $('back').hidden = !back; $('flip').innerHTML = `${back ? 'Вернуться к письму' : 'Смотреть оборот'} <span>↻</span>`;
  await sleep(350); $('letter').classList.remove('turning'); turning = false; (back ? $('back') : $('front')).querySelector('h2').focus({preventScroll:true}); window.scrollTo({top:0,behavior:'smooth'});
});
function openModal(type, gift = null) {
  mode = type; editingId = gift?.id || null; pending = null; $('message').value = gift?.text || ''; $('form-error').textContent = '';
  $('modal-title').textContent = gift ? 'Изменить желание' : type === 'gift' ? 'Какой подарок ты хочешь?' : 'Твой ответ на письмо';
  $('modal-description').textContent = type === 'gift' ? 'Можешь просто написать или вставить ссылку. Я сохраню каждое твоё желание.' : 'Напиши всё, что хочется сказать. Или выбери один из ответов ниже.';
  $('field-label').textContent = type === 'gift' ? 'Твоё маленькое желание' : 'Пару слов для Никиты';
  $('message').placeholder = type === 'gift' ? 'Например, тёплый свитер или ссылка…' : 'Дорогой Никита…';
  $('submit-message').textContent = gift ? 'Сохранить изменения ♡' : type === 'gift' ? 'Добавить под ёлку ♡' : 'Отправить ответ ♡';
  $('quick-replies').hidden = type !== 'reply'; $('modal').showModal();
}
$('add-gift').addEventListener('click', () => openModal('gift')); $('reply').addEventListener('click', () => openModal('reply'));
$('close-modal').addEventListener('click', () => { if (!saving) $('modal').close(); });
$('modal').addEventListener('cancel', e => { if (saving) e.preventDefault(); });
$('modal').addEventListener('click', e => { if (e.target === $('modal') && !saving) { const r = $('modal').getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) $('modal').close(); } });
async function save(text, personal = false) {
  if (saving) return;
  if (!text.trim()) { $('form-error').textContent = mode === 'gift' ? 'Напиши желание или вставь ссылку.' : 'Напиши ответ или выбери кнопку ниже.'; $('message').focus(); return; }
  saving = true; $('form-error').textContent = ''; $('modal').querySelectorAll('button').forEach(b => b.disabled = true);
  // Keep the same ID when retrying the same message after a lost response.
  if (!pending || pending.text !== text) pending = {id:editingId || makeId(), sessionId, type:mode, text};
  try {
    const response = await apiFetch('/api/entries', {method:editingId ? 'PATCH' : 'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(pending), signal:AbortSignal.timeout(12000)});
    const data = await response.json(); if (!response.ok) throw Error(data.error || 'Не удалось сохранить.');
    const entryIndex = entries.findIndex(e => e.id === data.entry.id);
    if (entryIndex === -1) entries.push(data.entry); else entries[entryIndex] = data.entry;
    render(); $('modal').close(); pending = null;
    if (mode === 'reply') showEnding(personal);
    else toast(editingId ? 'Желание обновлено ♡' : 'Ещё одно желание под ёлкой ♡');
  } catch (e) { $('form-error').textContent = e.name === 'TimeoutError' ? 'Сервер не ответил. Текст остался в окне — попробуй ещё раз.' : (e.message === 'Failed to fetch' ? 'Не удалось связаться с сервером. Текст остался в окне — попробуй ещё раз, когда связь появится.' : e.message); }
  finally { saving = false; $('modal').querySelectorAll('button').forEach(b => b.disabled = false); }
}
$('modal-form').addEventListener('submit', e => { e.preventDefault(); save($('message').value.trim()); });
document.querySelectorAll('[data-answer]').forEach(b => b.addEventListener('click', () => save(b.dataset.answer + ($('message').value.trim() ? '\n\n' + $('message').value.trim() : ''))));
$('personal').addEventListener('click', () => save('Хочу ответить лично в Telegram' + ($('message').value.trim() ? '\n\n' + $('message').value.trim() : ''), true));
