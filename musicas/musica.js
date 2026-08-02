const SUPABASE_URL = 'https://oedcetvgmzaxmpymqoxt.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Mfkjit2yj7W9S4a_T2ETAw_Q8gYJnoW';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const BUCKET = 'media';
const SIGNED_URL_TTL = 60 * 60 * 6; // 6 horas

const authOverlay = document.getElementById('authOverlay');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authSubmit = document.getElementById('authSubmit');
const authError = document.getElementById('authError');
const appRoot = document.getElementById('appRoot');
const playerBar = document.getElementById('playerBar');
const toastEl = document.getElementById('toast');

const fileInput = document.getElementById('fileInput');
const coverInput = document.getElementById('coverInput');
const uploadBtn = document.getElementById('uploadBtn');
const uploadZone = document.getElementById('uploadZone');
const tracklistEl = document.getElementById('tracklist');
const trackCountEl = document.getElementById('trackCount');
const crateEl = document.getElementById('crate');
const crateEmptyEl = document.getElementById('crateEmpty');
const subtitleEl = document.getElementById('playlistSubtitle');
const clearLibBtn = document.getElementById('clearLibBtn');
const logoutBtn = document.getElementById('logoutBtn');

const playBtn = document.getElementById('playBtn');
const playIcon = document.getElementById('playIcon');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const shuffleBtn = document.getElementById('shuffleBtn');
const repeatBtn = document.getElementById('repeatBtn');
const seek = document.getElementById('seek');
const curTimeEl = document.getElementById('curTime');
const durTimeEl = document.getElementById('durTime');
const volEl = document.getElementById('vol');
const nowName = document.getElementById('nowName');
const nowArtist = document.getElementById('nowArtist');
const nowCover = document.getElementById('nowCover');

let tracks = [];
let currentIndex = -1;
let isShuffle = false;
let isRepeat = false;
let seeking = false;
let realtimeChannel = null;

const audio = new Audio();
audio.volume = 0.8;

function showToast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove('show'), 3200);
}

/* ---------- auth ---------- */
async function initAuth(){
  const { data: { session } } = await sb.auth.getSession();
  if (session) await enterApp(); else showLogin();
  sb.auth.onAuthStateChange((_event, session) => {
    if (session) enterApp(); else showLogin();
  });
}
function showLogin(){
  authOverlay.style.display = 'flex';
  appRoot.style.display = 'none';
  playerBar.style.display = 'none';
  document.getElementById('carouselAddBtn').style.display = 'none';
  if (realtimeChannel){ sb.removeChannel(realtimeChannel); realtimeChannel = null; }
  audio.pause();
  stopCarouselRotation();
  stopCarouselRefresh();
  currentUserEmail = null;
  const feedEl = document.getElementById('notesFeed');
  if (feedEl) feedEl.innerHTML = '';
}
async function enterApp(){
  authOverlay.style.display = 'none';
  appRoot.style.display = 'block';
  playerBar.style.display = 'flex';
  document.getElementById('carouselAddBtn').style.display = 'flex';
  const { data: userData } = await sb.auth.getUser();
  currentUserEmail = userData && userData.user ? userData.user.email : null;
  subscribeRealtime();
  await loadLibrary();
  await loadCarouselPhotos();
  await loadNotes();
  startCarouselRefresh();
}
authSubmit.addEventListener('click', async () => {
  authError.textContent = '';
  const email = authEmail.value.trim();
  const password = authPassword.value;
  if (!email || !password){ authError.textContent = 'Preencham email e senha.'; return; }
  authSubmit.disabled = true; authSubmit.textContent = 'Entrando...';
  const { error } = await sb.auth.signInWithPassword({ email, password });
  authSubmit.disabled = false; authSubmit.textContent = 'Entrar';
  if (error) authError.textContent = 'Email ou senha incorretos.';
});
authPassword.addEventListener('keydown', e => { if (e.key === 'Enter') authSubmit.click(); });
logoutBtn.addEventListener('click', () => sb.auth.signOut());

function subscribeRealtime(){
  if (realtimeChannel) return;
  realtimeChannel = sb.channel('tracks-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tracks' }, () => loadLibrary())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'carousel_photos' }, () => loadCarouselPhotos())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, () => loadNotes())
    .subscribe();
}

/* ---------- helpers ---------- */
function hashStr(str){
  let h = 0;
  for (let i = 0; i < str.length; i++){ h = (h << 5) - h + str.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}
function coverGradient(name){
  const h = hashStr(name);
  const hue1 = h % 360;
  const hue2 = (hue1 + 45 + (h % 55)) % 360;
  return `linear-gradient(135deg, hsl(${hue1} 72% 58%), hsl(${hue2} 60% 32%))`;
}
function initialsOf(name){
  const base = name.replace(/\.(mp3|wav|m4a|ogg|flac)$/i,'');
  const words = base.split(/[\s_\-]+/).filter(Boolean);
  if (words.length === 0) return '♪';
  if (words.length === 1) return words[0].slice(0,2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
function formatTime(s){
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2,'0');
  return `${m}:${sec}`;
}
function isVideoCover(t){
  return !!(t.coverPath && /\.(mp4|webm|mov|m4v)$/i.test(t.coverPath));
}
function extFromMime(mime){
  const map = { 'image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp',
    'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','video/x-m4v':'m4v' };
  if (map[mime]) return map[mime];
  return (mime && mime.split('/')[1] ? mime.split('/')[1] : 'bin').toLowerCase();
}
function cssBackgroundFor(t){
  if (t.coverUrl && !isVideoCover(t)) return `background:url('${t.coverUrl}') center/cover no-repeat;`;
  return `background:${coverGradient(t.name)};`;
}
function applyCover(el, t){
  const oldVideo = el.querySelector('video.cover-video');
  if (oldVideo) oldVideo.remove();
  if (t.coverUrl && isVideoCover(t)){
    el.style.background = coverGradient(t.name);
    const v = document.createElement('video');
    v.className = 'cover-video';
    v.src = t.coverUrl;
    v.muted = true; v.autoplay = true; v.loop = true; v.playsInline = true;
    el.appendChild(v);
  } else if (t.coverUrl){
    el.style.background = `url('${t.coverUrl}') center/cover no-repeat`;
  } else {
    el.style.background = coverGradient(t.name);
  }
}
function extractEmbeddedCover(file){
  return new Promise(resolve => {
    if (!window.jsmediatags){ resolve(null); return; }
    try {
      window.jsmediatags.read(file, {
        onSuccess: tag => {
          const pic = tag.tags && tag.tags.picture;
          if (pic && pic.data && pic.data.length){
            const bytes = new Uint8Array(pic.data);
            resolve(new Blob([bytes], { type: pic.format || 'image/jpeg' }));
          } else resolve(null);
        },
        onError: () => resolve(null)
      });
    } catch (e) { resolve(null); }
  });
}
async function signedUrl(path){
  if (!path) return null;
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
  if (error) return null;
  return data.signedUrl;
}

/* ---------- library (Supabase) ---------- */
async function loadLibrary(){
  const { data, error } = await sb.from('tracks').select('*').order('added_at', { ascending: true });
  if (error){ showToast('Erro ao carregar biblioteca'); return; }
  const playingId = (currentIndex >= 0 && tracks[currentIndex]) ? tracks[currentIndex].id : null;
  const wasPlaying = !audio.paused;
  const resumeTime = audio.currentTime;

  tracks = await Promise.all((data || []).map(async row => ({
    id: row.id,
    name: row.name,
    audioPath: row.audio_path,
    coverPath: row.cover_path,
    audioUrl: await signedUrl(row.audio_path),
    coverUrl: row.cover_path ? await signedUrl(row.cover_path) : null,
    addedBy: row.added_by
  })));

  currentIndex = playingId ? tracks.findIndex(t => t.id === playingId) : -1;
  renderAll();

  if (currentIndex !== -1){
    const t = tracks[currentIndex];
    if (audio.src !== t.audioUrl){
      audio.src = t.audioUrl;
      audio.currentTime = resumeTime || 0;
      if (wasPlaying) audio.play().catch(() => {});
    }
    nowName.textContent = t.name;
    nowArtist.textContent = t.addedBy ? `Adicionada por ${t.addedBy.split('@')[0]}` : 'Da nuvem de vocês';
    applyCover(nowCover, t);
  }
}

async function addFiles(fileList){
  const audioFiles = Array.from(fileList).filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|flac)$/i.test(f.name));
  if (audioFiles.length === 0) return;
  uploadBtn.disabled = true;
  const originalLabel = uploadBtn.innerHTML;
  const { data: userData } = await sb.auth.getUser();
  const addedBy = userData && userData.user ? userData.user.email : null;

  for (const file of audioFiles){
    uploadBtn.innerHTML = `Enviando ${file.name}...`;
    const id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
    const ext = (file.name.split('.').pop() || 'mp3').toLowerCase();
    const audioPath = `${id}/audio.${ext}`;
    const { error: upErr } = await sb.storage.from(BUCKET).upload(audioPath, file, { upsert: false, contentType: file.type || 'audio/mpeg' });
    if (upErr){ showToast(`Erro ao enviar ${file.name}`); continue; }

    let coverPath = null;
    const coverBlob = await extractEmbeddedCover(file);
    if (coverBlob){
      const cext = (coverBlob.type.split('/')[1] || 'jpg');
      coverPath = `${id}/cover.${cext}`;
      const { error: coverErr } = await sb.storage.from(BUCKET).upload(coverPath, coverBlob, { upsert: true, contentType: coverBlob.type || 'image/jpeg' });
      if (coverErr) coverPath = null;
    }

    const name = file.name.replace(/\.(mp3|wav|m4a|ogg|flac)$/i,'');
    const { error: insErr } = await sb.from('tracks').insert({ id, name, audio_path: audioPath, cover_path: coverPath, added_by: addedBy });
    if (insErr) showToast(`Erro ao salvar ${name}`);
  }

  uploadBtn.disabled = false;
  uploadBtn.innerHTML = originalLabel;
  await loadLibrary();
  if (currentIndex === -1 && tracks.length > 0){
    currentIndex = 0;
    loadTrack(0);
    playCurrent();
  }
}

async function removeTrack(id){
  const t = tracks.find(x => x.id === id);
  if (!t) return;
  const wasCurrent = tracks[currentIndex] && tracks[currentIndex].id === id;
  const paths = [t.audioPath];
  if (t.coverPath) paths.push(t.coverPath);
  await sb.storage.from(BUCKET).remove(paths);
  await sb.from('tracks').delete().eq('id', id);
  if (wasCurrent){
    audio.pause();
    audio.removeAttribute('src');
    currentIndex = -1;
  }
  await loadLibrary();
}

let pendingCoverId = null;
function openCoverPicker(id){ pendingCoverId = id; coverInput.click(); }
coverInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  coverInput.value = '';
  if (!file || !pendingCoverId) return;
  if (file.size > 45 * 1024 * 1024){ showToast('Arquivo grande demais (máx. 45MB)'); return; }
  const id = pendingCoverId; pendingCoverId = null;
  const ext = extFromMime(file.type);
  const coverPath = `${id}/cover.${ext}`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(coverPath, file, { upsert: true, contentType: file.type || 'application/octet-stream' });
  if (upErr){ showToast('Erro ao trocar a capa'); return; }
  const { error: updErr } = await sb.from('tracks').update({ cover_path: coverPath }).eq('id', id);
  if (updErr){ showToast('Erro ao salvar a capa'); return; }
  await loadLibrary();
});

clearLibBtn.addEventListener('click', async () => {
  if (tracks.length === 0) return;
  if (!confirm('Isso apaga TODAS as músicas, pra você e pra ela. Continuar?')) return;
  const paths = tracks.flatMap(t => t.coverPath ? [t.audioPath, t.coverPath] : [t.audioPath]);
  if (paths.length) await sb.storage.from(BUCKET).remove(paths);
  await sb.from('tracks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  audio.pause();
  audio.removeAttribute('src');
  currentIndex = -1;
  await loadLibrary();
});

/* ---------- rendering ---------- */
function renderAll(){
  trackCountEl.textContent = `${tracks.length} ${tracks.length === 1 ? 'música' : 'músicas'}`;
  subtitleEl.textContent = tracks.length === 0
    ? 'Adicionem MP3s para ouvir juntos'
    : 'Sincronizado entre vocês dois';
  renderCrate();
  renderTracklist();
  const hasTracks = tracks.length > 0;
  [playBtn, prevBtn, nextBtn, shuffleBtn, repeatBtn].forEach(b => b.disabled = !hasTracks);
  seek.disabled = !hasTracks;
}

function renderCrate(){
  crateEl.querySelectorAll('.disc').forEach(d => d.remove());
  if (tracks.length === 0){
    crateEmptyEl.style.display = 'flex';
    return;
  }
  crateEmptyEl.style.display = 'none';
  const order = [];
  if (currentIndex >= 0) order.push(currentIndex);
  for (let i = 0; i < tracks.length && order.length < 4; i++){
    if (i !== currentIndex) order.push(i);
  }
  const fan = [
    { rot: 0, x: 0, scale: 1, z: 40 },
    { rot: -12, x: -58, scale: .86, z: 30 },
    { rot: 12, x: 58, scale: .86, z: 30 },
    { rot: -20, x: -98, scale: .74, z: 20 }
  ];
  order.forEach((trackIdx, i) => {
    const t = tracks[trackIdx];
    const f = fan[i] || fan[fan.length - 1];
    const disc = document.createElement('div');
    disc.className = 'disc';
    disc.tabIndex = 0;
    disc.setAttribute('role','button');
    disc.setAttribute('aria-label', `Tocar ${t.name}`);
    const transform = `translateX(${f.x}px) rotate(${f.rot}deg) scale(${f.scale})`;
    disc.style.transform = transform;
    disc.style.zIndex = f.z;
    if (i === 0 && trackIdx === currentIndex && !audio.paused && !audio.ended){
      disc.classList.add('playing');
    }
    disc.innerHTML = t.coverUrl ? '' : `<span class="initials">${initialsOf(t.name)}</span>`;
    applyCover(disc, t);
    if (i === 0){
      const editBtn = document.createElement('button');
      editBtn.className = 'edit-cover';
      editBtn.type = 'button';
      editBtn.setAttribute('aria-label', `Trocar capa de ${t.name}`);
      editBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h3l2-3h6l2 3h3v13H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
      editBtn.addEventListener('click', e => { e.stopPropagation(); openCoverPicker(t.id); });
      disc.appendChild(editBtn);
    }
    const play = () => { currentIndex = trackIdx; loadTrack(currentIndex); playCurrent(); };
    disc.addEventListener('click', play);
    disc.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); play(); } });
    crateEl.appendChild(disc);
  });
}

function renderTracklist(){
  if (tracks.length === 0){
    tracklistEl.innerHTML = '<div class="empty-list">Nenhuma música ainda. Toquem em "Adicionar músicas" acima.</div>';
    return;
  }
  tracklistEl.innerHTML = '';
  tracks.forEach((t, i) => {
    const row = document.createElement('div');
    row.className = 'track' + (i === currentIndex ? ' active' : '');
    row.tabIndex = 0;
    const playing = i === currentIndex && !audio.paused && !audio.ended;
    const statusText = playing ? 'Tocando agora' : (t.addedBy ? `Adicionada por ${t.addedBy.split('@')[0]}` : 'Na nuvem');
    row.innerHTML = `
      <div class="mini" style="${cssBackgroundFor(t)}">${isVideoCover(t) ? `<video class="cover-video" src="${t.coverUrl}" muted autoplay loop playsinline></video>` : (t.coverUrl ? '' : `<span style="font-size:10px;font-weight:700;color:rgba(255,255,255,.85)">${initialsOf(t.name)}</span>`)}</div>
      <div class="info">
        <div class="name" data-id="${t.id}">${t.name}</div>
        <div class="dur">${statusText}</div>
      </div>
      ${playing ? '<div class="eq"><i></i><i></i><i></i></div>' : ''}
      <button class="rename-btn" aria-label="Renomear ${t.name}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
      </button>
      <button class="cover-edit" aria-label="Trocar capa de ${t.name}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h3l2-3h6l2 3h3v13H4z"/><circle cx="12" cy="13" r="3.5"/></svg>
      </button>
      <button class="rm" aria-label="Remover ${t.name}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    `;
    row.addEventListener('click', (e) => {
      if (e.target.closest('.rm') || e.target.closest('.cover-edit') || e.target.closest('.rename-btn') || e.target.closest('.name-input')) return;
      currentIndex = i;
      loadTrack(currentIndex);
      playCurrent();
    });
    row.querySelector('.rm').addEventListener('click', (e) => { e.stopPropagation(); removeTrack(t.id); });
    row.querySelector('.cover-edit').addEventListener('click', (e) => { e.stopPropagation(); openCoverPicker(t.id); });
    row.querySelector('.rename-btn').addEventListener('click', (e) => { e.stopPropagation(); startRename(row, t); });
    tracklistEl.appendChild(row);
  });
}

function startRename(row, t){
  const nameEl = row.querySelector('.name');
  if (!nameEl || row.querySelector('.name-input')) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'name-input';
  input.value = t.name;
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  input.addEventListener('click', e => e.stopPropagation());

  let done = false;
  const save = async () => {
    if (done) return;
    done = true;
    const newName = input.value.trim();
    if (newName && newName !== t.name){
      const { error } = await sb.from('tracks').update({ name: newName }).eq('id', t.id);
      if (error){ showToast('Erro ao renomear'); }
    }
    await loadLibrary();
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter'){ e.preventDefault(); input.blur(); }
    if (e.key === 'Escape'){ done = true; loadLibrary(); }
  });
}

/* ---------- playback ---------- */
function loadTrack(i){
  const t = tracks[i];
  if (!t) return;
  audio.src = t.audioUrl;
  nowName.textContent = t.name;
  nowArtist.textContent = t.addedBy ? `Adicionada por ${t.addedBy.split('@')[0]}` : 'Da nuvem de vocês';
  applyCover(nowCover, t);
  seek.value = 0;
  curTimeEl.textContent = '0:00';
  durTimeEl.textContent = '0:00';
}
function playCurrent(){ audio.play().catch(() => {}); }
function togglePlay(){
  if (currentIndex === -1 && tracks.length > 0){ currentIndex = 0; loadTrack(0); }
  if (audio.paused) playCurrent(); else audio.pause();
}
function next(){
  if (tracks.length === 0) return;
  if (isShuffle && tracks.length > 1){
    let r;
    do { r = Math.floor(Math.random() * tracks.length); } while (r === currentIndex);
    currentIndex = r;
  } else {
    currentIndex = (currentIndex + 1) % tracks.length;
  }
  loadTrack(currentIndex);
  playCurrent();
}
function prev(){
  if (tracks.length === 0) return;
  if (audio.currentTime > 3){ audio.currentTime = 0; return; }
  currentIndex = (currentIndex - 1 + tracks.length) % tracks.length;
  loadTrack(currentIndex);
  playCurrent();
}

playBtn.addEventListener('click', togglePlay);
nextBtn.addEventListener('click', next);
prevBtn.addEventListener('click', prev);
shuffleBtn.addEventListener('click', () => { isShuffle = !isShuffle; shuffleBtn.classList.toggle('toggled', isShuffle); });
repeatBtn.addEventListener('click', () => { isRepeat = !isRepeat; repeatBtn.classList.toggle('toggled', isRepeat); audio.loop = isRepeat; });

audio.addEventListener('play', () => {
  playIcon.innerHTML = '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>';
  playBtn.setAttribute('aria-label','Pausar');
  renderCrate(); renderTracklist();
});
audio.addEventListener('pause', () => {
  playIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
  playBtn.setAttribute('aria-label','Reproduzir');
  renderCrate(); renderTracklist();
});
audio.addEventListener('ended', () => { if (!isRepeat) next(); });
audio.addEventListener('loadedmetadata', () => {
  seek.max = Math.floor(audio.duration) || 0;
  durTimeEl.textContent = formatTime(audio.duration);
});
audio.addEventListener('timeupdate', () => {
  if (seeking) return;
  seek.value = Math.floor(audio.currentTime);
  curTimeEl.textContent = formatTime(audio.currentTime);
});
seek.addEventListener('input', () => { seeking = true; curTimeEl.textContent = formatTime(seek.value); });
seek.addEventListener('change', () => { audio.currentTime = Number(seek.value); seeking = false; });
volEl.addEventListener('input', () => { audio.volume = Number(volEl.value) / 100; });

uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => { addFiles(e.target.files); fileInput.value = ''; });

['dragenter','dragover'].forEach(evt => uploadZone.addEventListener(evt, e => { e.preventDefault(); uploadZone.classList.add('drag'); }));
['dragleave','drop'].forEach(evt => uploadZone.addEventListener(evt, e => { e.preventDefault(); uploadZone.classList.remove('drag'); }));
uploadZone.addEventListener('drop', e => { if (e.dataTransfer.files) addFiles(e.dataTransfer.files); });

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT' && !document.activeElement.isContentEditable){
    e.preventDefault();
    togglePlay();
  }
});

const titleEl = document.getElementById('playlistTitle');
titleEl.addEventListener('blur', () => { if (!titleEl.textContent.trim()) titleEl.textContent = 'Nossa playlist'; });
titleEl.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); titleEl.blur(); } });

function initBubbles(){
  const wrap = document.getElementById('bubbles');
  if (!wrap) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['rgba(124,77,255,.35)','rgba(255,111,156,.30)','rgba(167,139,250,.28)'];
  const count = window.innerWidth < 480 ? 11 : 18;
  for (let i = 0; i < count; i++){
    const b = document.createElement('span');
    b.className = 'bubble';
    const size = 8 + Math.random() * 44;
    const left = Math.random() * 100;
    const duration = 14 + Math.random() * 18;
    const delay = -Math.random() * duration;
    const drift = (Math.random() * 60 - 30);
    const color = colors[i % colors.length];
    b.style.cssText = `width:${size}px;height:${size}px;left:${left}%;animation-duration:${duration}s;animation-delay:${delay}s;--drift:${drift}px;background:radial-gradient(circle at 32% 28%, rgba(255,255,255,.55), ${color} 55%, transparent 78%);`;
    wrap.appendChild(b);
  }
}
initBubbles();

/* ---------- carrossel de fotos de fundo ---------- */
const CAROUSEL_PREFIX = 'carousel';
const CAROUSEL_ROTATE_MS = 6500;
const CAROUSEL_REFRESH_MS = 5 * 60 * 1000;
const carouselAddBtn = document.getElementById('carouselAddBtn');
const carouselInput = document.getElementById('carouselInput');
let carouselPhotos = [];
let carouselIndex = 0;
let carouselTimer = null;
let carouselRefreshTimer = null;

async function loadCarouselPhotos(){
  const { data, error } = await sb.from('carousel_photos').select('*').order('added_at', { ascending: false });
  if (error || !data) return;
  const withUrls = await Promise.all(data.map(async row => {
    const url = await signedUrl(row.path);
    return url ? { id: row.id, path: row.path, url } : null;
  }));
  carouselPhotos = withUrls.filter(Boolean);
  renderCarousel();
}

function renderCarousel(){
  const wrap = document.getElementById('photoCarousel');
  if (!wrap) return;
  wrap.innerHTML = '';
  stopCarouselRotation();
  if (carouselPhotos.length === 0) return;
  carouselPhotos.forEach((p, i) => {
    const img = document.createElement('img');
    img.className = 'carousel-photo' + (i === 0 ? ' active' : '');
    img.src = p.url;
    img.alt = '';
    wrap.appendChild(img);
  });
  carouselIndex = 0;
  startCarouselRotation();
}

function startCarouselRotation(){
  stopCarouselRotation();
  if (carouselPhotos.length <= 1) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  carouselTimer = setInterval(() => {
    const wrap = document.getElementById('photoCarousel');
    if (!wrap) return;
    const imgs = wrap.querySelectorAll('.carousel-photo');
    if (imgs.length === 0) return;
    imgs[carouselIndex].classList.remove('active');
    carouselIndex = (carouselIndex + 1) % imgs.length;
    imgs[carouselIndex].classList.add('active');
  }, CAROUSEL_ROTATE_MS);
}
function stopCarouselRotation(){ if (carouselTimer){ clearInterval(carouselTimer); carouselTimer = null; } }
function startCarouselRefresh(){
  stopCarouselRefresh();
  carouselRefreshTimer = setInterval(loadCarouselPhotos, CAROUSEL_REFRESH_MS);
}
function stopCarouselRefresh(){ if (carouselRefreshTimer){ clearInterval(carouselRefreshTimer); carouselRefreshTimer = null; } }

carouselAddBtn.addEventListener('click', () => carouselInput.click());
carouselInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  carouselInput.value = '';
  if (files.length === 0) return;
  const { data: userData } = await sb.auth.getUser();
  const addedBy = userData && userData.user ? userData.user.email : null;
  let uploaded = 0;
  for (const file of files){
    if (!file.type.startsWith('image/')) continue;
    if (file.size > 15 * 1024 * 1024){ showToast('Foto grande demais (máx. 15MB)'); continue; }
    const id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
    const ext = extFromMime(file.type);
    const path = `${CAROUSEL_PREFIX}/${id}.${ext}`;
    const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' });
    if (upErr){ showToast('Erro ao enviar foto'); continue; }
    const { error: insErr } = await sb.from('carousel_photos').insert({ id, path, added_by: addedBy });
    if (insErr){ showToast('Erro ao salvar foto'); continue; }
    uploaded++;
  }
  if (uploaded > 0) showToast(uploaded === 1 ? 'Foto adicionada' : `${uploaded} fotos adicionadas`);
  await loadCarouselPhotos();
});

/* ---------- recados ---------- */
const notesFeed = document.getElementById('notesFeed');
const noteInput = document.getElementById('noteInput');
const noteSendBtn = document.getElementById('noteSendBtn');
const NOTES_LIMIT = 30;
let myUserId = null;

function escapeHtml(str){
  return str.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

async function loadNotes(){
  const { data: userData } = await sb.auth.getUser();
  if (userData && userData.user) myUserId = userData.user.id;
  const { data, error } = await sb.from('notes').select('*').order('created_at', { ascending: true }).limit(NOTES_LIMIT);
  if (error || !data) return;
  renderNotes(data);
}

function renderNotes(list){
  if (!notesFeed) return;
  notesFeed.innerHTML = '';
  list.forEach(n => {
    const mine = n.sender_id === myUserId;
    const bubble = document.createElement('div');
    bubble.className = 'note-bubble ' + (mine ? 'mine' : 'theirs');
    const who = n.sender_email ? n.sender_email.split('@')[0] : '...';
    bubble.innerHTML = (mine ? '' : `<span class="who">${escapeHtml(who)}</span>`) + escapeHtml(n.content);
    notesFeed.appendChild(bubble);
  });
  notesFeed.scrollTop = notesFeed.scrollHeight;
}

async function sendNote(){
  const content = noteInput.value.trim().slice(0, 80);
  if (!content || !myUserId) return;
  noteSendBtn.disabled = true;
  const { data: userData } = await sb.auth.getUser();
  const email = userData && userData.user ? userData.user.email : null;
  const { error } = await sb.from('notes').insert({ sender_id: myUserId, sender_email: email, content });
  noteSendBtn.disabled = false;
  if (error){ showToast('Erro ao enviar recado'); return; }
  noteInput.value = '';
  await loadNotes();
}
noteSendBtn.addEventListener('click', sendNote);
noteInput.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); sendNote(); } });

initAuth();