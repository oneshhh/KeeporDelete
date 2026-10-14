const api = window.keepOrDelete;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const elements = {
  screens: $$('.screen'),
  landing: $('#landingScreen'),
  loading: $('#loadingScreen'),
  triage: $('#triageScreen'),
  album: $('#albumScreen'),
  people: $('#peopleScreen'),
  review: $('#reviewScreen'),
  completion: $('#completionScreen'),
  mainNav: $('#mainNav'),
  sessionSidebar: $('#sessionSidebar'),
  folderCrumb: $('#folderCrumb'),
  statusText: $('#statusText'),
  toast: $('#toast'),
  mediaSurface: $('#mediaSurface'),
  mediaFrame: $('#mediaFrame'),
  mediaLoading: $('#mediaLoading'),
  livePlayButton: $('#livePlayButton'),
  soundButton: $('#soundButton'),
  confirmModal: $('#confirmModal')
};

const state = {
  folder: null,
  folderName: '',
  includeSubfolders: false,
  items: [],
  decisions: {},
  history: [],
  mode: 'photo',
  cursors: { photo: 0, video: 0 },
  selectedTrash: new Set(),
  muted: true,
  renderToken: 0,
  wheelLocked: false,
  originalLiveCount: 0,
  originalTotalBytes: 0,
  originalCounts: { total: 0, photos: 0, videos: 0, live: 0 },
  deletedStats: { itemCount: 0, fileCount: 0, bytes: 0 },
  pendingConfirmationIds: [],
  isDeleting: false,
  savedSession: null,
  faceEnabled: false,
  faceService: null,
  faceSnapshot: null,
  selectedPeople: new Set(),
  peopleMatchMode: 'any',
  activeFaceFilter: null,
  editingPersonId: null,
  pendingMergePersonIds: [],
  albumSort: 'newest',
  albumType: 'all',
  albumObserver: null,
  albumReturn: null
};

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  const digits = index >= 3 ? 2 : index === 2 ? 1 : 0;
  return `${value.toFixed(digits)} ${units[index]}`;
}

function formatMediaDate(timestamp, includeTime = true) {
  const date = new Date(Number(timestamp));
  if (!Number.isFinite(date.getTime()) || Number(timestamp) <= 0) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, includeTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' }
  ).format(date);
}

function setStatus(message) {
  elements.statusText.textContent = message;
}

let toastTimer;
function showToast(message, error = false) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle('error', error);
  elements.toast.classList.remove('hidden');
  toastTimer = setTimeout(() => elements.toast.classList.add('hidden'), 3500);
}

function showScreen(name) {
  if (state.albumReturn && !['triage', 'album'].includes(name)) clearAlbumReturn();
  elements.screens.forEach((screen) => screen.classList.remove('active'));
  elements[name].classList.add('active');
  const inSession = Boolean(state.folder);
  elements.mainNav.classList.toggle('hidden', !inSession || name === 'completion');
  const showSidebar = inSession && ['triage', 'album', 'people', 'review'].includes(name);
  elements.sessionSidebar.classList.toggle('hidden', !showSidebar);
  $$('.nav-button').forEach((button) => {
    const route = button.dataset.route;
    button.classList.toggle('active', route === name || (route === 'triage' && name === 'album'));
  });
}

function photoItems() {
  const items = state.items.filter((item) => item.kind === 'image' || item.kind === 'live');
  if (!state.activeFaceFilter) return items;
  return items.filter((item) => state.activeFaceFilter.ids.has(item.id));
}

function videoItems() {
  if (state.activeFaceFilter) return [];
  return state.items.filter((item) => item.kind === 'video');
}

function modeItems(mode = state.mode) {
  return mode === 'photo' ? photoItems() : videoItems();
}

function currentItem() {
  const items = modeItems();
  if (!items.length) return null;
  state.cursors[state.mode] = Math.min(Math.max(state.cursors[state.mode], 0), items.length - 1);
  return items[state.cursors[state.mode]];
}

function undecidedCount() {
  return state.items.filter((item) => !state.decisions[item.id]).length;
}

function scopedUndecidedCount() {
  return [...photoItems(), ...videoItems()].filter((item) => !state.decisions[item.id]).length;
}

function trashItems() {
  return state.items.filter((item) => state.decisions[item.id] === 'delete');
}

function updateSidebarStats() {
  const trash = trashItems();
  const decidedNow = state.items.filter((item) => Boolean(state.decisions[item.id])).length;
  const reviewed = decidedNow + state.deletedStats.itemCount;
  const total = state.originalCounts.total || state.items.length + state.deletedStats.itemCount;
  const reviewPercent = total ? Math.min(100, Math.round((reviewed / total) * 100)) : 0;
  const keptBytes = state.items.reduce(
    (sum, item) => sum + (state.decisions[item.id] === 'keep' ? item.size : 0),
    0
  );
  const reclaimedBytes = state.deletedStats.bytes + trash.reduce((sum, item) => sum + item.size, 0);

  $('#sidebarFolderName').textContent = state.folderName || 'Folder';
  $('#sidebarFolderPath').textContent = state.folder || '';
  $('#sidebarFolderPath').title = state.folder || '';
  $('#sidebarTotalStorage').textContent = formatBytes(state.originalTotalBytes);
  $('#sidebarSavedStorage').textContent = formatBytes(keptBytes);
  $('#sidebarReclaimedStorage').textContent = formatBytes(reclaimedBytes);
  $('#sidebarTotalItems').textContent = total;
  $('#sidebarPhotoCount').textContent = state.originalCounts.photos;
  $('#sidebarVideoCount').textContent = state.originalCounts.videos;
  $('#sidebarLiveCount').textContent = state.originalCounts.live;
  $('#sidebarReviewedCount').textContent = `${reviewed} of ${total}`;
  $('#sidebarReviewProgress').style.width = `${reviewPercent}%`;
}

function updateCounts() {
  const scopedItems = [...photoItems(), ...videoItems()];
  const decided = scopedItems.filter((item) => Boolean(state.decisions[item.id])).length;
  const total = scopedItems.length;
  const percent = total ? Math.round((decided / total) * 100) : 0;
  const trash = trashItems();

  $('#photoModeCount').textContent = photoItems().length;
  $('#videoModeCount').textContent = videoItems().length;
  $('#progressLabel').textContent = `${decided} of ${total} reviewed`;
  $('#progressPercent').textContent = `${percent}%`;
  $('#progressBar').style.width = `${percent}%`;
  $('#trashCount').textContent = trash.length;
  $('#navTrashCount').textContent = trash.length;
  $('#undoButton').disabled = state.history.length === 0;
  $('#previousButton').disabled = state.history.length === 0;
  $('#videoModeButton').disabled = Boolean(state.activeFaceFilter);
  updateSidebarStats();
}

function albumItems() {
  let items = [...state.items];
  if (state.albumType === 'photo') items = items.filter((item) => item.kind !== 'video');
  if (state.albumType === 'video') items = items.filter((item) => item.kind === 'video');

  const byName = (a, b) => a.name.localeCompare(b.name);
  if (state.albumSort === 'oldest') {
    return items.sort((a, b) => a.timestamp - b.timestamp || byName(a, b));
  }
  if (state.albumSort === 'largest') {
    return items.sort((a, b) => b.size - a.size || b.timestamp - a.timestamp || byName(a, b));
  }
  if (state.albumSort === 'smallest') {
    return items.sort((a, b) => a.size - b.size || b.timestamp - a.timestamp || byName(a, b));
  }
  return items.sort((a, b) => b.timestamp - a.timestamp || byName(a, b));
}

async function addAlbumThumbnail(card, item, token) {
  const thumb = card.querySelector('.album-thumb');
  try {
    const image = document.createElement('img');
    image.alt = '';
    image.src = await api.thumbnailUrl(item.path, item.kind);
    if (token !== state.renderToken || !card.isConnected) return;
    image.addEventListener('error', () => image.remove());
    thumb.prepend(image);
  } catch {}
}

function clearAlbumReturn() {
  state.albumReturn = null;
  $('#openAlbumButton').classList.remove('hidden');
  $('#backToAlbumButton').classList.add('hidden');
}

function returnToAlbum() {
  const destination = state.albumReturn;
  if (!destination) {
    showAlbum();
    return;
  }

  showScreen('album');
  clearAlbumReturn();
  requestAnimationFrame(() => {
    elements.album.scrollTop = destination.scrollTop;
    const card = $(`.album-card[data-id="${destination.itemId}"]`);
    if (!card) return;
    card.classList.add('album-return-target');
    card.setAttribute('aria-current', 'true');
    card.focus({ preventScroll: true });
    setTimeout(() => {
      card.classList.remove('album-return-target');
      card.removeAttribute('aria-current');
    }, 1600);
  });
  setStatus(`${state.items.length} media items in this library`);
}

function openAlbumItem(item) {
  if (state.activeFaceFilter) {
    state.activeFaceFilter = null;
    $('#faceFilterBanner').classList.add('hidden');
  }
  state.mode = item.kind === 'video' ? 'video' : 'photo';
  const items = modeItems();
  const index = items.findIndex((candidate) => candidate.id === item.id);
  state.cursors[state.mode] = Math.max(0, index);
  state.albumReturn = {
    itemId: item.id,
    scrollTop: elements.album.scrollTop
  };
  $('#openAlbumButton').classList.add('hidden');
  $('#backToAlbumButton').classList.remove('hidden');
  showScreen('triage');
  renderCurrentMedia();
  setStatus(`Opened ${item.name} from Album`);
}

function renderAlbum() {
  const items = albumItems();
  const token = ++state.renderToken;
  const grid = $('#albumGrid');
  const totalBytes = items.reduce((sum, item) => sum + item.size, 0);

  state.albumObserver?.disconnect();
  state.albumObserver = null;
  grid.replaceChildren();
  $('#albumSortSelect').value = state.albumSort;
  $('#albumTypeSelect').value = state.albumType;
  $('#albumCount').textContent = state.albumType === 'all'
    ? `${items.length} item${items.length === 1 ? '' : 's'}`
    : `${items.length} of ${state.items.length} items`;
  $('#albumSize').textContent = `${formatBytes(totalBytes)} shown`;
  $('#albumEmpty').classList.toggle('hidden', items.length > 0);
  grid.classList.toggle('hidden', items.length === 0);

  const itemsById = new Map(items.map((item) => [item.id, item]));
  if ('IntersectionObserver' in window) {
    state.albumObserver = new IntersectionObserver((entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        const card = entry.target.closest('.album-card');
        const item = itemsById.get(card?.dataset.id);
        if (card && item) addAlbumThumbnail(card, item, token);
      }
    }, { root: elements.album, rootMargin: '260px' });
  }

  for (const item of items) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'album-card';
    card.dataset.id = item.id;
    card.setAttribute('aria-label', `Open ${item.name} in sorting`);

    const thumb = document.createElement('div');
    thumb.className = 'album-thumb';
    const placeholder = document.createElement('div');
    placeholder.className = 'album-placeholder';
    placeholder.textContent = item.kind === 'video' ? '▶' : '◇';
    const kind = document.createElement('span');
    kind.className = 'album-kind';
    kind.textContent = item.kind === 'live' ? 'LIVE PHOTO' : item.kind.toUpperCase();
    thumb.append(placeholder, kind);

    const info = document.createElement('div');
    info.className = 'album-card-info';
    const name = document.createElement('strong');
    name.textContent = item.name;
    const date = document.createElement('span');
    date.className = 'album-card-date';
    date.textContent = formatMediaDate(item.timestamp, false);
    const details = document.createElement('span');
    details.className = 'album-card-details';
    details.textContent = `${formatBytes(item.size)} • ${item.extension.replace('.', '').toUpperCase()}`;
    info.append(name, date, details);
    card.append(thumb, info);
    card.addEventListener('click', () => openAlbumItem(item));
    grid.append(card);

    if (state.albumObserver) state.albumObserver.observe(thumb);
    else addAlbumThumbnail(card, item, token);
  }

  updateSidebarStats();
}

function showAlbum() {
  if (!state.folder) return;
  clearAlbumReturn();
  showScreen('album');
  renderAlbum();
  setStatus(`${state.items.length} media items in this library`);
}

function sessionPayload() {
  return {
    folder: state.folder,
    includeSubfolders: state.includeSubfolders,
    decisions: state.decisions,
    mode: state.mode,
    cursors: state.cursors,
    deletedStats: state.deletedStats,
    faceEnabled: state.faceEnabled,
    originalTotalBytes: state.originalTotalBytes,
    originalCounts: state.originalCounts
  };
}

async function saveSession() {
  if (!state.folder) return;
  try {
    await api.saveSession(sessionPayload());
  } catch (error) {
    setStatus('Could not save session progress');
  }
}

function setMediaLoading(isLoading, label = 'Preparing preview…') {
  elements.mediaLoading.querySelector('span').textContent = label;
  elements.mediaLoading.classList.toggle('hidden', !isLoading);
}

function makeVideoElement(item, liveMode, token) {
  const video = document.createElement('video');
  video.autoplay = true;
  video.loop = true;
  video.muted = state.muted;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('aria-label', item.name);
  let triedFallback = false;

  video.addEventListener('click', () => {
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  });

  video.addEventListener('error', async () => {
    if (triedFallback || token !== state.renderToken) return;
    triedFallback = true;
    setMediaLoading(true, 'Preparing a compatible video preview…');
    try {
      const sourcePath = liveMode ? item.companionPath : item.path;
      const fallbackUrl = await api.prepareVideo(sourcePath);
      if (token !== state.renderToken) return;
      video.src = fallbackUrl;
      video.load();
      await video.play().catch(() => {});
      setMediaLoading(false);
    } catch (error) {
      setMediaLoading(false);
      showMediaError('This video could not be previewed. You can still keep or delete it.');
    }
  });

  video.addEventListener('loadeddata', () => {
    if (token === state.renderToken) setMediaLoading(false);
  });
  return video;
}

function showMediaError(message) {
  elements.mediaSurface.replaceChildren();
  const panel = document.createElement('div');
  panel.className = 'thumb-placeholder';
  panel.textContent = message;
  elements.mediaSurface.append(panel);
}

async function renderVideo(item, liveMode, token) {
  setMediaLoading(true, liveMode ? 'Opening Live Photo…' : 'Opening video…');
  const video = makeVideoElement(item, liveMode, token);
  elements.mediaSurface.replaceChildren(video);
  try {
    const sourcePath = liveMode ? item.companionPath : item.path;
    video.src = await api.mediaUrl(sourcePath);
    if (token !== state.renderToken) return;
    video.load();
    await video.play().catch(() => {});
  } catch (error) {
    if (token === state.renderToken) {
      setMediaLoading(false);
      showMediaError('This video could not be opened. You can still keep or delete it.');
    }
  }
}

async function renderStill(item, token) {
  setMediaLoading(true, item.kind === 'live' ? 'Opening Live Photo…' : 'Opening photo…');
  const image = document.createElement('img');
  image.alt = item.name;
  image.addEventListener('load', () => {
    if (token === state.renderToken) setMediaLoading(false);
  });
  image.addEventListener('error', () => {
    if (token === state.renderToken) {
      setMediaLoading(false);
      showMediaError('This photo could not be previewed. You can still keep or delete it.');
    }
  });
  elements.mediaSurface.replaceChildren(image);
  try {
    image.src = await api.mediaUrl(item.path);
  } catch (error) {
    if (token === state.renderToken) {
      setMediaLoading(false);
      showMediaError('This photo could not be decoded. You can still keep or delete it.');
    }
  }
}

function updateModeUi() {
  $('#photoModeButton').classList.toggle('active', state.mode === 'photo');
  $('#videoModeButton').classList.toggle('active', state.mode === 'video');
  const isVideo = state.mode === 'video';
  elements.mediaFrame.classList.toggle('photo-frame', !isVideo);
  elements.mediaFrame.classList.toggle('video-frame', isVideo);
  $('#reelHint').classList.toggle('hidden', !isVideo);
}

async function renderCurrentMedia() {
  updateCounts();
  updateModeUi();
  const items = modeItems();
  const item = currentItem();
  const token = ++state.renderToken;

  if (!items.length || !item) {
    $('#mediaWorkspace').classList.add('hidden');
    $('#emptyMode').classList.remove('hidden');
    const otherMode = state.mode === 'photo' ? 'Videos' : 'Photos';
    $('#emptyModeTitle').textContent = `No ${state.mode === 'photo' ? 'photos' : 'videos'} found`;
    $('#emptyModeText').textContent = `Switch to ${otherMode} to continue.`;
    $('#emptyModeSwitch').textContent = `View ${otherMode}`;
    return;
  }

  $('#mediaWorkspace').classList.remove('hidden');
  $('#emptyMode').classList.add('hidden');
  $('#mediaName').textContent = item.name;
  $('#mediaDate').textContent = formatMediaDate(item.timestamp);
  $('#mediaDetails').textContent = `${formatBytes(item.size)} • ${state.cursors[state.mode] + 1} of ${items.length}`;
  $('#kindBadge').textContent = item.kind === 'live' ? 'LIVE PHOTO' : item.kind.toUpperCase();
  $('#formatBadge').textContent = item.extension.replace('.', '').toUpperCase();
  elements.livePlayButton.classList.toggle('hidden', item.kind !== 'live');
  elements.soundButton.classList.toggle('hidden', item.kind !== 'video');
  elements.soundButton.textContent = state.muted ? '🔇' : '🔊';

  const decision = state.decisions[item.id];
  elements.mediaFrame.style.borderColor = decision === 'keep'
    ? 'rgba(75, 226, 119, 0.48)'
    : decision === 'delete'
      ? 'rgba(255, 116, 111, 0.48)'
      : '';

  if (item.kind === 'video') await renderVideo(item, false, token);
  else await renderStill(item, token);

  elements.livePlayButton.onclick = async () => {
    if (item.kind !== 'live') return;
    const existingVideo = elements.mediaSurface.querySelector('video');
    if (existingVideo) {
      if (existingVideo.paused) {
        await existingVideo.play().catch(() => {});
        elements.livePlayButton.textContent = 'Ⅱ Pause Live Photo';
      } else {
        existingVideo.pause();
        elements.livePlayButton.textContent = '▶ Play Live Photo';
      }
      return;
    }
    elements.livePlayButton.textContent = 'Ⅱ Pause Live Photo';
    await renderVideo(item, true, token);
  };
}

function setMode(mode) {
  if (mode !== 'photo' && mode !== 'video') return;
  if (state.activeFaceFilter && mode === 'video') return;
  state.mode = mode;
  renderCurrentMedia();
  saveSession();
}

function findNextUndecided(mode, afterIndex) {
  const items = modeItems(mode);
  if (!items.length) return -1;
  for (let offset = 1; offset <= items.length; offset += 1) {
    const index = (afterIndex + offset) % items.length;
    if (!state.decisions[items[index].id]) return index;
  }
  return -1;
}

function choose(action) {
  if (!elements.triage.classList.contains('active')) return;
  const item = currentItem();
  if (!item) return;

  state.history.push({
    id: item.id,
    previous: state.decisions[item.id] || null,
    mode: state.mode,
    cursor: state.cursors[state.mode]
  });
  state.decisions[item.id] = action;

  const frameClass = action === 'keep' ? 'decision-keep-flash' : 'decision-delete-flash';
  elements.mediaFrame.classList.add(frameClass);
  setTimeout(() => elements.mediaFrame.classList.remove(frameClass), 160);

  const next = findNextUndecided(state.mode, state.cursors[state.mode]);
  if (next >= 0) {
    state.cursors[state.mode] = next;
    renderCurrentMedia();
  } else {
    const otherMode = state.mode === 'photo' ? 'video' : 'photo';
    const otherNext = findNextUndecided(otherMode, state.cursors[otherMode] - 1);
    if (otherNext >= 0) {
      state.cursors[otherMode] = otherNext;
      setMode(otherMode);
    } else if (scopedUndecidedCount() === 0) {
      if (state.activeFaceFilter) {
        saveSession();
        updateCounts();
        showPeople();
        showToast('All matching photos reviewed. Trash choices are ready for the final check.');
      } else if (undecidedCount() === 0) {
        openReview();
      } else {
        renderCurrentMedia();
      }
    } else {
      renderCurrentMedia();
    }
  }
  saveSession();
}

function undoLast(message = 'Last decision undone') {
  const previousAction = state.history.pop();
  if (!previousAction) return false;
  if (previousAction.previous) state.decisions[previousAction.id] = previousAction.previous;
  else delete state.decisions[previousAction.id];
  state.mode = previousAction.mode;
  state.cursors[state.mode] = previousAction.cursor;
  showScreen('triage');
  renderCurrentMedia();
  saveSession();
  showToast(message);
  return true;
}

function revisitPrevious() {
  if (!undoLast('Previous item reopened — choose Keep or Delete again.')) {
    showToast('There is no previous decision yet.');
  }
}

function navigateVideo(direction) {
  if (state.mode !== 'video' || !elements.triage.classList.contains('active')) return;
  const items = videoItems();
  if (items.length < 2) return;
  const next = (state.cursors.video + direction + items.length) % items.length;
  state.cursors.video = next;
  renderCurrentMedia();
  saveSession();
}

function togglePlayback() {
  const item = currentItem();
  if (!item) return;
  const video = elements.mediaSurface.querySelector('video');
  if (!video && item.kind === 'live') {
    elements.livePlayButton.click();
    return;
  }
  if (!video) return;
  if (video.paused) video.play().catch(() => {});
  else video.pause();
}

function toggleSound() {
  state.muted = !state.muted;
  const video = elements.mediaSurface.querySelector('video');
  if (video) video.muted = state.muted;
  elements.soundButton.textContent = state.muted ? '🔇' : '🔊';
}

function faceGroups() {
  return state.faceSnapshot?.groups || [];
}

function selectedFaceGroups() {
  const selected = state.selectedPeople;
  return faceGroups().filter((group) => selected.has(group.id));
}

function matchingFaceItems() {
  if (!state.faceService || !state.selectedPeople.size) return [];
  const ids = new Set(
    state.faceService.matchingItemIds([...state.selectedPeople], state.peopleMatchMode)
  );
  return state.items.filter((item) => ids.has(item.id));
}

function setAvatar(container, thumbnail, fallback) {
  container.replaceChildren();
  if (thumbnail) {
    const image = document.createElement('img');
    image.src = thumbnail;
    image.alt = '';
    container.append(image);
  } else {
    container.textContent = fallback;
  }
}

function renderFaceScanStatus() {
  const status = state.faceSnapshot?.status || {
    phase: 'idle', completed: 0, total: 0, message: 'Preparing face grouping', error: ''
  };
  const percent = status.total ? Math.round((status.completed / status.total) * 100) : 0;
  const titles = {
    idle: 'Preparing face grouping',
    ready: 'Ready to scan',
    loading: 'Loading offline face engine',
    scanning: `Scanning ${status.completed + 1} of ${status.total}`,
    paused: 'Scan paused',
    cancelled: 'Scan stopped',
    complete: 'Face grouping is up to date',
    error: 'Face grouping needs attention'
  };
  $('#faceScanTitle').textContent = titles[status.phase] || 'Face grouping';
  $('#faceScanDetail').textContent = status.error || (
    status.currentName ? `${status.message} ${status.currentName}` : status.message
  );
  $('#faceScanPercent').textContent = `${Math.min(100, percent)}%`;
  $('#faceScanBar').style.width = `${Math.min(100, percent)}%`;
  $('#faceScanCard').classList.toggle('error', status.phase === 'error');
  const isScanning = status.phase === 'scanning' || status.phase === 'paused';
  $('#pauseFaceScanButton').classList.toggle('hidden', !isScanning);
  $('#cancelFaceScanButton').classList.toggle('hidden', !isScanning);
  $('#pauseFaceScanButton').textContent = status.phase === 'paused' ? 'Resume' : 'Pause';
  const busy = status.phase === 'scanning' || status.phase === 'loading' || status.phase === 'paused';
  $('#rescanFacesButton').disabled = busy;
  $('#addMePhotosButton').disabled = busy;
}

function updatePeopleSelection() {
  const validIds = new Set(faceGroups().map((group) => group.id));
  state.selectedPeople = new Set([...state.selectedPeople].filter((id) => validIds.has(id)));
  const groups = selectedFaceGroups();
  const matches = matchingFaceItems();
  const bytes = matches.reduce((sum, item) => sum + item.size, 0);
  const names = groups.map((group) => group.name);
  $('#peopleActionDock').classList.toggle('hidden', groups.length === 0);
  $('#selectedPeopleLabel').textContent = `${groups.length} ${groups.length === 1 ? 'person' : 'people'} selected`;
  $('#peopleMatchSummary').textContent = `${matches.length} matching photo${matches.length === 1 ? '' : 's'} • ${formatBytes(bytes)}`;
  $('#matchAnyButton').classList.toggle('active', state.peopleMatchMode === 'any');
  $('#matchAllButton').classList.toggle('active', state.peopleMatchMode === 'all');
  $('#sortMatchingButton').disabled = matches.length === 0;
  $('#trashMatchingButton').disabled = !matches.some((item) => !state.decisions[item.id]);
  $('#mergePeopleButton').classList.toggle('hidden', groups.length < 2);
  $('#sortMatchingButton').title = names.length ? `Sort photos matching ${names.join(', ')}` : '';
  $$('.person-card').forEach((card) => {
    card.classList.toggle('selected', state.selectedPeople.has(card.dataset.personId));
  });
}

function renderPeoplePage() {
  renderFaceScanStatus();
  const profile = state.faceSnapshot?.profile;
  $('#meNameInput').value = profile?.name || 'Me';
  $('#meReferenceStatus').textContent = profile
    ? `${profile.referenceCount} reference photo${profile.referenceCount === 1 ? '' : 's'} saved locally`
    : 'No reference photos added';
  setAvatar($('#meAvatar'), profile?.thumbnail, 'ME');

  const query = $('#peopleSearchInput').value.trim().toLowerCase();
  const allGroups = faceGroups();
  const groups = allGroups.filter((group) => {
    if (!query) return true;
    return group.name.toLowerCase().includes(query)
      || (group.tags || []).some((tag) => tag.toLowerCase().includes(query));
  });
  $('#peopleSummary').textContent = `${allGroups.length} ${allGroups.length === 1 ? 'person' : 'people'} found`;
  $('#peopleEmpty').classList.toggle('hidden', groups.length > 0);
  const facePhase = state.faceSnapshot?.status.phase;
  $('#peopleEmptyTitle').textContent = facePhase === 'scanning' || facePhase === 'loading'
    ? 'Looking for people…'
    : query
      ? 'No matching people'
      : 'No clear faces found';
  $('#peopleEmptyText').textContent = facePhase === 'scanning' || facePhase === 'loading'
    ? 'You can leave this page while the local scan continues.'
    : query
      ? 'Try another name or tag.'
      : 'Clear, front-facing photos usually group best. You can rescan at any time.';
  const grid = $('#peopleGrid');
  grid.replaceChildren();

  for (const group of groups) {
    const card = document.createElement('article');
    card.className = `person-card${state.selectedPeople.has(group.id) ? ' selected' : ''}`;
    card.dataset.personId = group.id;
    card.tabIndex = 0;

    const face = document.createElement('div');
    face.className = 'person-face';
    setAvatar(face, group.thumbnail, group.name.slice(0, 1).toUpperCase());
    const mark = document.createElement('span');
    mark.className = 'person-selected-mark';
    mark.textContent = '✓';
    face.append(mark);

    const copy = document.createElement('div');
    copy.className = 'person-card-copy';
    const name = document.createElement('strong');
    name.textContent = group.name;
    const details = document.createElement('span');
    const tagText = group.tags?.filter((tag) => tag !== 'Me').join(', ');
    details.textContent = `${group.photoIds.length} photo${group.photoIds.length === 1 ? '' : 's'}${tagText ? ` • ${tagText}` : ''}${group.manuallyCombined ? ' • Corrected match' : ''}`;
    copy.append(name, details);

    const edit = document.createElement('button');
    edit.className = 'person-edit-button';
    edit.textContent = '✎';
    edit.type = 'button';
    edit.title = 'Edit name and tags';
    edit.addEventListener('click', (event) => {
      event.stopPropagation();
      openPersonEditor(group.id);
    });
    const toggle = () => {
      if (state.selectedPeople.has(group.id)) state.selectedPeople.delete(group.id);
      else state.selectedPeople.add(group.id);
      updatePeopleSelection();
    };
    card.addEventListener('click', toggle);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggle();
      }
    });
    card.append(face, copy, edit);
    grid.append(card);
  }
  updatePeopleSelection();
}

function showPeople() {
  if (!state.faceEnabled || !state.faceService) {
    showToast('Enable Group photos by people when choosing a folder.', true);
    return;
  }
  showScreen('people');
  renderPeoplePage();
  setStatus('People are grouped privately on this computer');
}

async function initializeFaceGrouping(autoScan = true) {
  if (!state.faceEnabled || !state.folder) return;
  state.faceService?.cancel();
  const service = new window.FaceGroupingService(api, (snapshot) => {
    if (state.faceService !== service) return;
    state.faceSnapshot = snapshot;
    if (elements.people.classList.contains('active')) renderPeoplePage();
  });
  state.faceService = service;
  state.faceSnapshot = await service.load(state.folder, state.items);
  renderPeoplePage();
  if (autoScan && state.faceSnapshot.status.phase === 'ready') {
    service.scan().catch((error) => {
      if (state.faceService !== service) return;
      showToast(error.message || 'Face grouping could not finish.', true);
    });
  }
}

function setPeopleMatchMode(mode) {
  state.peopleMatchMode = mode === 'all' ? 'all' : 'any';
  updatePeopleSelection();
}

function startMatchingTriage() {
  const groups = selectedFaceGroups();
  const matches = matchingFaceItems();
  if (!groups.length || !matches.length) return;
  const connector = state.peopleMatchMode === 'all' ? ' + ' : ' or ';
  state.activeFaceFilter = {
    ids: new Set(matches.map((item) => item.id)),
    label: groups.map((group) => group.name).join(connector)
  };
  state.mode = 'photo';
  state.cursors.photo = Math.max(0, matches.findIndex((item) => !state.decisions[item.id]));
  $('#faceFilterLabel').textContent = `${matches.length} ${matches.length === 1 ? 'photo' : 'photos'} matching ${state.activeFaceFilter.label}`;
  $('#faceFilterBanner').classList.remove('hidden');
  showScreen('triage');
  renderCurrentMedia();
  setStatus(`Sorting ${matches.length} matching photos`);
}

function clearPeopleFilter(returnToPeople = false) {
  state.activeFaceFilter = null;
  $('#faceFilterBanner').classList.add('hidden');
  state.cursors.photo = 0;
  if (returnToPeople) showPeople();
  else {
    showScreen('triage');
    renderCurrentMedia();
  }
}

async function addMatchingToTrash() {
  const matches = matchingFaceItems();
  const undecided = matches.filter((item) => !state.decisions[item.id]);
  if (!undecided.length) return;
  undecided.forEach((item) => { state.decisions[item.id] = 'delete'; });
  await saveSession();
  openReview();
  showToast(`${undecided.length} matching photo${undecided.length === 1 ? '' : 's'} added for review. Nothing has been deleted yet.`);
}

function openPersonEditor(id) {
  const group = faceGroups().find((entry) => entry.id === id);
  if (!group) return;
  state.editingPersonId = id;
  $('#editPersonName').value = group.name;
  $('#editPersonTags').value = (group.tags || []).filter((tag) => tag !== 'Me').join(', ');
  setAvatar($('#editPersonAvatar'), group.thumbnail, group.name.slice(0, 1).toUpperCase());
  $('#hidePersonButton').classList.toggle('hidden', group.isMe);
  $('#undoPersonMergeButton').classList.toggle('hidden', !group.manuallyCombined);
  $('#editPersonModal').classList.remove('hidden');
  $('#editPersonName').focus();
}

function openMergePeopleModal() {
  const groups = selectedFaceGroups();
  if (groups.length < 2) return;
  state.pendingMergePersonIds = groups.map((group) => group.id);
  const preview = $('#mergePeoplePreview');
  preview.replaceChildren();
  groups.slice(0, 4).forEach((group) => {
    const avatar = document.createElement('span');
    avatar.className = 'merge-preview-avatar';
    setAvatar(avatar, group.thumbnail, group.name.slice(0, 1).toUpperCase());
    preview.append(avatar);
  });
  const preferredName = groups.find((group) => group.isMe)?.name
    || groups.find((group) => !/^Person \d+$/i.test(group.name))?.name
    || groups[0].name;
  $('#mergePersonName').value = preferredName;
  $('#mergePeopleDescription').textContent = `Combine ${groups.length} groups (${groups.map((group) => group.name).join(', ')}) because they are the same person.`;
  $('#mergePeopleModal').classList.remove('hidden');
  $('#mergePersonName').focus();
  $('#mergePersonName').select();
}

function closeMergePeopleModal() {
  state.pendingMergePersonIds = [];
  $('#mergePeopleModal').classList.add('hidden');
}

async function confirmPeopleMerge() {
  if (state.pendingMergePersonIds.length < 2 || !state.faceService) return;
  $('#confirmMergePeopleButton').disabled = true;
  $('#confirmMergePeopleButton').textContent = 'Combining…';
  try {
    const merged = await state.faceService.mergeGroups(
      state.pendingMergePersonIds,
      $('#mergePersonName').value
    );
    closeMergePeopleModal();
    state.selectedPeople = new Set(merged ? [merged.id] : []);
    renderPeoplePage();
    showToast('Correction saved. These face groups will now be treated as one person.');
  } catch (error) {
    showToast(error.message || 'The face groups could not be combined.', true);
  } finally {
    $('#confirmMergePeopleButton').disabled = false;
    $('#confirmMergePeopleButton').textContent = 'Yes, Same Person';
  }
}

async function undoPersonMerge() {
  const id = state.editingPersonId;
  if (!id || !state.faceService) return;
  try {
    const undone = await state.faceService.unmergeGroup(id);
    closePersonEditor();
    state.selectedPeople.clear();
    renderPeoplePage();
    showToast(undone
      ? 'Correction removed. The app separated the automatic face groups again.'
      : 'This group was not manually combined.');
  } catch (error) {
    showToast(error.message || 'The correction could not be removed.', true);
  }
}

function closePersonEditor() {
  state.editingPersonId = null;
  $('#editPersonModal').classList.add('hidden');
}

async function savePersonEdits() {
  if (!state.editingPersonId) return;
  const tags = $('#editPersonTags').value.split(',');
  await state.faceService.updateGroup(state.editingPersonId, {
    name: $('#editPersonName').value,
    tags
  });
  closePersonEditor();
  showToast('Person name and tags saved locally');
}

async function hideEditedPerson() {
  if (!state.editingPersonId) return;
  const id = state.editingPersonId;
  state.selectedPeople.delete(id);
  await state.faceService.updateGroup(id, { hidden: true });
  closePersonEditor();
  showToast('This group is hidden');
}

async function addMeReferences() {
  if (!state.faceService) return;
  $('#addMePhotosButton').disabled = true;
  $('#addMePhotosButton').textContent = 'Checking Photos…';
  try {
    const result = await state.faceService.enrollMe($('#meNameInput').value);
    if (result.cancelled) return;
    if (!result.accepted) {
      showToast('No usable reference photo was found. Choose a clear image with one face.', true);
    } else {
      const rejected = result.rejected.length ? ` ${result.rejected.length} photo${result.rejected.length === 1 ? ' was' : 's were'} skipped.` : '';
      showToast(`${result.accepted} reference photo${result.accepted === 1 ? '' : 's'} saved.${rejected}`);
    }
  } catch (error) {
    showToast(error.message || 'The reference photos could not be added.', true);
  } finally {
    $('#addMePhotosButton').disabled = false;
    $('#addMePhotosButton').textContent = 'Add Reference Photos';
    renderPeoplePage();
  }
}

async function startFolder(folder, includeSubfolders, restoredSession = null, faceEnabled = null) {
  state.faceService?.cancel();
  showScreen('loading');
  $('#loadingFolder').textContent = folder;
  setStatus('Scanning folder…');

  try {
    const result = await api.scanFolder(folder, includeSubfolders);
    if (!result.items.length) {
      resetToLanding(false);
      showToast('No supported photos or videos were found in that folder.', true);
      return;
    }

    state.folder = result.folder;
    state.folderName = result.folderName;
    state.includeSubfolders = includeSubfolders;
    state.items = result.items;
    state.originalLiveCount = result.liveCount;
    state.originalTotalBytes = result.totalBytes;
    state.originalCounts = {
      total: result.items.length,
      photos: result.photoCount,
      videos: result.videoCount,
      live: result.liveCount
    };
    state.decisions = {};
    state.history = [];
    state.cursors = { photo: 0, video: 0 };
    state.deletedStats = { itemCount: 0, fileCount: 0, bytes: 0 };
    state.selectedPeople = new Set();
    state.activeFaceFilter = null;
    state.albumSort = 'newest';
    state.albumType = 'all';
    state.albumObserver?.disconnect();
    state.albumObserver = null;
    state.albumReturn = null;
    state.faceService = null;
    state.faceSnapshot = null;
    state.faceEnabled = faceEnabled === null
      ? Boolean(restoredSession?.faceEnabled)
      : Boolean(faceEnabled);

    if (restoredSession) {
      const validIds = new Set(result.items.map((item) => item.id));
      state.decisions = Object.fromEntries(
        Object.entries(restoredSession.decisions || {}).filter(
          ([id, decision]) => validIds.has(id) && (decision === 'keep' || decision === 'delete')
        )
      );
      state.mode = restoredSession.mode === 'video' ? 'video' : 'photo';
      state.cursors = {
        photo: Number(restoredSession.cursors?.photo) || 0,
        video: Number(restoredSession.cursors?.video) || 0
      };
      state.deletedStats = restoredSession.deletedStats || state.deletedStats;
    } else {
      state.mode = result.photoCount ? 'photo' : 'video';
    }

    elements.folderCrumb.textContent = result.folderName;
    $('#includeSubfolders').checked = includeSubfolders;
    $('#enableFaceGrouping').checked = state.faceEnabled;
    $('#peopleNavButton').classList.toggle('hidden', !state.faceEnabled);
    $('#faceFilterBanner').classList.add('hidden');
    showScreen('triage');
    setStatus(`${result.photoCount} photos • ${result.videoCount} videos • ${formatBytes(result.totalBytes)}`);
    await renderCurrentMedia();
    await saveSession();

    if (state.faceEnabled) {
      await initializeFaceGrouping(true);
      showPeople();
    }

    if (result.errors.length) {
      showToast(`${result.errors.length} folder${result.errors.length === 1 ? '' : 's'} could not be read.`, true);
    } else if (restoredSession) {
      showToast('Session restored');
    }
  } catch (error) {
    resetToLanding(false);
    showToast(error.message || 'The folder could not be opened.', true);
  }
}

async function chooseFolder() {
  try {
    const folder = await api.selectFolder();
    if (!folder) return;
    await startFolder(
      folder,
      $('#includeSubfolders').checked,
      null,
      $('#enableFaceGrouping').checked
    );
  } catch (error) {
    showToast(error.message || 'The folder picker could not be opened.', true);
  }
}

function updateReviewSelection() {
  const items = trashItems();
  const selected = items.filter((item) => state.selectedTrash.has(item.id));
  const selectedBytes = selected.reduce((sum, item) => sum + item.size, 0);
  $('#reviewCount').textContent = `${selected.length} of ${items.length} selected`;
  $('#reviewSize').textContent = `${formatBytes(selectedBytes)} selected`;
  $('#selectAllTrash').checked = items.length > 0 && selected.length === items.length;
  $('#selectAllTrash').indeterminate = selected.length > 0 && selected.length < items.length;
  $('#restoreSelectedButton').disabled = selected.length === 0;
  $('#deleteSelectedButton').disabled = selected.length === 0;
}

async function addThumbnail(card, item, token) {
  const thumb = card.querySelector('.review-thumb');
  try {
    const image = document.createElement('img');
    image.alt = item.name;
    image.src = await api.thumbnailUrl(item.path, item.kind);
    if (token !== state.renderToken || !card.isConnected) return;
    image.addEventListener('error', () => image.remove());
    thumb.prepend(image);
  } catch {}
}

function renderReview() {
  const items = trashItems();
  const grid = $('#reviewGrid');
  const token = ++state.renderToken;
  grid.replaceChildren();
  $('#reviewEmpty').classList.toggle('hidden', items.length > 0);
  grid.classList.toggle('hidden', items.length === 0);

  for (const item of items) {
    const card = document.createElement('article');
    card.className = `review-card${state.selectedTrash.has(item.id) ? ' selected' : ''}`;
    card.dataset.id = item.id;

    const thumb = document.createElement('div');
    thumb.className = 'review-thumb';
    const placeholder = document.createElement('div');
    placeholder.className = 'thumb-placeholder';
    placeholder.textContent = item.kind === 'video' ? '▶' : '◇';
    const check = document.createElement('span');
    check.className = 'review-check';
    check.textContent = '✓';
    const kind = document.createElement('span');
    kind.className = 'review-kind';
    kind.textContent = item.kind === 'live' ? 'LIVE PHOTO' : item.kind.toUpperCase();
    thumb.append(placeholder, check, kind);

    const info = document.createElement('div');
    info.className = 'review-card-info';
    const name = document.createElement('strong');
    name.textContent = item.name;
    const details = document.createElement('span');
    details.textContent = `${formatBytes(item.size)}${item.fileCount > 1 ? ' • 2 linked files' : ''}`;
    info.append(name, details);
    card.append(thumb, info);

    card.addEventListener('click', () => {
      if (state.selectedTrash.has(item.id)) state.selectedTrash.delete(item.id);
      else state.selectedTrash.add(item.id);
      card.classList.toggle('selected', state.selectedTrash.has(item.id));
      updateReviewSelection();
    });

    grid.append(card);
    addThumbnail(card, item, token);
  }
  updateReviewSelection();
}

function openReview() {
  const items = trashItems();
  state.selectedTrash = new Set(items.map((item) => item.id));
  showScreen('review');
  renderReview();
  setStatus('Review before anything is moved to the Recycle Bin');
}

function restoreSelected() {
  const ids = [...state.selectedTrash];
  if (!ids.length) return;
  ids.forEach((id) => {
    state.decisions[id] = 'keep';
  });
  state.selectedTrash.clear();
  renderReview();
  updateCounts();
  saveSession();
  showToast(`${ids.length} item${ids.length === 1 ? '' : 's'} restored to Keep`);
}

function requestDeleteConfirmation() {
  const selected = trashItems().filter((item) => state.selectedTrash.has(item.id));
  if (!selected.length) return;
  state.pendingConfirmationIds = selected.map((item) => item.id);
  const fileCount = selected.reduce((sum, item) => sum + item.fileCount, 0);
  const bytes = selected.reduce((sum, item) => sum + item.size, 0);
  $('#confirmCount').textContent = `${selected.length} media item${selected.length === 1 ? '' : 's'} • ${fileCount} file${fileCount === 1 ? '' : 's'}`;
  $('#confirmSize').textContent = formatBytes(bytes);
  $('#deleteProgressSection').classList.add('hidden');
  $('#deleteProgressLabel').textContent = `Moving 0 of ${selected.length}`;
  $('#deleteProgressItem').textContent = 'Preparing…';
  $('#deleteProgressBar').style.width = '0%';
  $('#cancelDeleteButton').disabled = false;
  elements.confirmModal.classList.remove('hidden');
  $('#confirmDeleteButton').focus();
}

function closeConfirmation() {
  elements.confirmModal.classList.add('hidden');
  state.isDeleting = false;
  state.pendingConfirmationIds = [];
  $('#confirmDeleteButton').disabled = false;
  $('#confirmDeleteButton').textContent = 'Confirm';
  $('#cancelDeleteButton').disabled = false;
  $('#deleteProgressSection').classList.add('hidden');
}

async function confirmDeletion() {
  if (state.isDeleting) return;
  const ids = [...state.pendingConfirmationIds];
  if (!ids.length) return;
  const selectedItems = new Map(
    state.items.filter((item) => ids.includes(item.id)).map((item) => [item.id, item])
  );

  state.isDeleting = true;
  $('#confirmDeleteButton').disabled = true;
  $('#confirmDeleteButton').textContent = 'Moving…';
  $('#cancelDeleteButton').disabled = true;
  $('#deleteProgressSection').classList.remove('hidden');
  $('#deleteProgressLabel').textContent = `Moving 0 of ${ids.length}`;
  $('#deleteProgressItem').textContent = 'Preparing the first item…';
  $('#deleteProgressBar').style.width = '0%';
  setStatus('Moving selected files to the Windows Recycle Bin…');

  try {
    const results = await api.moveToTrash(ids);
    await new Promise((resolve) => setTimeout(resolve, 260));
    const succeeded = results.filter((result) => result.success);
    const failed = results.filter((result) => !result.success);

    for (const result of succeeded) {
      const item = selectedItems.get(result.id);
      if (item) {
        state.deletedStats.itemCount += 1;
        state.deletedStats.fileCount += result.movedFileCount || item.fileCount;
        state.deletedStats.bytes += item.size;
      }
      delete state.decisions[result.id];
    }
    const succeededIds = new Set(succeeded.map((result) => result.id));
    state.items = state.items.filter((item) => !succeededIds.has(item.id));
    if (state.activeFaceFilter) {
      state.activeFaceFilter.ids = new Set(
        [...state.activeFaceFilter.ids].filter((id) => !succeededIds.has(id))
      );
    }
    if (state.faceService && succeededIds.size) {
      await state.faceService.removeItems([...succeededIds]).catch(() => {});
    }
    state.selectedTrash = new Set(failed.map((result) => result.id));
    closeConfirmation();
    updateCounts();

    if (failed.length) {
      renderReview();
      showToast(`${failed.length} item${failed.length === 1 ? '' : 's'} could not be moved. Nothing else was changed.`, true);
      setStatus('Some files could not be moved to the Recycle Bin');
      await saveSession();
      return;
    }

    if (undecidedCount() > 0) {
      if (state.activeFaceFilter && state.faceEnabled) showPeople();
      else {
        showScreen('triage');
        renderCurrentMedia();
      }
      showToast('Selected items moved to the Recycle Bin. Continue sorting the remaining media.');
      await saveSession();
      return;
    }

    if (trashItems().length) {
      openReview();
      showToast('Selected items moved to the Recycle Bin');
      await saveSession();
      return;
    }

    await showCompletion();
  } catch (error) {
    closeConfirmation();
    showToast(error.message || 'The files could not be moved to the Recycle Bin.', true);
    setStatus('Deletion cancelled because an error occurred');
  }
}

async function showCompletion() {
  const kept = state.items.filter((item) => state.decisions[item.id] === 'keep').length;
  $('#completeFolder').textContent = state.folder;
  $('#completeKept').textContent = kept;
  $('#completeDeleted').textContent = state.deletedStats.itemCount;
  $('#completeFreed').textContent = `${formatBytes(state.deletedStats.bytes)} reclaimed`;
  $('#completeLive').textContent = state.originalLiveCount;
  showScreen('completion');
  setStatus('All changes saved');
  await api.clearSession();
}

function finishIfReady() {
  if (undecidedCount() > 0) {
    showScreen('triage');
    renderCurrentMedia();
    showToast('Continue sorting the remaining media.');
  } else {
    showCompletion();
  }
}

function resetToLanding(clearSaved = false) {
  state.faceService?.cancel();
  state.folder = null;
  state.folderName = '';
  state.items = [];
  state.decisions = {};
  state.history = [];
  state.originalLiveCount = 0;
  state.originalTotalBytes = 0;
  state.originalCounts = { total: 0, photos: 0, videos: 0, live: 0 };
  state.selectedTrash.clear();
  state.isDeleting = false;
  state.deletedStats = { itemCount: 0, fileCount: 0, bytes: 0 };
  state.faceEnabled = false;
  state.faceService = null;
  state.faceSnapshot = null;
  state.selectedPeople = new Set();
  state.activeFaceFilter = null;
  state.albumSort = 'newest';
  state.albumType = 'all';
  state.albumObserver?.disconnect();
  state.albumObserver = null;
  state.albumReturn = null;
  clearAlbumReturn();
  $('#peopleNavButton').classList.add('hidden');
  $('#faceFilterBanner').classList.add('hidden');
  $('#enableFaceGrouping').checked = false;
  elements.folderCrumb.textContent = 'Choose a folder';
  showScreen('landing');
  setStatus('Ready');
  if (clearSaved) api.clearSession();
}

async function goHome() {
  if (!state.folder) {
    showScreen('landing');
    return;
  }
  state.savedSession = sessionPayload();
  $('#resumeCard').classList.remove('hidden');
  $('#resumeFolder').textContent = state.folder;
  $('#includeSubfolders').checked = state.includeSubfolders;
  $('#enableFaceGrouping').checked = state.faceEnabled;
  await saveSession();
  showScreen('landing');
  setStatus('Current folder saved — choose another folder or resume');
}

async function initialize() {
  api.onTrashProgress((progress) => {
    if (!state.isDeleting) return;
    const percent = progress.total ? Math.round((progress.completed / progress.total) * 100) : 0;
    $('#deleteProgressLabel').textContent = `Moving ${progress.completed} of ${progress.total}`;
    $('#deleteProgressItem').textContent = progress.success
      ? `${progress.name} moved`
      : `${progress.name} could not be moved`;
    $('#deleteProgressBar').style.width = `${percent}%`;
  });
  const version = await api.version();
  $('#versionText').textContent = `Version ${version}`;
  state.savedSession = await api.loadSession();
  if (state.savedSession?.folder) {
    $('#resumeCard').classList.remove('hidden');
    $('#resumeFolder').textContent = state.savedSession.folder;
    $('#includeSubfolders').checked = Boolean(state.savedSession.includeSubfolders);
    $('#enableFaceGrouping').checked = Boolean(state.savedSession.faceEnabled);
  }

  if (await api.isTestMode()) {
    window.__kodTest = {
      facePhase: () => state.faceSnapshot?.status.phase || 'idle',
      faceIndexedCount: () => state.faceSnapshot?.indexedCount || 0,
      injectFaceGroups: () => {
        if (!state.faceService) throw new Error('Face grouping is not active.');
        const photos = state.items.filter((item) => item.kind === 'image' || item.kind === 'live');
        if (photos.length < 2) throw new Error('The face test needs at least two photos.');
        const alexDescriptor = new Array(128).fill(0);
        const alexAngleDescriptor = new Array(128).fill(0.01);
        const samDescriptor = new Array(128).fill(0.2);
        state.faceService.index.files[photos[0].id].faces = [
          { groupId: 'test-alex', descriptor: alexDescriptor, thumbnail: '' }
        ];
        state.faceService.index.files[photos[1].id].faces = [
          { groupId: 'test-alex', descriptor: alexAngleDescriptor, thumbnail: '' },
          { groupId: 'test-sam', descriptor: samDescriptor, thumbnail: '' }
        ];
        state.faceService.index.groups = [
          {
            id: 'test-alex', name: 'Alex', tags: ['Family'], isMe: false, hidden: false,
            centroid: alexDescriptor, thumbnail: '', photoIds: [photos[0].id, photos[1].id], faceCount: 2
          },
          {
            id: 'test-sam', name: 'Sam', tags: ['Friends'], isMe: false, hidden: false,
            centroid: samDescriptor, thumbnail: '', photoIds: [photos[1].id], faceCount: 1
          }
        ];
        state.faceSnapshot = state.faceService.snapshot();
        renderPeoplePage();
      },
      simulateManualCorrectionReload: () => {
        for (const file of Object.values(state.faceService.index.files)) {
          for (const face of file.faces || []) delete face.manualIdentityId;
        }
        state.faceService.regroup();
        state.faceSnapshot = state.faceService.snapshot();
        renderPeoplePage();
      }
    };
  }
}

$('#minimizeWindow').addEventListener('click', () => api.window.minimize());
$('#maximizeWindow').addEventListener('click', () => api.window.toggleMaximize());
$('#closeWindow').addEventListener('click', () => api.window.close());
$('#selectFolderButton').addEventListener('click', chooseFolder);
$('#sidebarChangeFolderButton').addEventListener('click', async () => {
  await goHome();
  await chooseFolder();
});
$('#resumeButton').addEventListener('click', () => {
  if (!state.savedSession) return;
  startFolder(
    state.savedSession.folder,
    Boolean(state.savedSession.includeSubfolders),
    state.savedSession,
    $('#enableFaceGrouping').checked
  );
});

$('#photoModeButton').addEventListener('click', () => setMode('photo'));
$('#videoModeButton').addEventListener('click', () => setMode('video'));
$('#openAlbumButton').addEventListener('click', showAlbum);
$('#backToAlbumButton').addEventListener('click', returnToAlbum);
$('#backToTriageFromAlbum').addEventListener('click', () => {
  showScreen('triage');
  renderCurrentMedia();
});
$('#albumSortSelect').addEventListener('change', (event) => {
  state.albumSort = event.target.value;
  renderAlbum();
});
$('#albumTypeSelect').addEventListener('change', (event) => {
  state.albumType = event.target.value;
  renderAlbum();
});
$('#emptyModeSwitch').addEventListener('click', () => setMode(state.mode === 'photo' ? 'video' : 'photo'));
$('#keepButton').addEventListener('click', () => choose('keep'));
$('#deleteButton').addEventListener('click', () => choose('delete'));
$('#previousButton').addEventListener('click', revisitPrevious);
$('#undoButton').addEventListener('click', () => undoLast());
$('#openTrashButton').addEventListener('click', openReview);
elements.soundButton.addEventListener('click', toggleSound);

$$('.nav-button').forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.route === 'landing') goHome();
    else if (button.dataset.route === 'review') openReview();
    else if (button.dataset.route === 'people') showPeople();
    else {
      showScreen('triage');
      renderCurrentMedia();
    }
  });
});

$('#changePeopleButton').addEventListener('click', showPeople);
$('#clearPeopleFilterButton').addEventListener('click', () => clearPeopleFilter(false));
$('#peopleSearchInput').addEventListener('input', renderPeoplePage);
$('#matchAnyButton').addEventListener('click', () => setPeopleMatchMode('any'));
$('#matchAllButton').addEventListener('click', () => setPeopleMatchMode('all'));
$('#mergePeopleButton').addEventListener('click', openMergePeopleModal);
$('#sortMatchingButton').addEventListener('click', startMatchingTriage);
$('#trashMatchingButton').addEventListener('click', addMatchingToTrash);
$('#addMePhotosButton').addEventListener('click', addMeReferences);
$('#meNameInput').addEventListener('change', async () => {
  if (state.faceSnapshot?.profile) {
    await state.faceService.updateProfileName($('#meNameInput').value);
    showToast('Your label was updated');
  }
});
$('#rescanFacesButton').addEventListener('click', () => {
  if (!state.faceService) return;
  state.faceService.scan({ force: true }).catch((error) => {
    showToast(error.message || 'The face scan could not start.', true);
  });
});
$('#pauseFaceScanButton').addEventListener('click', () => {
  if (state.faceSnapshot?.status.phase === 'paused') state.faceService.resume();
  else state.faceService.pause();
});
$('#cancelFaceScanButton').addEventListener('click', () => state.faceService?.cancel());

$('#cancelEditPersonButton').addEventListener('click', closePersonEditor);
$('#savePersonButton').addEventListener('click', savePersonEdits);
$('#hidePersonButton').addEventListener('click', hideEditedPerson);
$('#undoPersonMergeButton').addEventListener('click', undoPersonMerge);
$('#editPersonModal').addEventListener('click', (event) => {
  if (event.target.id === 'editPersonModal') closePersonEditor();
});

$('#cancelMergePeopleButton').addEventListener('click', closeMergePeopleModal);
$('#confirmMergePeopleButton').addEventListener('click', confirmPeopleMerge);
$('#mergePeopleModal').addEventListener('click', (event) => {
  if (event.target.id === 'mergePeopleModal') closeMergePeopleModal();
});

$('#manageFaceDataButton').addEventListener('click', () => $('#faceDataModal').classList.remove('hidden'));
$('#closeFaceDataButton').addEventListener('click', () => $('#faceDataModal').classList.add('hidden'));
$('#restoreHiddenPeopleButton').addEventListener('click', async () => {
  if (!state.faceService) return;
  const restored = await state.faceService.restoreHiddenGroups();
  $('#faceDataModal').classList.add('hidden');
  showToast(restored ? `${restored} hidden group${restored === 1 ? '' : 's'} restored` : 'There are no hidden groups');
});
$('#faceDataModal').addEventListener('click', (event) => {
  if (event.target.id === 'faceDataModal') $('#faceDataModal').classList.add('hidden');
});
$('#clearFaceDataButton').addEventListener('click', async () => {
  if (!state.faceService) return;
  $('#clearFaceDataButton').disabled = true;
  try {
    await state.faceService.clear();
    state.selectedPeople.clear();
    $('#faceDataModal').classList.add('hidden');
    renderPeoplePage();
    showToast('Saved face groups and names were cleared. Your photos were not changed.');
  } catch (error) {
    showToast(error.message || 'Face data could not be cleared.', true);
  } finally {
    $('#clearFaceDataButton').disabled = false;
  }
});

$('#selectAllTrash').addEventListener('change', (event) => {
  if (event.target.checked) state.selectedTrash = new Set(trashItems().map((item) => item.id));
  else state.selectedTrash.clear();
  $$('.review-card').forEach((card) => card.classList.toggle('selected', state.selectedTrash.has(card.dataset.id)));
  updateReviewSelection();
});
$('#restoreSelectedButton').addEventListener('click', restoreSelected);
$('#deleteSelectedButton').addEventListener('click', requestDeleteConfirmation);
$('#backToTriageButton').addEventListener('click', () => {
  showScreen('triage');
  renderCurrentMedia();
});
$('#finishWithoutTrashButton').addEventListener('click', finishIfReady);
$('#cancelDeleteButton').addEventListener('click', closeConfirmation);
$('#confirmDeleteButton').addEventListener('click', confirmDeletion);
elements.confirmModal.addEventListener('click', (event) => {
  if (event.target === elements.confirmModal && !state.isDeleting) closeConfirmation();
});

$('#anotherFolderButton').addEventListener('click', () => {
  resetToLanding(true);
  showToast('Choose your options, then select the next folder.');
});
$('#doneButton').addEventListener('click', () => api.window.close());
$('#showFolderButton').addEventListener('click', () => api.showFolder());
$('#openRecycleBinButton').addEventListener('click', () => api.openRecycleBin());

window.addEventListener('wheel', (event) => {
  if (
    state.mode !== 'video' ||
    !elements.triage.classList.contains('active') ||
    state.wheelLocked ||
    Math.abs(event.deltaY) < 16
  ) return;
  state.wheelLocked = true;
  navigateVideo(event.deltaY > 0 ? 1 : -1);
  setTimeout(() => { state.wheelLocked = false; }, 420);
}, { passive: true });

window.addEventListener('keydown', (event) => {
  if (!$('#mergePeopleModal').classList.contains('hidden')) {
    if (event.key === 'Escape') closeMergePeopleModal();
    if (event.key === 'Enter') confirmPeopleMerge();
    return;
  }

  if (!$('#editPersonModal').classList.contains('hidden')) {
    if (event.key === 'Escape') closePersonEditor();
    if (event.key === 'Enter') savePersonEdits();
    return;
  }

  if (!$('#faceDataModal').classList.contains('hidden')) {
    if (event.key === 'Escape') $('#faceDataModal').classList.add('hidden');
    return;
  }

  if (!elements.confirmModal.classList.contains('hidden')) {
    if (state.isDeleting) return;
    if (event.key === 'Escape') closeConfirmation();
    if (event.key === 'Enter') confirmDeletion();
    return;
  }

  if (elements.landing.classList.contains('active') && event.key === 'Enter') {
    chooseFolder();
    return;
  }

  if (event.ctrlKey && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    undoLast();
    return;
  }

  if (!elements.triage.classList.contains('active')) return;
  const key = event.key.toLowerCase();
  if (key === 'k' || event.key === 'ArrowRight') choose('keep');
  else if (key === 'd' || event.key === 'ArrowLeft') choose('delete');
  else if (key === 'p') revisitPrevious();
  else if (key === 't') openReview();
  else if (key === 'm') toggleSound();
  else if (event.key === ' ') {
    event.preventDefault();
    togglePlayback();
  } else if (state.mode === 'video' && event.key === 'ArrowDown') {
    event.preventDefault();
    navigateVideo(1);
  } else if (state.mode === 'video' && event.key === 'ArrowUp') {
    event.preventDefault();
    navigateVideo(-1);
  }
});

initialize();
