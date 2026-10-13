// Detecta los juegos INSTALADOS en Steam, Epic Games y GOG (Windows; Steam también en Linux).
// Cada proveedor devuelve juegos con la misma forma, así que más adelante se puede agregar
// otro origen (por ejemplo "comprados en tu cuenta") sin tocar la interfaz.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { pathToFileURL } = require('url');

const isWin = process.platform === 'win32';
const exists = p => { try { return fs.existsSync(p); } catch { return false; } };
const ls = d => { try { return fs.readdirSync(d); } catch { return []; } };
const reg = args => new Promise(res => execFile('reg', args, { windowsHide: true, maxBuffer: 16 << 20 }, (e, out) => res(e ? '' : out)));
const splitArgs = s => (String(s || '').match(/"[^"]*"|\S+/g) || []).map(a => a.replace(/^"|"$/g, ''));
const colorsFor = name => { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360; return [`hsl(${h} 60% 46%)`, `hsl(${(h + 45) % 360} 62% 28%)`, '#0a0d16']; };
const ART_TIMEOUT_MS = 8000;
const MAX_ART_BYTES = 20 * 1024 * 1024;

async function requestJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ART_TIMEOUT_MS) });
    if (!res.ok) {
      if (res.status !== 404) console.warn(`No se pudo consultar arte (${res.status}): ${url}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`No se pudo consultar arte ${url}: ${err.message}`);
    return null;
  }
}
async function cacheImage(url, artDir, fileName) {
  if (!url) return '';
  const imageUrl = url.startsWith('//') ? `https:${url}` : url;
  let parsed;
  try { parsed = new URL(imageUrl); } catch { return ''; }
  if (parsed.protocol !== 'https:' ||
      !/(?:^|\.)cdn2\.unrealengine\.com$|(?:^|\.)gog-statics\.com$/i.test(parsed.hostname)) return '';

  const target = ext => path.join(artDir, `${fileName}${ext}`);
  if (artDir) {
    const cached = ['.jpg', '.png', '.webp'].find(ext => exists(target(ext)));
    if (cached) return pathToFileURL(target(cached)).href;
  }

  try {
    const res = await fetch(parsed.href, { signal: AbortSignal.timeout(ART_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const extensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
    const ext = extensions[type];
    if (!ext) throw new Error(`tipo de imagen no compatible: ${type || 'desconocido'}`);
    const length = Number(res.headers.get('content-length') || 0);
    if (length > MAX_ART_BYTES) throw new Error('la imagen excede el límite de tamaño');
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_ART_BYTES) throw new Error('tamaño de imagen no válido');
    if (!artDir) return parsed.href;
    fs.mkdirSync(artDir, { recursive: true });
    fs.writeFileSync(target(ext), bytes);
    return pathToFileURL(target(ext)).href;
  } catch (err) {
    console.warn(`No se pudo guardar la imagen ${parsed.href}: ${err.message}`);
    return parsed.href;
  }
}
function collectImageUrls(data, fields) {
  const found = {};
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (fields.includes(key) && typeof child === 'string' && !found[key]) found[key] = child;
      else if (fields.includes(key) && child && typeof child === 'object' && typeof child.src === 'string' && !found[key])
        found[key] = child.src;
      else if (child && typeof child === 'object') visit(child);
    }
  };
  visit(data);
  return found;
}
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }));
  return results;
}
function findPlayableVideo(value) {
  if (!value || typeof value !== 'object') return '';
  if (Array.isArray(value)) {
    for (const item of value) {
      const video = findPlayableVideo(item);
      if (video) return video;
    }
    return '';
  }
  if (Array.isArray(value.outputs)) {
    const output = value.outputs.find(item =>
      (/^video\/(?:mp4|webm)$/i.test(item.contentType || '') ||
        /^application\/x-mpegurl$/i.test(item.contentType || '')) &&
      /^https:\/\/media-cdn\.epicgames\.com\//i.test(item.url || ''));
    if (output) return output.url;
  }
  for (const child of Object.values(value)) {
    if (typeof child === 'string' && /^[\[{]/.test(child.trimStart())) {
      try {
        const video = findPlayableVideo(JSON.parse(child));
        if (video) return video;
      } catch {}
    } else if (child && typeof child === 'object') {
      const video = findPlayableVideo(child);
      if (video) return video;
    }
  }
  return '';
}

// ---------- Steam ----------
const STEAM_SKIP = /^(Proton|Steam Linux Runtime|Steamworks Common|Steam Controller Configs)/i;

async function steamRoot() {
  const c = [];
  if (isWin) {
    const o = await reg(['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath']);
    const m = o.match(/SteamPath\s+REG_SZ\s+(.+)/);
    if (m) c.push(path.normalize(m[1].trim()));
    c.push('C:\\Program Files (x86)\\Steam');
  } else c.push(path.join(os.homedir(), '.steam', 'steam'), path.join(os.homedir(), '.local', 'share', 'Steam'));
  return c.find(p => exists(path.join(p, 'steamapps')));
}
function findFile(dir, name, depth = 2) {
  for (const e of ls(dir)) {
    const p = path.join(dir, e);
    if (e === name) return p;
    if (depth > 0) { try { if (fs.statSync(p).isDirectory()) { const r = findFile(p, name, depth - 1); if (r) return r; } } catch {} }
  }
  return null;
}
// Arte: primero la caché local de Steam; si no está, la CDN de Steam.
function steamArt(root, id) {
  const lc = path.join(root, 'appcache', 'librarycache');
  const get = (name, ext = 'jpg') => {
    let p = path.join(lc, `${id}_${name}.${ext}`);
    if (!exists(p)) p = findFile(path.join(lc, String(id)), `${name}.${ext}`);
    return p ? pathToFileURL(p).href : `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/${name}.${ext}`;
  };
  return { cover: get('library_600x900'), hero: get('library_hero'), logo: get('logo', 'png') };
}
async function steamVideo(id) {
  const data = await requestJson(`https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(id)}&cc=us&l=en`);
  const movies = data && data[id] && data[id].success && data[id].data && data[id].data.movies;
  const movie = Array.isArray(movies) && (movies.find(item => item.highlight) || movies[0]);
  return movie && movie.id ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${encodeURIComponent(movie.id)}/movie_max.mp4` : '';
}
async function scanSteam() {
  const root = await steamRoot();
  if (!root) return [];
  const libs = new Set([root]);
  const vdf = path.join(root, 'steamapps', 'libraryfolders.vdf');
  if (exists(vdf)) for (const m of fs.readFileSync(vdf, 'utf8').matchAll(/"path"\s+"([^"]+)"/g)) libs.add(path.normalize(m[1].replace(/\\\\/g, '\\')));
  const out = [], seen = new Set();
  for (const lib of libs) {
    const dir = path.join(lib, 'steamapps');
    for (const f of ls(dir)) {
      if (!/^appmanifest_\d+\.acf$/.test(f)) continue;
      let t; try { t = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
      const v = k => (t.match(new RegExp(`"${k}"\\s+"([^"]*)"`, 'i')) || [])[1];
      const id = v('appid'), name = v('name'), flags = +v('StateFlags') || 0;
      if (!id || !name || seen.has(id) || (flags & 4) !== 4 || id === '228980' || STEAM_SKIP.test(name)) continue;
      seen.add(id);
      out.push({ id: `steam-${id}`, title: name, store: 'steam', installed: true, uri: `steam://rungameid/${id}`,
        lastPlayed: (+v('LastPlayed') || 0) * 1000, colors: colorsFor(name), ...steamArt(root, id) });
    }
  }
  return mapLimit(out, 6, async game => {
    game.video = await steamVideo(game.id.replace(/^steam-/, ''));
    return game;
  });
}

// ---------- Epic Games ----------
async function epicArt(game, artDir) {
  const slugs = [...new Set([game.AppName, game.DisplayName]
    .filter(Boolean)
    .map(value => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')))];
  let data = null;
  for (const slug of slugs) {
    data = await requestJson(`https://store-content.ak.epicgames.com/api/en-US/content/products/${encodeURIComponent(slug)}`);
    if (data) break;
  }
  if (!data) return {};
  const images = collectImageUrls(data, ['portraitBackgroundImageUrl', 'backgroundImageUrl', 'logoImage']);
  const id = `epic-${game.AppName}`.replace(/[^a-z0-9_-]/gi, '_');
  const cover = await cacheImage(images.portraitBackgroundImageUrl, artDir, `${id}-cover`);
  const hero = await cacheImage(images.backgroundImageUrl, artDir, `${id}-hero`);
  const logo = await cacheImage(images.logoImage, artDir, `${id}-logo`);
  const video = findPlayableVideo(data);
  return { ...(cover && { cover }), ...(hero && { hero }), ...(logo && { logo }), ...(video && { video }) };
}
async function scanEpic(artDir) {
  if (!isWin) return [];
  const dir = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
  const games = [];
  for (const f of ls(dir)) {
    if (!f.endsWith('.item')) continue;
    let m; try { m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
    if (!m.DisplayName || !m.InstallLocation || !m.LaunchExecutable || m.bIsIncompleteInstall) continue;
    if (m.MainGameAppName && m.MainGameAppName !== m.AppName) continue; // DLC
    const exe = path.join(m.InstallLocation, m.LaunchExecutable);
    if (!exists(exe)) continue;
    const g = { id: `epic-${m.AppName}`, title: m.DisplayName, store: 'epic', installed: true, exe,
      args: splitArgs(m.LaunchCommand), cwd: m.InstallLocation, colors: colorsFor(m.DisplayName) };
    if (m.CatalogNamespace && m.CatalogItemId && m.AppName)
      g.uri = `com.epicgames.launcher://apps/${encodeURIComponent(`${m.CatalogNamespace}:${m.CatalogItemId}:${m.AppName}`)}?action=launch&silent=true`;
    games.push({ game: g, manifest: m });
  }
  return mapLimit(games, 6, async ({ game, manifest }) => {
    Object.assign(game, await epicArt(manifest, artDir));
    return game;
  });
}

// ---------- GOG ----------
function parseGogReg(text) {
  const games = []; let cur = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^HKEY_/i.test(line)) { cur = /\\Games\\\d+$/i.test(line.trim()) ? {} : null; if (cur) games.push(cur); continue; }
    const m = cur && line.match(/^\s+(\w+)\s+REG_\w+\s+(.*)$/);
    if (m) cur[m[1]] = m[2].trim();
  }
  return games.filter(r => r.gameName && r.exe).map(r => ({
    id: `gog-${r.gameID || r.gameName}`, title: r.gameName, store: 'gog', installed: true,
    exe: r.exe, args: splitArgs(r.launchParam), cwd: r.workingDir || r.path,
    gogId: r.gameID, colors: colorsFor(r.gameName)
  }));
}
async function gogArt(game, artDir) {
  if (!/^\d+$/.test(String(game.gogId || ''))) return {};
  const data = await requestJson(`https://api.gog.com/products/${encodeURIComponent(game.gogId)}`);
  if (!data || !data.images) return {};
  const cover = await cacheImage(data.images.icon, artDir, `${game.id}-cover`);
  const hero = await cacheImage(data.images.background, artDir, `${game.id}-hero`);
  const logo = await cacheImage(data.images.logo2x || data.images.logo, artDir, `gog-${game.gogId}-logo`);
  return { ...(cover && { cover }), ...(hero && { hero }), ...(logo && { logo }) };
}
async function scanGog(artDir) {
  if (!isWin) return [];
  const o = await reg(['query', 'HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games', '/s']);
  const games = parseGogReg(o).filter(g => exists(g.exe));
  return mapLimit(games, 6, async game => {
    Object.assign(game, await gogArt(game, artDir));
    delete game.gogId;
    return game;
  });
}

async function scanInstalled({ artDir } = {}) {
  const r = await Promise.all([scanSteam(), scanEpic(artDir), scanGog(artDir)].map(p => p.catch(err => {
    console.warn(`No se pudo completar el escaneo de una tienda: ${err.message}`);
    return [];
  })));
  return r.flat();
}
module.exports = { scanInstalled, parseGogReg, findPlayableVideo };
