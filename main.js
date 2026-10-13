const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const { scanInstalled } = require('./scanner');

// games.json = juegos manuales o ajustes sobre los detectados (portada, hero, tagline, "hidden"...).
const MANUAL = path.join(__dirname, 'games.json');
const DEMO = path.join(__dirname, 'games.demo.json');
const SYSTEM = path.join(__dirname, 'system.json');
const playedFile = () => path.join(app.getPath('userData'), 'played.json');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null));
function epicAppName(uri) {
  const match = String(uri || '').match(/^com\.epicgames\.launcher:\/\/apps\/([^?]+)/i);
  if (!match) return '';
  try { return decodeURIComponent(match[1]).split(':').pop(); }
  catch { return ''; }
}

let cache = null;
async function loadGames(force) {
  if (cache && !force) return cache;
  let list = await scanInstalled({ artDir: path.join(app.getPath('userData'), 'game-art') });
  for (const m of readJson(MANUAL, [])) {
    const epicId = epicAppName(m.uri);
    const hit = list.find(d => (m.id && d.id === m.id) || norm(d.title) === norm(m.title) ||
      (epicId && norm(d.id) === norm(`epic-${epicId}`)));
    if (hit) Object.assign(hit, clean(m), { id: hit.id });
    else list.push({ store: 'local', installed: true, ...clean(m), id: m.id || 'manual-' + norm(m.title) });
  }
  list = list.filter(g => !g.hidden);
  let demo = false;
  if (!list.length) { list = readJson(DEMO, []); demo = true; } // sin juegos: se muestran ejemplos
  const played = readJson(playedFile(), {});
  list.forEach(g => { g.lastPlayed = Math.max(g.lastPlayed || 0, played[g.id] || 0); g.demo = demo; });
  return (cache = list);
}
function markPlayed(id) {
  const p = readJson(playedFile(), {}); p[id] = Date.now();
  try { fs.writeFileSync(playedFile(), JSON.stringify(p)); } catch {}
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1326, height: 764, minWidth: 960, minHeight: 540,
    backgroundColor: '#05070b',
    autoHideMenuBar: true,
    fullscreen: process.argv.includes('--fullscreen'),
    title: 'Launcher',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile('index.html');

  // F11 = pantalla completa
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
}

ipcMain.handle('games:get', () => loadGames());
ipcMain.handle('games:rescan', () => loadGames(true));
ipcMain.handle('system:get', () => {
  try {
    return JSON.parse(fs.readFileSync(SYSTEM, 'utf8'));
  } catch (err) {
    console.error(`No se pudo cargar ${SYSTEM}: ${err.message}`);
    throw new Error('No se pudieron cargar los recursos del sistema.');
  }
});

const EXPLORE_TIMEOUT_MS = 10000;
async function fetchExploreJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(EXPLORE_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
async function exploreSteam() {
  const data = await fetchExploreJson('https://store.steampowered.com/api/featuredcategories?cc=us&l=es');
  const seen = new Set();
  return ['new_releases', 'coming_soon'].flatMap(category => (data[category]?.items || [])
    .filter(game => game.id && game.name && !seen.has(String(game.id)) && seen.add(String(game.id)))
    .slice(0, 10)
    .map(game => ({
      store: 'steam',
      title: game.name,
      image: game.header_image || game.large_capsule_image || game.small_capsule_image || '',
      label: category === 'coming_soon' ? 'Próximamente' : 'Lanzamiento reciente',
      url: `https://store.steampowered.com/app/${encodeURIComponent(game.id)}/`
    })));
}
async function exploreEpic() {
  const data = await fetchExploreJson('https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=es-ES&country=ES&allowCountries=ES');
  const products = data.data?.Catalog?.searchStore?.elements || [];
  return products.slice(0, 12).map(game => {
    const offers = game.promotions?.promotionalOffers?.flatMap(group => group.promotionalOffers || []) || [];
    const upcoming = game.promotions?.upcomingPromotionalOffers?.flatMap(group => group.promotionalOffers || []) || [];
    const image = game.keyImages?.find(item => item.type === 'OfferImageWide')?.url ||
      game.keyImages?.find(item => item.type === 'DieselStoreFrontWide')?.url ||
      game.keyImages?.[0]?.url || '';
    const slug = game.productSlug?.split('/')[0] || game.urlSlug;
    return {
      store: 'epic',
      title: game.title,
      image,
      label: offers.length ? 'Gratis ahora' : upcoming.length ? 'Gratis próximamente' : 'Promoción',
      date: upcoming[0]?.startDate || offers[0]?.startDate || '',
      url: `https://store.epicgames.com/es-ES/p/${encodeURIComponent(slug || game.id)}`
    };
  }).filter(game => game.title);
}
async function exploreGog() {
  const data = await fetchExploreJson('https://catalog.gog.com/v1/catalog?limit=24&order=desc%3AreleaseDate&productType=game&countryCode=US&locale=es-ES&currencyCode=USD');
  return (data.products || []).slice(0, 18).filter(game => game.title && game.slug).map(game => {
    const date = (game.releaseDate || '').replace(/^(\d{4})\.(\d{2})\.(\d{2})$/, '$1-$2-$3');
    const upcoming = date && !Number.isNaN(Date.parse(date)) && Date.parse(`${date}T00:00:00Z`) > Date.now();
    return {
      store: 'gog',
      title: game.title,
      image: game.coverHorizontal || '',
      label: upcoming ? 'Próximamente' : 'Novedad en GOG',
      date,
      url: `https://www.gog.com/game/${encodeURIComponent(game.slug)}`
    };
  });
}
ipcMain.handle('explore:get', async () => {
  const stores = ['steam', 'epic', 'gog'];
  const results = await Promise.allSettled([exploreSteam(), exploreEpic(), exploreGog()]);
  const itemsByStore = {}, errors = {};
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') itemsByStore[stores[index]] = result.value;
    else {
      errors[stores[index]] = result.reason?.message || 'No se pudo cargar la tienda.';
      console.warn(`No se pudieron cargar novedades de ${stores[index]}: ${errors[stores[index]]}`);
    }
  });
  const items = [];
  for (let i = 0; stores.some(store => itemsByStore[store]?.[i]); i++)
    stores.forEach(store => { if (itemsByStore[store]?.[i]) items.push(itemsByStore[store][i]); });
  return { items, errors };
});
async function storeDealsSteam() {
  const data = await fetchExploreJson('https://store.steampowered.com/api/featuredcategories?cc=us&l=es');
  return (data.specials?.items || []).filter(game => game.id && game.name &&
    Number.isFinite(game.final_price) && Number.isFinite(game.discount_percent) && game.discount_percent > 0)
    .slice(0, 30).map(game => ({
      store: 'steam',
      title: game.name,
      image: game.header_image || game.large_capsule_image || '',
      kind: game.final_price === 0 ? 'free' : 'offer',
      label: game.final_price === 0 ? 'Gratis ahora' : `-${game.discount_percent}%`,
      finalPrice: game.final_price / 100,
      originalPrice: Number.isFinite(game.original_price) ? game.original_price / 100 : null,
      discountPercent: game.discount_percent,
      currency: game.currency || 'USD',
      url: `https://store.steampowered.com/app/${encodeURIComponent(game.id)}/`
    }));
}
async function storeDealsGog() {
  const data = await fetchExploreJson('https://catalog.gog.com/v1/catalog?limit=48&order=desc%3Adiscount&productType=game&discounted=true&countryCode=US&locale=es-ES&currencyCode=USD');
  return (data.products || []).filter(game => game.title && game.slug && game.price?.finalMoney?.amount)
    .map(game => {
      const finalPrice = Number(game.price.finalMoney.amount);
      const originalPrice = Number(game.price.baseMoney?.amount);
      const discountPercent = Math.round(Number.parseFloat(game.price.discount || '0'));
      return {
        store: 'gog',
        title: game.title,
        image: game.coverHorizontal || '',
        kind: finalPrice === 0 ? 'free' : 'offer',
        label: finalPrice === 0 ? 'Gratis ahora' : `${Math.abs(discountPercent)}% de descuento`,
        finalPrice,
        originalPrice: Number.isFinite(originalPrice) ? originalPrice : null,
        discountPercent: Math.abs(discountPercent),
        currency: game.price.finalMoney.currency || 'USD',
        url: `https://www.gog.com/game/${encodeURIComponent(game.slug)}`
      };
    }).filter(game => game.kind === 'free' || game.discountPercent > 0).slice(0, 30);
}
async function storeFreeGamesEpic() {
  const data = await fetchExploreJson('https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=es-ES&country=ES&allowCountries=ES');
  const products = data.data?.Catalog?.searchStore?.elements || [];
  const freeGames = [];
  products.forEach(game => {
    const current = game.promotions?.promotionalOffers?.flatMap(group => group.promotionalOffers || []) || [];
    const upcoming = game.promotions?.upcomingPromotionalOffers?.flatMap(group => group.promotionalOffers || []) || [];
    const freeNow = current.find(offer => offer.discountSetting?.discountPercentage === 0);
    const freeSoon = upcoming.find(offer => offer.discountSetting?.discountPercentage === 0);
    const offer = freeNow || freeSoon;
    if (!offer || !game.title) return;
    const image = game.keyImages?.find(item => item.type === 'OfferImageWide')?.url ||
      game.keyImages?.find(item => item.type === 'DieselStoreFrontWide')?.url ||
      game.keyImages?.[0]?.url || '';
    const slug = game.productSlug?.split('/')[0] || game.urlSlug || game.id;
    freeGames.push({
      store: 'epic',
      title: game.title,
      image,
      kind: 'free',
      label: freeNow ? 'Gratis ahora' : 'Gratis próximamente',
      date: freeNow ? offer.endDate || '' : offer.startDate || '',
      dateLabel: freeNow ? 'Hasta' : 'Desde',
      finalPrice: 0,
      originalPrice: Number.isFinite(game.price?.totalPrice?.originalPrice)
        ? game.price.totalPrice.originalPrice / 100 : null,
      discountPercent: 100,
      currency: game.price?.totalPrice?.currencyCode || 'USD',
      url: `https://store.epicgames.com/es-ES/p/${encodeURIComponent(slug)}`
    });
  });
  return freeGames;
}
ipcMain.handle('store:deals:get', async () => {
  const stores = ['steam', 'gog', 'epic'];
  const results = await Promise.allSettled([storeDealsSteam(), storeDealsGog(), storeFreeGamesEpic()]);
  const itemsByStore = {}, errors = {};
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') itemsByStore[stores[index]] = result.value;
    else {
      errors[stores[index]] = result.reason?.message || 'No se pudieron cargar las ofertas.';
      console.warn(`No se pudieron cargar ofertas de ${stores[index]}: ${errors[stores[index]]}`);
    }
  });
  const items = [];
  for (let i = 0; stores.some(store => itemsByStore[store]?.[i]); i++)
    stores.forEach(store => { if (itemsByStore[store]?.[i]) items.push(itemsByStore[store][i]); });
  return { items, errors };
});
ipcMain.handle('explore:open', async (_e, item) => {
  const hosts = { steam: 'store.steampowered.com', epic: 'store.epicgames.com', gog: 'www.gog.com' };
  if (!item || !hosts[item.store] || typeof item.url !== 'string') return { ok: false, error: 'Enlace de tienda no válido.' };
  let url;
  try { url = new URL(item.url); } catch { return { ok: false, error: 'Enlace de tienda no válido.' }; }
  if (url.protocol !== 'https:' || url.hostname !== hosts[item.store]) return { ok: false, error: 'Enlace de tienda no permitido.' };
  openStoreWindow(BrowserWindow.fromWebContents(_e.sender), url.href, 'Explorar');
  return { ok: true };
});

// Se lanza por id: el renderer nunca manda rutas a ejecutar.
ipcMain.handle('game:launch', async (_e, id) => {
  const g = (await loadGames()).find(x => x.id === id);
  if (!g) return { ok: false, error: 'Juego no encontrado.' };
  if (g.demo) return { ok: false, error: 'Es un juego de ejemplo. Instala uno desde Steam, Epic o GOG.' };
  if (g.installed === false) return { ok: false, error: 'Este juego no está instalado.' };
  if (g.uri) {
    if (!/^(steam|com\.epicgames\.launcher|goggalaxy):/i.test(g.uri)) return { ok: false, error: 'Enlace no permitido.' };
    await shell.openExternal(g.uri); markPlayed(id); return { ok: true };
  }
  if (!g.exe) return { ok: false, error: 'Agrega "exe" o "uri" a este juego en games.json.' };
  if (!fs.existsSync(g.exe)) return { ok: false, error: 'No se encontró: ' + g.exe };
  return new Promise(resolve => {
    const child = spawn(g.exe, g.args || [], { detached: true, stdio: 'ignore', cwd: g.cwd || path.dirname(g.exe) });
    child.once('error', err => resolve({ ok: false, error: err.message }));
    child.once('spawn', () => { child.unref(); markPlayed(id); resolve({ ok: true }); });
  });
});

// Tiendas: se abren en una ventana propia (la sesión se conserva entre aperturas).
const STORES = {
  steam: 'https://store.steampowered.com/',
  epic: 'https://store.epicgames.com/',
  gog: 'https://www.gog.com/'
};
function openStoreWindow(parent, url, title) {
  const w = new BrowserWindow({
    parent, backgroundColor: '#0b0c10', autoHideMenuBar: true, title,
    fullscreen: !!(parent && parent.isFullScreen()),
    webPreferences: { partition: 'persist:stores', contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  if (parent && !parent.isFullScreen()) w.setBounds(parent.getBounds());
  w.setMenuBarVisibility(false);
  w.loadURL(url);
  w.webContents.setWindowOpenHandler(({ url: target }) => { w.loadURL(target); return { action: 'deny' }; });
  w.webContents.on('before-input-event', (ev, i) => {
    if (i.type !== 'keyDown') return;
    if (i.key === 'Escape') w.close();
    if (i.alt && i.key === 'ArrowLeft') w.webContents.goBack();
  });
}
ipcMain.handle('store:open', (e, id) => {
  const url = STORES[id];
  if (!url) return { ok: false };
  const parent = BrowserWindow.fromWebContents(e.sender);
  openStoreWindow(parent, url, 'Tienda');
  return { ok: true };
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
