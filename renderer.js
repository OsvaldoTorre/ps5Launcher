(async () => {
  const REF_W = 1326, COLS = 5;
  const $ = s => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const topActions = [...document.querySelectorAll('#top .right > button.ico')];

  // Escala toda la UI a partir del diseño de 1326px de ancho
  function fit() {
    const z = innerWidth / REF_W;
    document.body.style.zoom = z;
    document.body.style.height = (innerHeight / z) + 'px';
  }
  addEventListener('resize', fit); fit();

  const all = await window.api.getGames();
  const system = await window.api.getSystem();
  all.forEach(g => { g.colors = g.colors && g.colors.length >= 2 ? g.colors : ['#2b5bff', '#7a1fa2', '#0b1020']; });
  const STORE_NAME = { steam: 'Steam', epic: 'Epic Games', gog: 'GOG', local: 'Local', all: 'Explorador' };
  const STORES = [
    { id: 'steam', name: 'Steam', glyph: 'S', desc: 'Abrir la tienda de Steam' },
    { id: 'epic', name: 'Epic Games', glyph: 'E', desc: 'Abrir la tienda de Epic Games' },
    { id: 'gog', name: 'GOG', glyph: 'G', desc: 'Abrir la tienda de GOG' }
  ];
  const isInstalled = g => g.installed !== false;
  // Inicio: solo instalados, los jugados más recientemente primero
  const games = all.filter(isInstalled).sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || a.title.localeCompare(b.title, 'es'));

  // ---------- Estado ----------
  let sel = 0, lastSel = -1, zone = 'row', btn = 0, cur = 0, mainTabIdx = 0;
  let tab = 'games';                         // games | media | library | explore | store
  let stab = 'installed', lzone = 'tabs';    // biblioteca: header | tabs | toolbar | grid | side | stores
  let libToolIdx = 0, libHeaderIdx = 0, exploreHeaderIdx = 0;
  let li = 0, si = 0, storeIdx = 0, sortMode = 0, list = [];
  let exploreFilter = 'all', exploreItems = [], exploreLoaded = false;
  let exploreZone = 'filters', exploreFilterIdx = 0, exploreIndex = 0;
  let storeDeals = [], storeLoaded = false, storeLoadErrors = {};
  let storeZone = 'filters', storeHeaderIdx = 0, storeFilter = 'all', storeFilterIdx = 0, storeIndex = 0;
  let previewIndex = 0;
  const SORTS = ['Nombre (A-Z)', 'Nombre (Z-A)', 'Tienda'];
  const STABS = ['installed', 'owned', 'stores'];
  const EXPLORE_FILTERS = ['all', 'steam', 'epic', 'gog'];
  const PREVIEW_LIMIT = 5;
  const EXPLORE = 0;
  const GAME_OFFSET = 1;
  const LIB = games.length + GAME_OFFSET;
  const STORE = LIB + 1;
  const layers = [...document.querySelectorAll('.layer')];
  const bgVideo = $('#bg-video');
  const systemHeroVideo = $('#system-hero-video');
  const row = $('#row');
  const systemSounds = system.resources?.sounds || {};
  const soundPlayers = new Map();
  let videoTimer = null;
  let hlsPlayer = null, activeVideo = '';
  let activeSystemVideo = '';
  let lastScrollSound = 0;

  function playSystemSound(name) {
    const source = systemSounds[name];
    if (!source) return;
    let sound = soundPlayers.get(name);
    if (!sound) {
      sound = new Audio(source);
      soundPlayers.set(name, sound);
    }
    sound.pause();
    sound.currentTime = 0;
    sound.play().catch(err => console.error(`No se pudo reproducir el sonido del sistema (${name}): ${err.message}`));
  }
  function playScrollSound() {
    const now = performance.now();
    if (now - lastScrollSound < 90) return;
    lastScrollSound = now;
    playSystemSound('scroll');
  }
  function navigationState() {
    if (tab === 'library') return [tab, lzone, libHeaderIdx, libToolIdx, stab, li, si, storeIdx].join(':');
    if (tab === 'explore') return [tab, exploreZone, exploreHeaderIdx, exploreFilterIdx, exploreIndex].join(':');
    if (tab === 'store') return [tab, storeZone, storeHeaderIdx, storeFilterIdx, storeIndex].join(':');
    if (zone === 'explore') return [tab, zone, sel, exploreZone, exploreHeaderIdx, exploreFilterIdx, exploreIndex].join(':');
    if (zone === 'library') return [tab, zone, lzone, stab, li, si, storeIdx].join(':');
    return [tab, zone, mainTabIdx, sel, btn, previewIndex].join(':');
  }
  function setBackground(background) {
    const next = layers[1 - cur];
    next.style.background = background;
    next.classList.add('on');
    layers[cur].classList.remove('on');
    cur = 1 - cur;
  }
  function stopSystemVideo() {
    activeSystemVideo = '';
    systemHeroVideo.pause();
    systemHeroVideo.removeAttribute('src');
    systemHeroVideo.load();
    document.body.dataset.systemVideo = 'off';
  }
  function applySystemHero(key) {
    const item = system.items[key];
    const colors = item.colors || ['#202a40', '#233b56', '#070a14'];
    const image = system.resources?.images?.[`${key}Hero`];
    const background = image
      ? `url("${image}") center/cover no-repeat, linear-gradient(145deg, ${colors[0]}, ${colors[1]}, ${colors[2]})`
      : `radial-gradient(ellipse 55% 65% at 78% 45%, color-mix(in srgb, ${colors[0]} 78%, transparent), transparent 72%), linear-gradient(145deg, ${colors[1]}, ${colors[2]})`;
    setBackground(background);
    const video = system.resources?.videos?.[`${key}Hero`];
    if (video) {
      if (activeSystemVideo !== video) {
        stopSystemVideo();
        activeSystemVideo = video;
        systemHeroVideo.src = video;
        systemHeroVideo.play().then(() => {
          if (activeSystemVideo === video) document.body.dataset.systemVideo = 'on';
        }).catch(err => console.error(`No se pudo reproducir el video del sistema (${key}): ${err.message}`));
      }
    } else stopSystemVideo();
  }

  function stopTrailer() {
    clearTimeout(videoTimer);
    videoTimer = null;
    activeVideo = '';
    if (hlsPlayer) { hlsPlayer.destroy(); hlsPlayer = null; }
    document.body.dataset.video = 'off';
    bgVideo.pause();
    bgVideo.removeAttribute('src');
    bgVideo.load();
  }
  function playTrailer(url, title) {
    const play = () => {
      if (activeVideo !== url) return;
      bgVideo.play().then(() => {
        if (activeVideo === url) document.body.dataset.video = 'on';
      }).catch(err => {
        console.error(`No se pudo reproducir el video de ${title}: ${err.message}`);
      });
    };
    if (/\.m3u8(?:$|\?)/i.test(url)) {
      if (window.Hls && window.Hls.isSupported()) {
        hlsPlayer = new window.Hls({ maxBufferLength: 30, backBufferLength: 30 });
        hlsPlayer.on(window.Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          console.error(`Falló el stream HLS de ${title}: ${data.type} / ${data.details}`);
          stopTrailer();
        });
        hlsPlayer.on(window.Hls.Events.MANIFEST_PARSED, play);
        hlsPlayer.loadSource(url);
        hlsPlayer.attachMedia(bgVideo);
      } else if (bgVideo.canPlayType('application/vnd.apple.mpegurl')) {
        bgVideo.src = url;
        play();
      } else {
        console.error(`Este sistema no puede reproducir el stream HLS de ${title}.`);
      }
      return;
    }
    bgVideo.src = url;
    play();
  }
  function startTrailer(g) {
    stopSystemVideo();
    stopTrailer();
    if (!g || !g.video) return;
    activeVideo = g.video;
    videoTimer = setTimeout(() => {
      playTrailer(g.video, g.title);
    }, 5000);
  }
  bgVideo.addEventListener('error', () => {
    document.body.dataset.video = 'off';
    console.error(`No se pudo cargar el video de fondo: ${bgVideo.currentSrc}`);
  });

  const coverBg = g => g.cover ? `url("${g.cover}") center/cover, linear-gradient(145deg, ${g.colors[0]}, ${g.colors[1]})` : `linear-gradient(145deg, ${g.colors[0]}, ${g.colors[1]})`;
  const heroBg = g => g.hero
    ? `url("${g.hero}") 70% center/cover no-repeat, linear-gradient(160deg, ${g.colors[2] || '#0b1020'}, #05070b)`
    : `radial-gradient(ellipse 45% 62% at 72% 42%, color-mix(in srgb, ${g.colors[0]} 80%, transparent), transparent 70%),
       radial-gradient(ellipse 36% 46% at 88% 72%, color-mix(in srgb, ${g.colors[1]} 65%, transparent), transparent 70%),
       linear-gradient(160deg, ${g.colors[2] || '#0b1020'}, #05070b)`;
  const makeCover = g => { const c = el('div', 'cover'); c.style.background = coverBg(g); if (!g.cover) c.append(el('span', '', g.title)); return c; };

  // ---------- Inicio ----------
  function makeSystemTile(key, index) {
    const item = system.items[key];
    const tile = el('div', `tile system-tile ${key}`);
    const icon = el('img', 'system-icon');
    icon.src = system.resources?.icons?.[key] || '';
    icon.alt = '';
    tile.append(icon, el('div', 'name', item.title));
    tile.addEventListener('click', () => {
      if (tab !== 'games') return;
      if (sel === index) activate();
      else { sel = index; zone = 'row'; render(); }
    });
    row.append(tile);
    return tile;
  }
  const exploreTile = makeSystemTile('explore', EXPLORE);
  const tiles = [exploreTile, ...games.map((g, i) => {
    const t = el('div', 'tile');
    t.append(makeCover(g), el('div', 'name', g.title));
    t.addEventListener('click', () => {
      const index = i + GAME_OFFSET;
      if (tab !== 'games') return;
      if (index === sel) activate();
      else { sel = index; zone = 'row'; render(); }
    });
    row.append(t);
    return t;
  })];
  const lib = makeSystemTile('library', LIB);
  tiles.push(lib);
  const storeTile = makeSystemTile('store', STORE);
  tiles.push(storeTile);

  function render(force = false) {
    document.body.dataset.zone = zone;
    document.body.dataset.selection = sel === EXPLORE ? 'explore' : sel === LIB ? 'library' : sel === STORE ? 'store' : 'game';
    $('#play').classList.toggle('focus', btn === 0);
    $('#more').classList.toggle('focus', btn === 1);
    document.querySelectorAll('.tab').forEach((button, i) => {
      button.classList.toggle('controller-focus', zone === 'header' && i === mainTabIdx);
    });
    topActions.forEach((button, i) => {
      const focused = zone === 'header' && mainTabIdx === i + 2;
      button.classList.toggle('controller-focus', focused);
      button.classList.toggle('media-focus', tab === 'media' && focused);
    });
    tiles.forEach((t, i) => t.classList.toggle('sel', i === sel));
    row.style.transform = `translateX(${-sel * 82}px)`; // 76px de tile + 6px de gap
    renderExplorePreview();
    if (sel === EXPLORE) renderExplore();
    if (tab === 'store' || sel === STORE) renderStore();
    if (sel === LIB) {
      if (sel !== lastSel) {
        lzone = 'tabs';
        stab = 'installed';
        li = 0;
        sortMode = 0;
        libToolIdx = 0;
        libHeaderIdx = 0;
        buildGrid();
      }
      renderLib();
    }

    if (sel === lastSel && !force) return;
    lastSel = sel;
    const isExplore = sel === EXPLORE, isLib = sel === LIB, isStore = sel === STORE;
    const systemKey = isExplore ? 'explore' : isLib ? 'library' : 'store';
    const g = isExplore || isLib || isStore ? system.items[systemKey] : games[sel - GAME_OFFSET];
    if (isExplore || isLib || isStore) {
      stopTrailer();
      applySystemHero(systemKey);
      if (isExplore && !exploreLoaded) loadExplore();
      if (isStore && !storeLoaded) loadStoreDeals();
    } else {
      startTrailer(g);
      setBackground(heroBg(g));
    }

    const main = $('#gl-main');
    main.replaceChildren();
    main.classList.remove('long');
    $('#play').textContent = isExplore || isLib || isStore ? 'Abrir' : 'Play';
    const info = $('.info'); info.classList.remove('swap'); void info.offsetWidth; info.classList.add('swap');
    const actions = $('.actions'); actions.classList.remove('swap'); void actions.offsetWidth; actions.classList.add('swap');
  }

  function move(dx, dy) {
    if (tab === 'media') {
      if (zone === 'media-content') {
        if (dy < 0) {
          zone = 'header';
          mainTabIdx = Math.min(2, 1 + topActions.length);
        } else if (dx) {
          zone = 'header';
          mainTabIdx = clamp(mainTabIdx + dx, 2, 1 + topActions.length);
        }
      } else if (zone === 'header') {
        if (dx) mainTabIdx = clamp(mainTabIdx + dx, 0, 1 + topActions.length);
        if (dy > 0) {
          if (mainTabIdx === 0) {
            setTab('games');
            zone = 'row';
          } else if (mainTabIdx === 1) zone = 'media-content';
          else zone = 'media-content';
        }
      }
      render();
      return;
    }
    if (zone === 'header') {
      if (dx) mainTabIdx = clamp(mainTabIdx + dx, 0, 1 + topActions.length);
      if (dy > 0) {
        if (mainTabIdx === 0) {
          setTab('games');
          zone = 'row';
        } else if (mainTabIdx === 1) {
          setTab('media');
          zone = 'media-content';
        } else zone = tab === 'games' ? 'row' : 'media-content';
      }
      render();
      return;
    }
    if (tab !== 'games') return;
    if (zone === 'preview') {
      const lastPreviewIndex = Math.min(exploreItems.length, PREVIEW_LIMIT);
      if (dy < 0) zone = 'row';
      else if (dy > 0) { zone = 'play'; btn = 0; }
      else if (dx) previewIndex = clamp(previewIndex + dx, 0, lastPreviewIndex);
    } else if (zone === 'row') {
      if (dy < 0) {
        zone = 'header';
        mainTabIdx = 0;
      } else if (dy > 0 && sel === EXPLORE) {
        zone = 'explore';
        exploreZone = 'filters';
        exploreFilterIdx = Math.max(0, EXPLORE_FILTERS.indexOf(exploreFilter));
      } else if (dy > 0 && sel === LIB) return enterInlineLibrary();
      else if (dy > 0 && sel === STORE) return openStoreSection();
      else if (dy > 0) zone = 'play';
      else sel = clamp(sel + dx, 0, STORE);
    } else { if (dy < 0) zone = 'row'; btn = clamp(btn + dx, 0, 1); }
    render();
  }

  async function launchGame(g) {
    if (!isInstalled(g)) return toast('Este juego no está instalado. Instálalo desde su tienda.');
    toast(`Iniciando ${g.title}…`);
    const r = await window.api.launch(g.id);
    if (!r.ok) toast(r.error);
  }
  function activate() {
    if (zone === 'header') {
      if (mainTabIdx < 2) {
        setTab(mainTabIdx === 0 ? 'games' : 'media');
        if (tab === 'media') zone = 'media-content';
      } else activateTopAction(mainTabIdx - 2);
      render();
      return;
    }
    if (tab !== 'games') return;
    if (zone === 'preview') {
      const item = exploreItems[previewIndex];
      if (previewIndex >= Math.min(exploreItems.length, PREVIEW_LIMIT)) openExplore();
      else if (item) openExploreItem(item);
      return;
    }
    if (zone === 'explore') return activateExplore();
    if (zone === 'store') return activateStorePage();
    if (zone === 'library') return activateLib();
    if (sel === EXPLORE) {
      zone = 'explore';
      exploreZone = 'filters';
      exploreFilterIdx = Math.max(0, EXPLORE_FILTERS.indexOf(exploreFilter));
      render();
      return;
    }
    if (sel === LIB) return enterInlineLibrary();
    if (sel === STORE) return openStoreSection();
    if (zone === 'row' || btn === 0) launchGame(games[sel - GAME_OFFSET]); else toast('Más opciones: próximamente');
  }

  function setTab(name) {
    tab = name; document.body.dataset.tab = name;
    if (name === 'games' || name === 'media') mainTabIdx = name === 'games' ? 0 : 1;
    if (name === 'games') zone = 'row';
    if (name === 'media') zone = 'header';
    if (name === 'store') zone = 'store';
    document.body.dataset.zone = zone;
    if (name === 'games') render(true);
    else if (name === 'library' || name === 'explore' || name === 'store') {
      stopTrailer();
      applySystemHero(name);
    } else { stopTrailer(); stopSystemVideo(); render(); }
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    if (name === 'explore' && !exploreLoaded) loadExplore();
    if (name === 'store') renderStore();
  }
  function activateTopAction(index) {
    const button = topActions[index];
    if (!button) return;
    if (tab === 'library' || (tab === 'games' && (zone === 'library' || sel === LIB))) {
      if (tab === 'games') zone = 'library';
      lzone = 'header';
      libHeaderIdx = index + 1;
      if (tab === 'games') render();
      else renderLib();
    } else if (tab === 'explore' || (tab === 'games' && (zone === 'explore' || sel === EXPLORE))) {
      if (tab === 'games') zone = 'explore';
      exploreZone = 'header';
      exploreHeaderIdx = index + 1;
      if (tab === 'games') render();
      else renderExplore();
    } else if (tab === 'store' || (tab === 'games' && (zone === 'store' || sel === STORE))) {
      if (tab === 'games' && zone !== 'store') openStoreSection();
      storeZone = 'header';
      storeHeaderIdx = index + 1;
      renderStore();
    } else {
      zone = 'header';
      mainTabIdx = index + 2;
      render();
    }
    const label = button.getAttribute('aria-label');
    if (label) toast(`${label}: próximamente`);
  }
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  topActions.forEach((button, index) => button.addEventListener('click', () => activateTopAction(index)));
  $('#play').addEventListener('click', () => { zone = 'play'; btn = 0; render(); activate(); });
  $('#more').addEventListener('click', () => toast('Más opciones: próximamente'));

  // ---------- Biblioteca ----------
  const grid = $('#lgrid'), sideTiles = [...document.querySelectorAll('.stile')];
  const storeBox = $('#stores');
  const exploreGrid = $('#explore-grid');
  const explorePreviewRail = $('#explore-preview-rail');
  const exploreStatus = $('#explore-status');
  const exploreErrors = $('#explore-errors');
  const exploreFilterButtons = [...document.querySelectorAll('.explore-filter')];

  function renderExplorePreview() {
    const preview = $('#explore-preview');
    preview.hidden = true;
    explorePreviewRail.replaceChildren();
  }

  STORES.forEach((s, i) => {
    const c = el('button', 'scard ' + s.id); c.dataset.g = s.glyph;
    c.append(el('span', 'sname', s.name), el('span', 'sdesc', s.desc));
    c.addEventListener('click', () => { if (storeIdx === i && lzone === 'stores') activateLib(); else { storeIdx = i; lzone = 'stores'; renderLib(); } });
    storeBox.append(c);
  });
  storeBox.append(el('p', 'shint', 'Se abre dentro del launcher. Esc vuelve aquí; Alt + ← regresa a la página anterior.'));
  const storeCards = [...storeBox.querySelectorAll('.scard')];

  function visibleExploreItems() {
    return exploreItems.filter(item => exploreFilter === 'all' || item.store === exploreFilter);
  }
  function renderExplore() {
    const inline = tab === 'games' && sel === EXPLORE;
    const visible = visibleExploreItems();
    exploreIndex = clamp(exploreIndex, 0, Math.max(0, visible.length - 1));
    document.body.dataset.ezone = exploreZone;
    exploreFilterButtons.forEach((button, i) => {
      button.classList.toggle('active', button.dataset.store === exploreFilter);
      button.classList.toggle('focused', exploreZone === 'filters' && i === exploreFilterIdx);
    });
    $('#explore-back').classList.toggle('controller-focus', !inline && exploreZone === 'header' && exploreHeaderIdx === 0);
    $('#explore-refresh').classList.toggle('controller-focus',
      exploreZone === 'filters' && exploreFilterIdx === EXPLORE_FILTERS.length);
    topActions.forEach((button, i) => {
      const focused = inline
        ? (zone === 'header' && mainTabIdx === i + 2)
          || (zone === 'explore' && exploreZone === 'header' && exploreHeaderIdx === i + 1)
        : exploreZone === 'header' && exploreHeaderIdx === i + 1;
      button.classList.toggle('controller-focus', focused);
    });
    exploreGrid.replaceChildren();
    visible.forEach((item, i) => {
      const card = el('button', 'explore-card' + (exploreZone === 'feed' && i === exploreIndex ? ' focused' : ''));
      const image = el('img', 'explore-image');
      if (item.image) image.src = item.image;
      image.alt = '';
      image.loading = 'lazy';
      image.addEventListener('error', () => image.classList.add('unavailable'), { once: true });
      const body = el('span', 'explore-card-info');
      body.append(el('span', 'explore-card-store', STORE_NAME[item.store] || item.store));
      body.append(el('span', 'explore-card-title', item.title));
      body.append(el('span', 'explore-card-label', item.label || 'Novedad'));
      if (item.date) {
        const date = new Date(item.date);
        if (!Number.isNaN(date.getTime())) body.append(el('span', 'explore-card-date',
          new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)));
      }
      card.append(image, body);
      card.addEventListener('click', () => openExploreItem(item));
      exploreGrid.append(card);
    });
    if (exploreZone === 'feed' && exploreGrid.children[exploreIndex])
      exploreGrid.children[exploreIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    exploreStatus.textContent = visible.length
      ? `${visible.length} novedades disponibles`
      : exploreLoaded ? 'No hay novedades disponibles para este filtro.' : 'Cargando novedades…';
    exploreErrors.replaceChildren();
    const errors = exploreLoadErrors || {};
    Object.entries(errors).forEach(([store, message]) => {
      exploreErrors.append(el('p', 'explore-error', `${STORE_NAME[store] || store}: ${message}`));
    });
  }
  let exploreLoadErrors = {};
  async function loadExplore() {
    exploreLoaded = false;
    exploreStatus.textContent = 'Cargando novedades de Steam, Epic Games y GOG…';
    $('#explore-refresh').disabled = true;
    try {
      const result = await window.api.getExplore();
      exploreItems = Array.isArray(result.items) ? result.items : [];
      exploreLoadErrors = result.errors || {};
      exploreLoaded = true;
    } catch (err) {
      exploreItems = [];
      exploreLoadErrors = { all: `No se pudo cargar el explorador: ${err.message}` };
      exploreLoaded = true;
      console.error(`No se pudieron cargar las novedades: ${err.message}`);
    } finally {
      $('#explore-refresh').disabled = false;
      renderExplore();
      renderExplorePreview();
    }
  }
  function openExplore() {
    exploreZone = 'filters';
    exploreHeaderIdx = 0;
    exploreFilterIdx = Math.max(0, EXPLORE_FILTERS.indexOf(exploreFilter));
    exploreIndex = 0;
    setTab('explore');
    renderExplore();
  }
  function closeExplore() { playSystemSound('back'); setTab('games'); }
  async function openExploreItem(item) {
    try {
      const result = await window.api.openExploreItem({ store: item.store, url: item.url });
      if (!result.ok) toast(result.error || 'No se pudo abrir el enlace.');
    } catch (err) {
      toast(`No se pudo abrir el enlace: ${err.message}`);
      console.error(`No se pudo abrir el enlace de la tienda: ${err.message}`);
    }
  }
  const storeFilterButtons = [...document.querySelectorAll('.store-filter')];
  const STORE_FILTERS = ['all', 'offer', 'free'];
  function visibleStoreDeals() {
    return storeDeals.filter(item => storeFilter === 'all' || item.kind === storeFilter);
  }
  function formatStorePrice(value, currency) {
    const code = /^[A-Z]{3}$/.test(currency || '') ? currency : 'USD';
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: code }).format(value);
  }
  function renderStore() {
    const inline = tab === 'games' && sel === STORE;
    const visible = visibleStoreDeals();
    storeIndex = clamp(storeIndex, 0, Math.max(0, visible.length - 1));
    document.body.dataset.szone = storeZone;
    storeFilterButtons.forEach((button, i) => {
      button.classList.toggle('active', button.dataset.kind === storeFilter);
      button.classList.toggle('focused', storeZone === 'filters' && i === storeFilterIdx);
    });
    $('#store-back').classList.toggle('controller-focus',
      !inline && storeZone === 'header' && storeHeaderIdx === 0);
    $('#store-refresh').classList.toggle('controller-focus',
      storeZone === 'filters' && storeFilterIdx === STORE_FILTERS.length);
    topActions.forEach((button, i) => button.classList.toggle('controller-focus', inline
      ? (zone === 'header' && mainTabIdx === i + 2)
        || (zone === 'store' && storeZone === 'header' && storeHeaderIdx === i + 1)
      : storeZone === 'header' && storeHeaderIdx === i + 1));
    const grid = $('#store-grid');
    grid.replaceChildren();
    visible.forEach((item, i) => {
      const card = el('button', `store-deal-card ${item.kind}` +
        (storeZone === 'feed' && i === storeIndex ? ' focused' : ''));
      const image = el('img', 'store-deal-image');
      if (item.image) image.src = item.image;
      image.alt = '';
      image.loading = 'lazy';
      image.addEventListener('error', () => image.classList.add('unavailable'), { once: true });
      const body = el('span', 'store-deal-info');
      body.append(el('span', 'store-deal-store', STORE_NAME[item.store] || item.store));
      body.append(el('span', 'store-deal-title', item.title));
      body.append(el('span', 'store-deal-label', item.label));
      if (item.kind === 'offer' && Number.isFinite(item.finalPrice)) {
        const prices = el('span', 'store-deal-prices');
        prices.append(el('span', 'store-deal-final', formatStorePrice(item.finalPrice, item.currency)));
        if (Number.isFinite(item.originalPrice))
          prices.append(el('span', 'store-deal-original', formatStorePrice(item.originalPrice, item.currency)));
        body.append(prices);
      }
      if (item.date) {
        const date = new Date(item.date);
        if (!Number.isNaN(date.getTime())) body.append(el('span', 'store-deal-date',
          `${item.dateLabel ? `${item.dateLabel} ` : ''}${new Intl.DateTimeFormat('es-ES', {
            day: 'numeric', month: 'short', year: 'numeric'
          }).format(date)}`));
      }
      card.append(image, body);
      card.addEventListener('click', () => openExploreItem(item));
      grid.append(card);
    });
    if (storeZone === 'feed' && grid.children[storeIndex])
      grid.children[storeIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    $('#store-status').textContent = visible.length
      ? `${visible.length} promociones disponibles`
      : storeLoaded ? 'No hay promociones disponibles para este filtro.' : 'Cargando ofertas y juegos gratis…';
    const errors = $('#store-errors');
    errors.replaceChildren();
    Object.entries(storeLoadErrors).forEach(([store, message]) => {
      errors.append(el('p', 'store-error', `${STORE_NAME[store] || store}: ${message}`));
    });
  }
  async function loadStoreDeals() {
    storeLoaded = false;
    $('#store-status').textContent = 'Cargando ofertas y juegos gratis…';
    $('#store-refresh').disabled = true;
    try {
      const result = await window.api.getStoreDeals();
      storeDeals = Array.isArray(result.items) ? result.items : [];
      storeLoadErrors = result.errors || {};
      storeLoaded = true;
    } catch (err) {
      storeDeals = [];
      storeLoadErrors = { all: `No se pudieron cargar las promociones: ${err.message}` };
      storeLoaded = true;
      console.error(`No se pudieron cargar las promociones: ${err.message}`);
    } finally {
      $('#store-refresh').disabled = false;
      renderStore();
    }
  }
  function openStoreSection() {
    storeZone = 'filters';
    storeHeaderIdx = 0;
    storeFilterIdx = Math.max(0, STORE_FILTERS.indexOf(storeFilter));
    storeIndex = 0;
    if (tab === 'games') {
      zone = 'store';
      render();
    } else {
      setTab('store');
      renderStore();
    }
    if (!storeLoaded) loadStoreDeals();
  }
  function closeStoreSection() {
    playSystemSound('back');
    if (tab === 'games' && sel === STORE) {
      zone = 'row';
      render();
    } else setTab('games');
  }
  function moveStore(dx, dy) {
    const inline = tab === 'games' && sel === STORE;
    if (storeZone === 'header') {
      if (inline) {
        if (dy > 0) storeZone = 'filters';
        else if (dy < 0) { zone = 'row'; render(); return; }
      } else {
        if (dx) storeHeaderIdx = clamp(storeHeaderIdx + dx, 0, topActions.length);
        if (dy > 0) storeZone = 'filters';
      }
    } else if (storeZone === 'filters') {
      if (dx < 0 && storeFilterIdx === 0) storeFilterIdx = STORE_FILTERS.length;
      else if (dx > 0 && storeFilterIdx === STORE_FILTERS.length) storeFilterIdx = 0;
      else if (dx) storeFilterIdx = clamp(storeFilterIdx + dx, 0, STORE_FILTERS.length);
      if (dy < 0) storeZone = 'header';
      if (dy > 0 && visibleStoreDeals().length) { storeZone = 'feed'; storeIndex = 0; }
      const nextFilter = STORE_FILTERS[storeFilterIdx];
      if (nextFilter && storeFilter !== nextFilter) { storeFilter = nextFilter; storeIndex = 0; }
    } else {
      const count = visibleStoreDeals().length;
      const rowStart = Math.floor(storeIndex / 3) * 3;
      if (dx < 0) storeIndex = Math.max(rowStart, storeIndex - 1);
      else if (dx > 0) storeIndex = Math.min(Math.min(rowStart + 2, count - 1), storeIndex + 1);
      if (dy < 0) {
        if (storeIndex < 3) storeZone = 'filters';
        else storeIndex = Math.max(0, storeIndex - 3);
      } else if (dy > 0) storeIndex = Math.min(count - 1, storeIndex + 3);
    }
    renderStore();
  }
  async function activateStorePage() {
    if (storeZone === 'header') {
      if (storeHeaderIdx === 0) closeStoreSection();
      else activateTopAction(storeHeaderIdx - 1);
    } else if (storeZone === 'filters') {
      if (storeFilterIdx === STORE_FILTERS.length) {
        if (!$('#store-refresh').disabled) loadStoreDeals();
      } else storeZone = 'feed';
    } else {
      const item = visibleStoreDeals()[storeIndex];
      if (item) await openExploreItem(item);
    }
    renderStore();
  }
  storeFilterButtons.forEach(button => button.addEventListener('click', () => {
    storeFilter = button.dataset.kind;
    storeFilterIdx = STORE_FILTERS.indexOf(storeFilter);
    storeIndex = 0;
    storeZone = 'filters';
    renderStore();
  }));
  $('#store-refresh').addEventListener('click', loadStoreDeals);
  $('#store-back').addEventListener('click', closeStoreSection);
  function moveExplore(dx, dy) {
    const inline = tab === 'games' && sel === EXPLORE;
    if (exploreZone === 'header') {
      if (inline) {
        if (dy > 0) exploreZone = 'filters';
        else if (dy < 0) { zone = 'row'; render(); return; }
      } else {
        if (dx) exploreHeaderIdx = clamp(exploreHeaderIdx + dx, 0, topActions.length);
        if (dy > 0) exploreZone = 'filters';
      }
    } else if (exploreZone === 'filters') {
      if (dx < 0 && exploreFilterIdx === 0) exploreFilterIdx = EXPLORE_FILTERS.length;
      else if (dx > 0 && exploreFilterIdx === EXPLORE_FILTERS.length) exploreFilterIdx = 0;
      else if (dx) exploreFilterIdx = clamp(exploreFilterIdx + dx, 0, EXPLORE_FILTERS.length);
      if (dy < 0) exploreZone = 'header';
      if (dy > 0 && visibleExploreItems().length) { exploreZone = 'feed'; exploreIndex = 0; }
      const nextFilter = EXPLORE_FILTERS[exploreFilterIdx];
      if (nextFilter && exploreFilter !== nextFilter) { exploreFilter = nextFilter; exploreIndex = 0; }
    } else {
      const count = visibleExploreItems().length;
      const rowStart = Math.floor(exploreIndex / 3) * 3;
      if (dx < 0) exploreIndex = Math.max(rowStart, exploreIndex - 1);
      else if (dx > 0) exploreIndex = Math.min(Math.min(rowStart + 2, count - 1), exploreIndex + 1);
      if (dy < 0) {
        if (exploreIndex < 3) exploreZone = 'filters';
        else exploreIndex = Math.max(0, exploreIndex - 3);
      } else if (dy > 0) exploreIndex = Math.min(count - 1, exploreIndex + 3);
    }
    if (tab === 'games') render();
    else renderExplore();
  }
  async function activateExplore() {
    if (exploreZone === 'header') {
      if (exploreHeaderIdx === 0) closeExplore();
      else activateTopAction(exploreHeaderIdx - 1);
    } else if (exploreZone === 'filters') {
      if (exploreFilterIdx === EXPLORE_FILTERS.length) {
        if (!$('#explore-refresh').disabled) loadExplore();
      } else exploreZone = 'feed';
    }
    else {
      const item = visibleExploreItems()[exploreIndex];
      if (item) await openExploreItem(item);
    }
    renderExplore();
  }
  exploreFilterButtons.forEach(button => button.addEventListener('click', () => {
    exploreFilter = button.dataset.store;
    exploreFilterIdx = EXPLORE_FILTERS.indexOf(exploreFilter);
    exploreIndex = 0;
    exploreZone = 'filters';
    exploreFilterIdx = Math.max(0, EXPLORE_FILTERS.indexOf(exploreFilter));
    if (tab === 'games' && sel === EXPLORE) {
      zone = 'explore';
      render();
    } else renderExplore();
  }));
  $('#explore-refresh').addEventListener('click', loadExplore);
  $('#explore-back').addEventListener('click', closeExplore);

  function buildList() {
    list = (stab === 'owned' ? all : games).slice();
    const by = SORTS[sortMode];
    list.sort((a, b) => by === 'Nombre (Z-A)' ? b.title.localeCompare(a.title, 'es')
      : by === 'Tienda' ? (STORE_NAME[a.store] || '').localeCompare(STORE_NAME[b.store] || '') || a.title.localeCompare(b.title, 'es')
      : a.title.localeCompare(b.title, 'es'));
  }
  function buildGrid() {
    buildList();
    grid.replaceChildren();
    list.forEach((g, i) => {
      const t = el('div', 'gtile' + (isInstalled(g) ? '' : ' off'));
      t.append(makeCover(g));
      if (g.store) t.append(el('span', 'gbadge', STORE_NAME[g.store] || g.store));
      if (!isInstalled(g)) { const d = el('span', 'gdl'); d.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12m-5-5 5 5 5-5M5 20h14"/></svg>'; t.append(d); }
      t.append(el('div', 'glabel', g.title));
      t.addEventListener('click', () => { if (li === i && lzone === 'grid') activateLib(); else { li = i; lzone = 'grid'; renderLib(); } });
      grid.append(t);
    });
    if (!list.length) grid.append(el('p', 'empty', 'No se encontraron juegos instalados. Instala uno desde Steam, Epic o GOG y busca de nuevo con la tecla R.'));
    $('#count').textContent = (stab === 'installed' ? 'Juegos instalados: ' : 'Juegos en tu colección: ') + list.length;
    $('#sortlabel').textContent = 'Ordenar por: ' + SORTS[sortMode];
    li = clamp(li, 0, Math.max(0, list.length - 1));
  }

  function renderLib() {
    const inline = tab === 'games' && zone === 'library';
    const active = tab === 'library' || inline;
    document.body.dataset.lzone = active ? lzone : 'inactive';
    document.body.dataset.stab = stab;
    $('#back').classList.toggle('controller-focus', active && lzone === 'header' && libHeaderIdx === 0);
    topActions.forEach((button, i) => {
      const focused = inline
        ? lzone === 'header' && libHeaderIdx === i + 1
        : tab === 'games'
          ? zone === 'header' && mainTabIdx === i + 2
          : lzone === 'header' && libHeaderIdx === i + 1;
      button.classList.toggle('controller-focus', focused);
    });
    $('#sortbtn').classList.toggle('controller-focus', active && lzone === 'toolbar' && libToolIdx === 0);
    $('#refbtn').classList.toggle('controller-focus', active && lzone === 'toolbar' && libToolIdx === 1);
    document.querySelectorAll('.stab').forEach(b => b.classList.toggle('active', b.dataset.s === stab));
    document.querySelectorAll('.stab').forEach(b => b.classList.toggle('controller-focus',
      active && lzone === 'tabs' && b.dataset.s === stab));
    [...grid.querySelectorAll('.gtile')].forEach((t, i) => t.classList.toggle('sel', i === li));
    sideTiles.forEach((t, i) => t.classList.toggle('sel', i === si));
    storeCards.forEach((t, i) => t.classList.toggle('sel', i === storeIdx));
    grid.style.transform = `translateY(${-Math.max(0, Math.floor(li / COLS) - 1) * 216}px)`;
  }
  function setStab(s) {
    stab = s; li = 0;
    if (s !== 'stores') buildGrid();
    if (tab === 'games' && zone === 'library') render();
    else renderLib();
  }
  function openLibrary() {
    setTab('library'); lzone = 'tabs'; stab = 'installed'; li = 0; sortMode = 0; libToolIdx = 0; libHeaderIdx = 0;
    buildGrid(); renderLib();
  }
  function enterInlineLibrary() {
    zone = 'library';
    render();
  }
  function closeLibrary() { playSystemSound('back'); setTab('games'); }
  function rescan() {
    toast('Buscando juegos…');
    sessionStorage.setItem('openLib', '1');
    sessionStorage.setItem('openLibInline', String(tab === 'games' && zone === 'library'));
    window.api.rescan().then(() => location.reload());
  }
  function cycleSort() {
    if ((tab !== 'library' && !(tab === 'games' && zone === 'library')) || stab === 'stores') return;
    sortMode = (sortMode + 1) % SORTS.length; li = 0; buildGrid(); renderLib();
    toast('Ordenar por: ' + SORTS[sortMode]);
  }

  function moveLib(dx, dy) {
    const inline = tab === 'games' && zone === 'library';
    const n = list.length;
    if (lzone === 'header') {
      if (dx) libHeaderIdx = clamp(libHeaderIdx + dx, 0, topActions.length);
      if (dy > 0) lzone = 'tabs';
    } else if (lzone === 'tabs') {
      if (dx) setStab(STABS[clamp(STABS.indexOf(stab) + dx, 0, STABS.length - 1)]);
      if (dy < 0) {
        if (inline) zone = 'row';
        else lzone = 'header';
      }
      if (dy > 0) { if (stab === 'stores') lzone = 'stores'; else lzone = 'toolbar'; }
    } else if (lzone === 'toolbar') {
      if (dx) libToolIdx = clamp(libToolIdx + dx, 0, 1);
      if (dy < 0) lzone = 'tabs';
      else if (dy > 0) lzone = n ? 'grid' : 'side';
    } else if (lzone === 'grid') {
      const col = li % COLS, r = Math.floor(li / COLS);
      if (dx < 0 && col > 0) li--;
      else if (dx > 0) {
        if (col < COLS - 1 && li + 1 < n) li++;
        else { lzone = 'side'; si = Math.min(r, 1); }
      }
      if (dy < 0) { if (r > 0) li -= COLS; else lzone = 'toolbar'; }
      else if (dy > 0) { if (li + COLS < n) li += COLS; else if (Math.floor((n - 1) / COLS) > r) li = n - 1; }
    } else if (lzone === 'side') {
      if (dx < 0) {
        if (n) { lzone = 'grid'; li = Math.min(si * COLS + COLS - 1, n - 1); }
        else lzone = 'toolbar';
      }
      if (dy < 0) { if (si > 0) si--; else lzone = 'toolbar'; }
      else if (dy > 0) si = Math.min(si + 1, 1);
    } else if (lzone === 'stores') {
      if (dx) storeIdx = clamp(storeIdx + dx, 0, STORES.length - 1);
      if (dy < 0) lzone = 'tabs';
    }
    if (inline) render();
    else renderLib();
  }
  async function activateLib() {
    if (lzone === 'header') {
      if (libHeaderIdx === 0) closeLibrary();
      else activateTopAction(libHeaderIdx - 1);
    }
    else if (lzone === 'toolbar') {
      if (libToolIdx === 0) cycleSort();
      else rescan();
    } else if (lzone === 'grid') launchGame(list[li]);
    else if (lzone === 'side') toast(si === 0 ? 'Capturas: próximamente' : 'Mandos: próximamente');
    else if (lzone === 'stores') {
      const s = STORES[storeIdx]; toast(`Abriendo ${s.name}…`);
      const r = await window.api.openStore(s.id); if (!r.ok) toast('No se pudo abrir la tienda.');
    }
  }
  document.querySelectorAll('.stab').forEach(b => b.addEventListener('click', () => { lzone = 'tabs'; setStab(b.dataset.s); }));
  sideTiles.forEach((t, i) => t.addEventListener('click', () => { if (si === i && lzone === 'side') activateLib(); else { si = i; lzone = 'side'; renderLib(); } }));
  $('#sortbtn').addEventListener('click', cycleSort);
  $('#refbtn').addEventListener('click', rescan);
  $('#back').addEventListener('click', closeLibrary);

  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---------- Entradas ----------
  const nav = (dx, dy) => {
    const before = navigationState();
    if (tab === 'library') moveLib(dx, dy);
    else if (tab === 'explore' || (tab === 'games' && zone === 'explore')) moveExplore(dx, dy);
    else if (tab === 'store' || (tab === 'games' && zone === 'store')) moveStore(dx, dy);
    else if (tab === 'games' && zone === 'library') moveLib(dx, dy);
    else move(dx, dy);
    if (navigationState() !== before) playScrollSound();
  };
  const isBackFocused = () => (tab === 'library' && lzone === 'header' && libHeaderIdx === 0)
    || (tab === 'explore' && exploreZone === 'header' && exploreHeaderIdx === 0)
    || ((tab === 'store' || (tab === 'games' && zone === 'store'))
      && storeZone === 'header' && storeHeaderIdx === 0);
  const ok = () => {
    if (!isBackFocused()) playSystemSound('select');
    return tab === 'library' || (tab === 'games' && zone === 'library')
      ? activateLib()
      : tab === 'explore' ? activateExplore() : tab === 'store' ? activateStorePage() : activate();
  };
  const goBack = () => {
    if (tab === 'library') closeLibrary();
    else if (tab === 'explore') closeExplore();
    else if (tab === 'store') closeStoreSection();
    else if (tab === 'games' && zone !== 'row') {
      playSystemSound('back');
      zone = 'row';
      render();
    } else if (tab === 'media' && zone !== 'header') {
      playSystemSound('back');
      zone = 'header';
      render();
    }
  };
  addEventListener('click', event => {
    if (!event.detail || !(event.target instanceof Element)) return;
    const target = event.target.closest('button:not(:disabled), .tile, .gtile, .scard');
    if (!target || target.id === 'back' || target.id === 'explore-back' || target.id === 'store-back') return;
    playSystemSound('select');
  });
  addEventListener('keydown', e => {
    const k = e.key;
    if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Enter', ' '].includes(k)) e.preventDefault();
    if (k === 'ArrowRight') nav(1, 0);
    else if (k === 'ArrowLeft') nav(-1, 0);
    else if (k === 'ArrowDown') nav(0, 1);
    else if (k === 'ArrowUp') nav(0, -1);
    else if (k === 'Enter' || k === ' ') ok();
    else if (k === 'Escape' || k === 'Backspace') goBack();
    else if ((k === 's' || k === 'S') && (tab === 'library' || (tab === 'games' && zone === 'library'))) cycleSort();
    else if ((k === 'r' || k === 'R') && (tab === 'library' || (tab === 'games' && zone === 'library'))) rescan();
    else if (k === 'Tab') { e.preventDefault(); if (tab !== 'library' && tab !== 'explore' && tab !== 'store') setTab(tab === 'games' ? 'media' : 'games'); }
  });

  // Control (Gamepad API): D-pad / stick, A = aceptar, B = volver, X = actualizar, Y = ordenar.
  const held = {};
  function pulse(key, down, fn, repeat = true) {
    if (down) {
      const n = performance.now();
      if (!held[key] || (repeat && n - held[key] > 190)) { held[key] = n; fn(); }
    } else held[key] = 0;
  }
  (function poll() {
    const p = [...(navigator.getGamepads() || [])].find(gamepad => gamepad && gamepad.connected);
    if (p) {
      const b = i => !!p.buttons[i]?.pressed;
      const axis = i => Number.isFinite(p.axes?.[i]) ? p.axes[i] : 0;
      pulse('l', b(14) || axis(0) < -.6, () => nav(-1, 0));
      pulse('r', b(15) || axis(0) > .6, () => nav(1, 0));
      pulse('u', b(12) || axis(1) < -.6, () => nav(0, -1));
      pulse('d', b(13) || axis(1) > .6, () => nav(0, 1));
      pulse('a', b(0), ok, false);
      pulse('b', b(1), goBack, false);
      pulse('y', b(3), () => {
        if (tab === 'library' || (tab === 'games' && zone === 'library')) cycleSort();
      }, false);
      pulse('x', b(2), () => {
        if (tab === 'library' || (tab === 'games' && zone === 'library')) rescan();
        else if (tab === 'explore' && !$('#explore-refresh').disabled) loadExplore();
        else if ((tab === 'store' || (tab === 'games' && zone === 'store'))
          && !$('#store-refresh').disabled) loadStoreDeals();
      }, false);
      pulse('l1', b(4), () => {
        if (tab === 'library' || (tab === 'games' && zone === 'library')) {
          lzone = 'tabs';
          setStab(STABS[clamp(STABS.indexOf(stab) - 1, 0, 2)]);
        }
        else if (tab === 'explore') closeExplore();
        else if (tab === 'store') closeStoreSection();
        else { setTab('games'); zone = 'row'; render(); }
      }, false);
      pulse('r1', b(5), () => {
        if (tab === 'library' || (tab === 'games' && zone === 'library')) {
          lzone = 'tabs';
          setStab(STABS[clamp(STABS.indexOf(stab) + 1, 0, 2)]);
        }
        else if (tab === 'explore') { closeExplore(); setTab('media'); }
        else if (tab === 'store') { closeStoreSection(); setTab('media'); }
        else { setTab('media'); render(); }
      }, false);
    }
    else Object.keys(held).forEach(key => { held[key] = 0; });
    requestAnimationFrame(poll);
  })();
  addEventListener('gamepadconnected', event => {
    toast(`Mando conectado${event.gamepad.id ? `: ${event.gamepad.id}` : ''}`);
  });
  addEventListener('gamepaddisconnected', () => {
    Object.keys(held).forEach(key => { held[key] = 0; });
  });

  // Reloj en formato de 12 horas.
  const tick = () => {
    $('#clock').textContent = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true
    }).format(new Date()).toLowerCase();
  };
  tick(); setInterval(tick, 10000);

  const reopenLibrary = sessionStorage.getItem('openLib') === '1';
  const reopenInline = sessionStorage.getItem('openLibInline') === 'true';
  sessionStorage.removeItem('openLib');
  sessionStorage.removeItem('openLibInline');
  if (reopenInline) {
    sel = LIB;
    zone = 'library';
  }
  render();
  if (reopenLibrary) {
    if (reopenInline) enterInlineLibrary();
    else openLibrary();
    toast(`Biblioteca actualizada: ${games.length} instalados.`);
  } else if (all.some(g => g.demo)) toast('No se detectaron juegos; se muestran ejemplos.');
})();
