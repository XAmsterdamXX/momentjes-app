/* Momentjes — app-logica en schermen */

(() => {
  'use strict';

  // ============ Hulpjes ============
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const MONTHS = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
  const WEEKDAYS = ['zo','ma','di','wo','do','vr','za'];

  const fmtTime = (secs) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;

  function fmtDate(iso) {
    const d = new Date(iso);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }
  function fmtDateShort(iso) {
    const d = new Date(iso);
    const now = new Date();
    const today = now.toDateString() === d.toDateString();
    const yesterday = new Date(now - 864e5).toDateString() === d.toDateString();
    if (today) return 'vandaag';
    if (yesterday) return 'gisteren';
    return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}${d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : ''}`;
  }

  const CAT_ICONS = { quote: 'i-quote', question: 'i-question', leaf: 'i-leaf', flag: 'i-flag' };
  const catIcon = (cat) => CAT_ICONS[cat?.icon] || 'i-sparkle';
  const svg = (id, cls = 'icon') => `<svg class="${cls}"><use href="#${id}"/></svg>`;

  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._id);
    toast._id = setTimeout(() => { t.hidden = true; }, ms);
  }

  // ============ State ============
  const S = {
    children: [], categories: [], memories: [],
    activeChildId: null,
    tab: 'home',
    searchQuery: '', searchCat: null, searchFav: false,
    editingMemory: null,
  };

  const catById = (id) => S.categories.find(c => c.id === id);
  const childById = (id) => S.children.find(c => c.id === id);
  const activeChild = () => childById(S.activeChildId) || S.children[0];

  async function loadAll() {
    [S.children, S.categories, S.memories] = await Promise.all([
      DB.getAll('children'), DB.getAll('categories'), DB.getAll('memories'),
    ]);
    S.categories.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    S.memories.sort((a, b) => new Date(b.date) - new Date(a.date));
    if (!S.activeChildId) S.activeChildId = await DB.getSetting('activeChildId');
    if (!childById(S.activeChildId) && S.children[0]) S.activeChildId = S.children[0].id;
  }

  const memoriesOfChild = () => S.memories.filter(m => m.childId === S.activeChildId);

  // ============ Audio afspelen ============
  const Player = {
    audio: null, memoryId: null, raf: null,
    async toggle(memoryId, onProgress, onState) {
      if (this.memoryId === memoryId && this.audio) {
        if (this.audio.paused) { this.audio.play(); onState && onState('playing'); }
        else { this.audio.pause(); onState && onState('paused'); }
        return;
      }
      this.stopAll();
      const mem = S.memories.find(m => m.id === memoryId);
      if (!mem || !mem.audioId) return;
      const rec = await DB.get('audio', mem.audioId);
      if (!rec || !rec.blob) { toast('Geen audio gevonden bij dit momentje'); return; }
      const url = URL.createObjectURL(rec.blob);
      this.audio = new Audio(url);
      this.memoryId = memoryId;
      this.audio.onended = () => { onState && onState('ended'); this.stopAll(); };
      this.audio.onerror = () => { toast('Audio kan niet worden afgespeeld'); this.stopAll(); };
      const tick = () => {
        if (this.audio && !this.audio.paused && onProgress) {
          onProgress(this.audio.currentTime, this.audio.duration || mem.audioDuration || 0);
        }
        this.raf = requestAnimationFrame(tick);
      };
      try { await this.audio.play(); onState && onState('playing'); tick(); }
      catch (_) { toast('Audio kan niet worden afgespeeld'); this.stopAll(); }
    },
    stopAll() {
      cancelAnimationFrame(this.raf);
      if (this.audio) {
        this.audio.pause();
        if (this.audio.src && this.audio.src.startsWith('blob:')) URL.revokeObjectURL(this.audio.src);
      }
      this.audio = null; this.memoryId = null;
      $$('.play-chip.playing').forEach(b => {
        b.classList.remove('playing');
        b.querySelector('use').setAttribute('href', '#i-play');
      });
    },
  };

  // ============ Memory cards ============
  function cardHTML(m, i = 0) {
    const cat = catById(m.categoryId) || {};
    return `
      <button class="memory-card" data-memory="${m.id}" style="--accent:${cat.color || '#A5A5AE'}; animation-delay:${Math.min(i * 45, 300)}ms">
        <span class="cat-icon">${svg(catIcon(cat))}</span>
        <span class="memory-body">
          <span class="memory-title">${esc(m.title || 'Momentje')}</span>
          ${m.text ? `<span class="memory-text">${esc(m.text)}</span>` : ''}
          <span class="memory-meta">
            ${m.isFavorite ? `<span class="memory-fav">${svg('i-heart')}</span>` : ''}
            <span>${fmtDateShort(m.date)}</span>
            ${m.audioDuration ? `<span>·</span><span>${fmtTime(m.audioDuration)}</span>` : ''}
            <span>·</span><span>${esc(cat.name || '')}</span>
          </span>
        </span>
        ${m.audioId ? `<span class="play-chip" data-play="${m.id}" style="--accent:${cat.color || '#E85D75'}" role="button" aria-label="Afspelen">${svg('i-play')}</span>` : ''}
      </button>`;
  }

  function bindCards(container) {
    container.querySelectorAll('[data-play]').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = chip.dataset.play;
        const use = chip.querySelector('use');
        Player.toggle(id, null, (st) => {
          $$('.play-chip.playing').forEach(b => {
            if (b !== chip) { b.classList.remove('playing'); b.querySelector('use').setAttribute('href', '#i-play'); }
          });
          if (st === 'playing') { chip.classList.add('playing'); use.setAttribute('href', '#i-pause'); }
          else { chip.classList.remove('playing'); use.setAttribute('href', '#i-play'); }
        });
      });
    });
    container.querySelectorAll('[data-memory]').forEach(card => {
      card.addEventListener('click', () => openDetail(card.dataset.memory));
    });
  }

  const EMPTY_HOME = `
    <div class="empty">
      <div class="empty-art">${svg('i-sparkle')}</div>
      <strong>Nog geen momentjes</strong>
      <span>Tik op de grote knop en leg je eerste momentje vast — een grappige uitspraak, een vraag, een klein wonder.</span>
    </div>`;

  // ============ Home ============
  function renderHome() {
    const child = activeChild();
    const h = new Date().getHours();
    const dagdeel = h < 6 ? 'Goedenacht' : h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond';
    $('#home-greeting').textContent = `${dagdeel} — de mooiste momenten van ${child ? child.name : 'je kind'}`;

    const chip = $('#home-child-chip');
    if (S.children.length > 0 && child) {
      chip.hidden = false;
      chip.innerHTML = `<span class="child-dot" style="background:${child.color}">${esc(child.name[0].toUpperCase())}</span>${esc(child.name)}`;
      chip.onclick = () => openChildSwitcher();
    } else chip.hidden = true;

    const mems = memoriesOfChild();
    const wrap = $('#home-cards');
    if (mems.length === 0) { wrap.innerHTML = EMPTY_HOME; }
    else {
      wrap.innerHTML = mems.slice(0, 5).map((m, i) => cardHTML(m, i)).join('');
      bindCards(wrap);
    }
    renderBackupNudge(mems.length);
  }

  async function renderBackupNudge(count) {
    const nudge = $('#backup-nudge');
    const last = await DB.getSetting('lastBackupAt');
    const dismissed = await DB.getSetting('nudgeDismissedAt');
    let show = false, text = '';
    if (count >= 3) {
      if (!last) { show = true; text = `Je hebt ${count} momentjes die alleen op dit toestel staan.`; }
      else {
        const days = Math.floor((Date.now() - new Date(last)) / 864e5);
        if (days >= 21) { show = true; text = `Je laatste backup was ${days} dagen geleden.`; }
      }
    }
    if (dismissed && Date.now() - new Date(dismissed) < 7 * 864e5) show = false;
    nudge.hidden = !show;
    if (show) {
      $('#backup-nudge-text').textContent = text;
      $('#backup-nudge-btn').onclick = doExport;
    }
  }

  // ============ Tijdlijn ============
  function renderTimeline() {
    const mems = memoriesOfChild();
    $('#timeline-count').textContent = mems.length === 1 ? '1 momentje' : `${mems.length} momentjes`;
    const list = $('#timeline-list');
    if (mems.length === 0) { list.innerHTML = EMPTY_HOME; return; }

    // Groepeer per maand, daarbinnen per dag
    const byMonth = new Map();
    for (const m of mems) {
      const d = new Date(m.date);
      const mk = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
      if (!byMonth.has(mk)) byMonth.set(mk, { year: d.getFullYear(), month: d.getMonth(), days: new Map() });
      const g = byMonth.get(mk);
      const dk = d.getDate();
      if (!g.days.has(dk)) g.days.set(dk, []);
      g.days.get(dk).push(m);
    }

    let html = '';
    let i = 0;
    for (const [, g] of [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
      const monthName = MONTHS[g.month][0].toUpperCase() + MONTHS[g.month].slice(1);
      html += `<div class="month-block"><div class="month-title">${monthName} ${g.year}</div>`;
      for (const [day, dayMems] of [...g.days.entries()].sort((a, b) => b[0] - a[0])) {
        const wd = WEEKDAYS[new Date(dayMems[0].date).getDay()];
        html += `
          <div class="timeline-row">
            <div class="day-chip"><div class="d">${day}</div><div class="wd">${wd}</div></div>
            <div class="cards">${dayMems.map(m => cardHTML(m, i++)).join('')}</div>
          </div>`;
      }
      html += `</div>`;
    }
    list.innerHTML = html;
    bindCards(list);
  }

  // ============ Zoeken ============
  function renderSearchFilters() {
    const row = $('#search-filters');
    row.innerHTML = S.categories.map(c => `
      <button class="filter-chip ${S.searchCat === c.id ? 'active' : ''}" data-cat="${c.id}" style="--accent:${c.color}">
        ${svg(catIcon(c))}${esc(c.name)}
      </button>`).join('') + `
      <button class="filter-chip ${S.searchFav ? 'active' : ''}" data-fav style="--accent:#E6667F">
        ${svg('i-heart')}Favorieten
      </button>`;
    row.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => {
      S.searchCat = S.searchCat === b.dataset.cat ? null : b.dataset.cat;
      renderSearch();
    }));
    row.querySelector('[data-fav]').addEventListener('click', () => {
      S.searchFav = !S.searchFav;
      renderSearch();
    });
  }

  function renderSearch() {
    renderSearchFilters();
    const q = S.searchQuery.trim().toLowerCase();
    let results = memoriesOfChild();
    if (S.searchCat) results = results.filter(m => m.categoryId === S.searchCat);
    if (S.searchFav) results = results.filter(m => m.isFavorite);
    if (q) results = results.filter(m =>
      (m.title || '').toLowerCase().includes(q) || (m.text || '').toLowerCase().includes(q));

    const wrap = $('#search-results');
    if (!q && !S.searchCat && !S.searchFav) {
      wrap.innerHTML = `<div class="empty"><div class="empty-art">${svg('i-search')}</div><strong>Zoek een momentje terug</strong><span>Typ een woord of kies een categorie.</span></div>`;
      return;
    }
    if (results.length === 0) {
      wrap.innerHTML = `<div class="empty"><div class="empty-art">${svg('i-search')}</div><strong>Niets gevonden</strong><span>Probeer een ander woord of filter.</span></div>`;
      return;
    }
    wrap.innerHTML = results.map((m, i) => cardHTML(m, i)).join('');
    bindCards(wrap);
  }

  // ============ Sheet-infrastructuur ============
  function openSheet(html) {
    Player.stopAll();
    $('#sheet-content').innerHTML = html;
    $('#sheet').hidden = false;
    $('#sheet-backdrop').hidden = false;
    $('#sheet').classList.remove('closing');
    $('#sheet-backdrop').classList.remove('closing');
  }
  function closeSheet() {
    const sheet = $('#sheet'), bd = $('#sheet-backdrop');
    if (sheet.hidden) return;
    Player.stopAll();
    sheet.classList.add('closing'); bd.classList.add('closing');
    setTimeout(() => { sheet.hidden = true; bd.hidden = true; }, 240);
  }
  $('#sheet-backdrop').addEventListener('click', closeSheet);

  // ============ Opnemen ============
  let rec = null, speech = null;

  async function startRecording() {
    if (!Recorder.supported()) {
      toast('Opnemen wordt niet ondersteund in deze browser');
      return;
    }
    rec = Recorder.create();
    try { await rec.start(); }
    catch (err) {
      toast('Geen toegang tot de microfoon — check je instellingen');
      rec = null;
      return;
    }

    const overlay = $('#record-overlay');
    overlay.hidden = false;
    $('#record-timer').textContent = '0:00';
    $('#transcript-text').innerHTML = '';
    $('#transcript-placeholder').hidden = false;
    $('#speech-note').hidden = true;
    $('.rec-dot').classList.remove('paused');
    const pauseBtn = $('#record-pause');
    pauseBtn.querySelector('use').setAttribute('href', '#i-pause');

    // Golfjes
    const wave = $('#wave');
    if (!wave.children.length) {
      for (let i = 0; i < 28; i++) wave.appendChild(document.createElement('i'));
    }
    const bars = Array.from(wave.children);

    rec.onTick = (ms) => { $('#record-timer').textContent = fmtTime(ms / 1000); };
    rec.onLevel = (data) => {
      const step = Math.floor(data.length / bars.length);
      bars.forEach((b, i) => {
        const v = data[i * step] / 255;
        b.style.height = `${8 + Math.round(v * 56)}px`;
      });
    };

    // Live meeschrijven (best effort)
    speech = Speech.create('nl-NL');
    if (speech) {
      speech.onUpdate = (final, interim) => {
        $('#transcript-placeholder').hidden = !!(final || interim);
        $('#transcript-text').innerHTML = `${esc(final)} <span class="interim">${esc(interim)}</span>`;
        const box = $('#live-transcript');
        box.scrollTop = box.scrollHeight;
      };
      speech.onUnavailable = () => { $('#speech-note').hidden = false; };
      speech.start();
    } else {
      $('#speech-note').hidden = false;
    }
  }

  async function stopRecording(save) {
    if (!rec) return;
    const theRec = rec; rec = null;
    if (speech) { speech.stop(); }
    const transcript = speech ? speech.text : '';
    speech = null;
    $('#record-overlay').hidden = true;

    if (!save) { theRec.cancel(); return; }
    const result = await theRec.stop();
    if (!result || !result.blob || result.blob.size === 0) {
      toast('Er is niets opgenomen');
      return;
    }
    openSaveSheet({ blob: result.blob, mime: result.mime, duration: result.duration, transcript });
  }

  $('#record-btn').addEventListener('click', startRecording);
  $('#record-stop').addEventListener('click', () => stopRecording(true));
  $('#record-cancel').addEventListener('click', () => {
    if (confirm('Opname weggooien?')) stopRecording(false);
  });
  $('#record-pause').addEventListener('click', () => {
    if (!rec) return;
    const use = $('#record-pause use');
    const dot = $('.rec-dot');
    if (rec.paused) {
      rec.resume(); if (speech) speech.start();
      use.setAttribute('href', '#i-pause'); dot.classList.remove('paused');
    } else {
      rec.pause(); if (speech) speech.stop();
      use.setAttribute('href', '#i-play'); dot.classList.add('paused');
    }
  });

  // ============ Bewaren ============
  function autoTitle(text) {
    if (!text) return '';
    const words = text.trim().split(/\s+/).slice(0, 6).join(' ');
    return words.length > 42 ? words.slice(0, 42) + '…' : words;
  }

  function dateInputValues(d = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return {
      date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
      time: `${p(d.getHours())}:${p(d.getMinutes())}`,
    };
  }

  function catSelectHTML(selectedId) {
    return `<div class="cat-select" id="cat-select">
      ${S.categories.map(c => `
        <button type="button" class="cat-option ${c.id === selectedId ? 'active' : ''}" data-cat="${c.id}" style="--accent:${c.color}">
          <span class="cat-icon" style="background:${c.color}">${svg(catIcon(c))}</span>${esc(c.name)}
        </button>`).join('')}
    </div>`;
  }

  function bindCatSelect() {
    const box = $('#cat-select');
    box.querySelectorAll('.cat-option').forEach(b => b.addEventListener('click', () => {
      box.querySelectorAll('.cat-option').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    }));
  }
  const selectedCat = () => $('#cat-select .cat-option.active')?.dataset.cat || S.categories[0]?.id;

  function openSaveSheet(recording) {
    const { date, time } = dateInputValues();
    const child = activeChild();
    openSheet(`
      <h2 class="sheet-title">Momentje bewaren</h2>
      <div class="field">
        <label>Titel</label>
        <input type="text" id="save-title" value="${esc(autoTitle(recording.transcript))}" placeholder="Bijv. ‘Waarom is de maan rond?’">
      </div>
      <div class="field">
        <label>Wat werd er gezegd of gedaan?</label>
        <textarea id="save-text" placeholder="${recording.transcript ? '' : 'Typ hier wat er gebeurde — de audio blijft er altijd bij.'}">${esc(recording.transcript)}</textarea>
      </div>
      <div class="field">
        <label>Categorie</label>
        ${catSelectHTML(S.categories[0]?.id)}
      </div>
      <div class="field-row">
        <div class="field"><label>Datum</label><input type="date" id="save-date" value="${date}"></div>
        <div class="field"><label>Tijd</label><input type="time" id="save-time" value="${time}"></div>
      </div>
      <div class="btn-stack">
        <button class="btn" id="save-confirm">${svg('i-check')}Bewaren${child ? ' voor ' + esc(child.name) : ''}</button>
        <button class="btn btn-danger" id="save-discard">Opname weggooien</button>
      </div>
    `);
    bindCatSelect();
    $('#save-discard').addEventListener('click', () => {
      if (confirm('Weet je zeker dat je deze opname wilt weggooien?')) closeSheet();
    });
    $('#save-confirm').addEventListener('click', async () => {
      const id = DB.uuid();
      const audioId = 'audio-' + id;
      await DB.put('audio', { id: audioId, blob: recording.blob, mime: recording.mime });
      const when = new Date(`${$('#save-date').value}T${$('#save-time').value || '12:00'}`);
      const memory = {
        id,
        childId: S.activeChildId,
        categoryId: selectedCat(),
        title: $('#save-title').value.trim() || autoTitle($('#save-text').value) || 'Momentje',
        text: $('#save-text').value.trim(),
        date: (isNaN(when) ? new Date() : when).toISOString(),
        createdAt: new Date().toISOString(),
        audioId,
        audioDuration: recording.duration,
        isFavorite: false,
      };
      await DB.put('memories', memory);
      DB.requestPersistence();
      await loadAll();
      closeSheet();
      renderCurrent();
      toast('Momentje bewaard ✓');
    });
  }

  // ============ Detail ============
  async function openDetail(id) {
    const m = S.memories.find(x => x.id === id);
    if (!m) return;
    const cat = catById(m.categoryId) || {};
    openSheet(`
      <div class="sheet-head">
        <span class="detail-cat" style="--accent:${cat.color}">${svg(catIcon(cat))}${esc(cat.name || '')}</span>
        <button class="ctrl-fav" id="detail-fav" aria-label="Favoriet" style="color:${m.isFavorite ? '#E6667F' : '#A5A5AE'}">
          ${svg(m.isFavorite ? 'i-heart' : 'i-heart-o')}
        </button>
      </div>
      <h2 class="sheet-title">${esc(m.title)}</h2>
      <p class="detail-date">${fmtDate(m.date)}</p>
      ${m.audioId ? `
        <div class="audio-player" style="--accent:${cat.color}">
          <span class="play-chip" id="detail-play" style="--accent:${cat.color}">${svg('i-play')}</span>
          <div class="audio-progress"><i id="detail-progress"></i></div>
          <span class="audio-time" id="detail-time">${m.audioDuration ? fmtTime(m.audioDuration) : '–:––'}</span>
        </div>` : ''}
      ${m.text ? `<p class="detail-text">${esc(m.text)}</p>` : '<p class="detail-text" style="color:var(--text-faint)">Nog geen tekst — tik op bewerken om te typen wat er gezegd werd.</p>'}
      <div class="btn-stack">
        <button class="btn btn-secondary" id="detail-edit">${svg('i-edit')}Bewerken</button>
        <button class="btn btn-danger" id="detail-delete">${svg('i-trash')}Verwijderen</button>
      </div>
    `);

    $('#detail-fav').addEventListener('click', async () => {
      m.isFavorite = !m.isFavorite;
      await DB.put('memories', m);
      openDetail(id);
      renderCurrent();
    });

    if (m.audioId) {
      const chip = $('#detail-play');
      chip.addEventListener('click', () => {
        Player.toggle(id, (t, dur) => {
          $('#detail-progress').style.width = dur ? `${(t / dur) * 100}%` : '0%';
          $('#detail-time').textContent = fmtTime(t);
        }, (st) => {
          const use = chip.querySelector('use');
          if (st === 'playing') { chip.classList.add('playing'); use.setAttribute('href', '#i-pause'); }
          else {
            chip.classList.remove('playing'); use.setAttribute('href', '#i-play');
            if (st === 'ended') {
              $('#detail-progress').style.width = '0%';
              $('#detail-time').textContent = m.audioDuration ? fmtTime(m.audioDuration) : '–:––';
            }
          }
        });
      });
    }

    $('#detail-edit').addEventListener('click', () => openEdit(id));
    $('#detail-delete').addEventListener('click', async () => {
      if (!confirm(`"${m.title}" verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;
      if (m.audioId) await DB.del('audio', m.audioId);
      await DB.del('memories', m.id);
      await loadAll();
      closeSheet();
      renderCurrent();
      toast('Momentje verwijderd');
    });
  }

  function openEdit(id) {
    const m = S.memories.find(x => x.id === id);
    if (!m) return;
    const d = new Date(m.date);
    const { date, time } = dateInputValues(d);
    openSheet(`
      <h2 class="sheet-title">Momentje bewerken</h2>
      <div class="field"><label>Titel</label><input type="text" id="edit-title" value="${esc(m.title)}"></div>
      <div class="field"><label>Tekst</label><textarea id="edit-text">${esc(m.text || '')}</textarea></div>
      <div class="field"><label>Categorie</label>${catSelectHTML(m.categoryId)}</div>
      <div class="field-row">
        <div class="field"><label>Datum</label><input type="date" id="edit-date" value="${date}"></div>
        <div class="field"><label>Tijd</label><input type="time" id="edit-time" value="${time}"></div>
      </div>
      <div class="btn-stack">
        <button class="btn" id="edit-save">${svg('i-check')}Opslaan</button>
        <button class="btn btn-secondary" id="edit-cancel">Annuleren</button>
      </div>
    `);
    bindCatSelect();
    $('#edit-cancel').addEventListener('click', () => openDetail(id));
    $('#edit-save').addEventListener('click', async () => {
      m.title = $('#edit-title').value.trim() || m.title;
      m.text = $('#edit-text').value.trim();
      m.categoryId = selectedCat();
      const when = new Date(`${$('#edit-date').value}T${$('#edit-time').value || '12:00'}`);
      if (!isNaN(when)) m.date = when.toISOString();
      await DB.put('memories', m);
      await loadAll();
      renderCurrent();
      openDetail(id);
      toast('Opgeslagen ✓');
    });
  }

  // ============ Kinderen ============
  function openChildSwitcher() {
    openSheet(`
      <h2 class="sheet-title">Voor wie?</h2>
      <div class="settings-card">
        ${S.children.map(c => `
          <button class="settings-row" data-child="${c.id}">
            <span class="child-dot" style="background:${c.color}">${esc(c.name[0].toUpperCase())}</span>
            <span class="grow">${esc(c.name)}<span class="sub">${S.memories.filter(m => m.childId === c.id).length} momentjes</span></span>
            ${c.id === S.activeChildId ? svg('i-check') : ''}
          </button>`).join('')}
      </div>
      <div class="btn-stack">
        <button class="btn btn-secondary" id="child-add">${svg('i-plus')}Kind toevoegen</button>
      </div>
    `);
    $$('#sheet [data-child]').forEach(b => b.addEventListener('click', async () => {
      S.activeChildId = b.dataset.child;
      await DB.setSetting('activeChildId', S.activeChildId);
      closeSheet();
      renderCurrent();
    }));
    $('#child-add').addEventListener('click', () => openChildForm());
  }

  function openChildForm(child = null) {
    const usedColors = S.children.map(c => c.color);
    const defaultColor = child ? child.color :
      (DB.CHILD_COLORS.find(c => !usedColors.includes(c)) || DB.CHILD_COLORS[S.children.length % DB.CHILD_COLORS.length]);
    openSheet(`
      <h2 class="sheet-title">${child ? 'Kind bewerken' : 'Kind toevoegen'}</h2>
      <div class="field">
        <label>Naam</label>
        <input type="text" id="child-name" value="${esc(child ? child.name : '')}" placeholder="Bijv. Sam" autocomplete="off">
      </div>
      <div class="field">
        <label>Kleur</label>
        <div class="color-row" style="justify-content:flex-start">
          ${DB.CHILD_COLORS.map(c => `<button type="button" class="color-swatch ${c === defaultColor ? 'active' : ''}" data-color="${c}" style="background:${c}" aria-label="Kleur"></button>`).join('')}
        </div>
      </div>
      <div class="btn-stack">
        <button class="btn" id="child-save">${svg('i-check')}Bewaren</button>
        ${child && S.children.length > 1 ? `<button class="btn btn-danger" id="child-delete">Verwijderen</button>` : ''}
      </div>
    `);
    $$('#sheet .color-swatch').forEach(b => b.addEventListener('click', () => {
      $$('#sheet .color-swatch').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    }));
    $('#child-save').addEventListener('click', async () => {
      const name = $('#child-name').value.trim();
      if (!name) { toast('Vul een naam in'); return; }
      const color = $('#sheet .color-swatch.active')?.dataset.color || defaultColor;
      if (child) { child.name = name; child.color = color; await DB.put('children', child); }
      else {
        const c = { id: DB.uuid(), name, color, createdAt: new Date().toISOString() };
        await DB.put('children', c);
        S.activeChildId = c.id;
        await DB.setSetting('activeChildId', c.id);
      }
      await loadAll();
      closeSheet();
      renderCurrent();
    });
    const delBtn = $('#child-delete');
    if (delBtn) delBtn.addEventListener('click', async () => {
      const count = S.memories.filter(m => m.childId === child.id).length;
      if (!confirm(`${child.name} verwijderen?${count ? ` De ${count} bijbehorende momentjes worden ook verwijderd.` : ''} Dit kan niet ongedaan worden gemaakt.`)) return;
      for (const m of S.memories.filter(m => m.childId === child.id)) {
        if (m.audioId) await DB.del('audio', m.audioId);
        await DB.del('memories', m.id);
      }
      await DB.del('children', child.id);
      S.activeChildId = null;
      await loadAll();
      closeSheet();
      renderCurrent();
    });
  }

  // ============ Instellingen ============
  async function renderSettings() {
    const last = await DB.getSetting('lastBackupAt');
    const est = await DB.storageEstimate();
    const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
    const usedMB = est && est.usage ? (est.usage / 1048576).toFixed(1) : null;

    $('#settings-content').innerHTML = `
      <div class="settings-group">
        <p class="settings-label">Kinderen</p>
        <div class="settings-card">
          ${S.children.map(c => `
            <button class="settings-row" data-edit-child="${c.id}">
              <span class="child-dot" style="background:${c.color}">${esc(c.name[0].toUpperCase())}</span>
              <span class="grow">${esc(c.name)}<span class="sub">${S.memories.filter(m => m.childId === c.id).length} momentjes</span></span>
              ${svg('i-back', 'icon chevron')}
            </button>`).join('')}
          <button class="settings-row" id="settings-add-child">
            ${svg('i-plus')}<span class="grow">Kind toevoegen</span>
          </button>
        </div>
      </div>

      <div class="settings-group">
        <p class="settings-label">Backup — raak nooit iets kwijt</p>
        <div class="settings-card">
          <button class="settings-row" id="settings-export">
            ${svg('i-share')}
            <span class="grow">Backup maken<span class="sub">${last ? 'Laatste backup: ' + fmtDate(last) : 'Nog geen backup gemaakt'}</span></span>
            ${svg('i-back', 'icon chevron')}
          </button>
          <button class="settings-row" id="settings-import">
            ${svg('i-import')}
            <span class="grow">Backup terugzetten<span class="sub">Zet momentjes terug op dit of een nieuw toestel</span></span>
            ${svg('i-back', 'icon chevron')}
          </button>
        </div>
      </div>

      <div class="settings-group">
        <p class="settings-label">Privacy</p>
        <div class="settings-card">
          <div class="privacy-note">
            ${svg('i-lock')}
            <span>Alle momentjes — audio én tekst — staan <strong>alleen op dit toestel</strong>. Er is geen account, geen server en geen tracking. Maak regelmatig een backup naar je eigen iCloud/Bestanden; alleen jij kunt erbij.${usedMB ? `<br><br>Opslag in gebruik: ${usedMB} MB${persisted ? ' · beschermd tegen automatisch opruimen ✓' : ''}` : ''}</span>
          </div>
        </div>
      </div>

      <div class="settings-group">
        <p class="settings-label">Over</p>
        <div class="settings-card">
          <div class="settings-row" style="cursor:default">
            ${svg('i-sparkle')}
            <span class="grow">Momentjes<span class="sub">Versie 1.0 — gemaakt met liefde, voor de kleine grote momenten</span></span>
          </div>
        </div>
      </div>
    `;

    $$('#settings-content [data-edit-child]').forEach(b =>
      b.addEventListener('click', () => openChildForm(childById(b.dataset.editChild))));
    $('#settings-add-child').addEventListener('click', () => openChildForm());
    $('#settings-export').addEventListener('click', doExport);
    $('#settings-import').addEventListener('click', () => $('#import-file').click());
  }

  async function doExport() {
    toast('Backup wordt gemaakt…');
    try {
      const res = await Backup.exportBackup();
      if (res.ok) {
        toast(res.via === 'share' ? 'Backup gedeeld ✓' : 'Backup gedownload ✓');
        await DB.setSetting('nudgeDismissedAt', new Date().toISOString());
        renderCurrent();
      }
    } catch (err) {
      console.error(err);
      toast('Backup maken is niet gelukt');
    }
  }

  $('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    toast('Backup wordt ingelezen…');
    try {
      const buf = await file.arrayBuffer();
      const res = await Backup.importBackup(buf);
      DB.requestPersistence();
      await loadAll();
      renderCurrent();
      toast(res.added > 0
        ? `${res.added} momentje${res.added === 1 ? '' : 's'} toegevoegd ✓${res.skipped ? ` (${res.skipped} stonden er al)` : ''}`
        : 'Alles uit deze backup stond er al');
    } catch (err) {
      console.error(err);
      toast('Dit bestand kon niet worden gelezen als Momentjes-backup');
    }
  });

  // ============ Tabs ============
  function renderCurrent() {
    renderHome();
    if (S.tab === 'timeline') renderTimeline();
    if (S.tab === 'search') renderSearch();
    if (S.tab === 'settings') renderSettings();
  }

  function switchTab(tab) {
    S.tab = tab;
    Player.stopAll();
    $$('.view').forEach(v => { v.hidden = v.dataset.view !== tab; });
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    renderCurrent();
    window.scrollTo({ top: 0 });
  }

  $$('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
  $('#home-see-all').addEventListener('click', () => switchTab('timeline'));
  $('#search-input').addEventListener('input', (e) => { S.searchQuery = e.target.value; renderSearch(); });

  // ============ Onboarding ============
  function showOnboarding() {
    const ob = $('#onboarding');
    ob.hidden = false;

    function step1() {
      $('#onboarding-inner').innerHTML = `
        <div class="ob-mark">${svg('i-mic')}</div>
        <h1 class="ob-title">Momentjes</h1>
        <p class="ob-lead">De grappige uitspraken, grote vragen en kleine wonderen van je kind — vastgelegd in hun eigen stemmetje, voordat je ze vergeet.</p>
        <div class="ob-points">
          <div class="ob-point">
            <span class="ob-point-icon" style="background:#4D99E6">${svg('i-mic')}</span>
            <div><strong>Opnemen in 1 tik</strong><span>De app schrijft live mee terwijl je vertelt (of je kind zelf praat).</span></div>
          </div>
          <div class="ob-point">
            <span class="ob-point-icon" style="background:#66BB6A">${svg('i-lock')}</span>
            <div><strong>100% privé</strong><span>Alles blijft op jouw telefoon. Geen account, geen cloud, geen tracking.</span></div>
          </div>
          <div class="ob-point">
            <span class="ob-point-icon" style="background:#E6667F">${svg('i-heart')}</span>
            <div><strong>Voor later</strong><span>Een tijdlijn vol momentjes om samen terug te luisteren — ook over 20 jaar.</span></div>
          </div>
        </div>
        <button class="btn btn-coral" id="ob-next">Beginnen</button>
      `;
      $('#ob-next').addEventListener('click', step2);
    }

    function step2() {
      $('#onboarding-inner').innerHTML = `
        <div class="ob-mark" style="background:linear-gradient(150deg,#6FADE9,#4D99E6)">${svg('i-child')}</div>
        <h1 class="ob-title">Van wie bewaren we momentjes?</h1>
        <p class="ob-lead">Je kunt er later altijd meer kinderen bij zetten.</p>
        <div class="field">
          <label>Naam</label>
          <input type="text" id="ob-name" placeholder="Bijv. Sam" autocomplete="off" style="width:100%;border:1.5px solid var(--line);background:#fff;border-radius:14px;padding:14px;outline:none;font-size:17px">
        </div>
        <div class="field">
          <label>Kleur</label>
          <div class="color-row">
            ${DB.CHILD_COLORS.map((c, i) => `<button type="button" class="color-swatch ${i === 0 ? 'active' : ''}" data-color="${c}" style="background:${c}" aria-label="Kleur"></button>`).join('')}
          </div>
        </div>
        <button class="btn btn-coral" id="ob-done">Klaar — laat maar zien</button>
      `;
      $$('#onboarding .color-swatch').forEach(b => b.addEventListener('click', () => {
        $$('#onboarding .color-swatch').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      }));
      $('#ob-name').focus();
      $('#ob-done').addEventListener('click', async () => {
        const name = $('#ob-name').value.trim();
        if (!name) { $('#ob-name').style.borderColor = '#E5484D'; $('#ob-name').focus(); return; }
        const color = $('#onboarding .color-swatch.active')?.dataset.color || DB.CHILD_COLORS[0];
        const child = { id: DB.uuid(), name, color, createdAt: new Date().toISOString() };
        await DB.put('children', child);
        S.activeChildId = child.id;
        await DB.setSetting('activeChildId', child.id);
        await DB.setSetting('onboarded', true);
        DB.requestPersistence();
        await loadAll();
        ob.hidden = true;
        $('#app').hidden = false;
        renderCurrent();
      });
    }

    step1();
  }

  // ============ Start ============
  async function init() {
    await DB.ensureDefaults();
    await loadAll();
    const onboarded = await DB.getSetting('onboarded');
    if (!onboarded || S.children.length === 0) {
      showOnboarding();
    } else {
      $('#app').hidden = false;
      renderCurrent();
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  init();
})();
