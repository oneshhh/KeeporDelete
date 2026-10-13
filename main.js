const { app, BrowserWindow, dialog, ipcMain, net, protocol, safeStorage, shell } = require('electron');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { spawn } = require('child_process');

const explicitTestUserData = process.env.KEEP_OR_DELETE_TEST_USER_DATA;
if (explicitTestUserData) {
  app.setPath('userData', path.resolve(explicitTestUserData));
} else if (!app.isPackaged && process.env.KEEP_OR_DELETE_TEST === '1') {
  app.setPath('userData', path.join(__dirname, 'test-output', 'user-data'));
}

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.jfif', '.png', '.webp', '.gif', '.bmp', '.heic', '.heif'
]);
const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mov', '.m4v', '.webm', '.avi', '.mkv', '.wmv', '.mpeg', '.mpg'
]);
const HEIC_EXTENSIONS = new Set(['.heic', '.heif']);

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'kod',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
  }
]);

let mainWindow;
let currentFolder = null;
let mediaById = new Map();
let allowedMediaPaths = new Set();
let allowedFaceReferencePaths = new Set();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 820,
    minWidth: 1080,
    minHeight: 650,
    frame: false,
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, 'assets', 'app-logo.png'),
    backgroundColor: '#0e0e10',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    }
  });

  mainWindow.setMenu(null);
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
}

function safeFfmpegPath() {
  const packagedPath = require('ffmpeg-static');
  return app.isPackaged
    ? packagedPath.replace('app.asar', 'app.asar.unpacked')
    : packagedPath;
}

function cacheFolder() {
  const folder = path.join(app.getPath('temp'), 'keep-or-delete-cache');
  fs.mkdirSync(folder, { recursive: true });
  return folder;
}

function cacheKey(filePath, suffix) {
  let stats = { mtimeMs: 0, size: 0 };
  try {
    stats = fs.statSync(filePath);
  } catch {}
  return crypto
    .createHash('sha1')
    .update(`${filePath}|${stats.mtimeMs}|${stats.size}|${suffix}`)
    .digest('hex');
}

function isAllowedPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  return allowedMediaPaths.has(path.resolve(filePath).toLowerCase());
}

async function walkFolder(root, includeSubfolders, errors) {
  const results = [];

  async function walk(folder) {
    let entries;
    try {
      entries = await fsp.readdir(folder, { withFileTypes: true });
    } catch (error) {
      errors.push({ path: folder, message: error.message });
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        if (includeSubfolders) await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;

      const extension = path.extname(entry.name).toLowerCase();
      if (IMAGE_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension)) {
        results.push(fullPath);
      }
    }
  }

  await walk(root);
  return results;
}

function groupMedia(files) {
  const fileInfo = files.map((filePath) => {
    let stats = { size: 0, mtimeMs: 0, birthtimeMs: 0 };
    try {
      stats = fs.statSync(filePath);
    } catch {}
    return {
      filePath,
      directory: path.dirname(filePath),
      extension: path.extname(filePath).toLowerCase(),
      stem: path.parse(filePath).name.toLowerCase(),
      size: stats.size || 0,
      timestamp: stats.birthtimeMs || stats.mtimeMs || 0
    };
  });

  const images = fileInfo.filter((file) => IMAGE_EXTENSIONS.has(file.extension));
  const videos = fileInfo.filter((file) => VIDEO_EXTENSIONS.has(file.extension));
  const videosByKey = new Map();

  for (const video of videos) {
    const key = `${video.directory.toLowerCase()}|${video.stem}`;
    if (!videosByKey.has(key)) videosByKey.set(key, []);
    videosByKey.get(key).push(video);
  }

  // Prefer the original HEIC/JPEG when duplicate still formats share a Live Photo video.
  images.sort((a, b) => {
    const aPreferred = HEIC_EXTENSIONS.has(a.extension) ? 0 : 1;
    const bPreferred = HEIC_EXTENSIONS.has(b.extension) ? 0 : 1;
    return aPreferred - bPreferred;
  });

  const usedVideos = new Set();
  const items = [];

  for (const image of images) {
    const key = `${image.directory.toLowerCase()}|${image.stem}`;
    const matchingVideo = (videosByKey.get(key) || []).find(
      (video) => !usedVideos.has(video.filePath)
    );
    if (matchingVideo) usedVideos.add(matchingVideo.filePath);

    const itemPaths = matchingVideo
      ? [image.filePath, matchingVideo.filePath]
      : [image.filePath];
    const id = crypto.createHash('sha1').update(itemPaths.join('|')).digest('hex');
    items.push({
      id,
      kind: matchingVideo ? 'live' : 'image',
      name: path.basename(image.filePath),
      path: image.filePath,
      companionPath: matchingVideo?.filePath || null,
      directory: image.directory,
      extension: image.extension,
      size: image.size + (matchingVideo?.size || 0),
      timestamp: Math.max(image.timestamp, matchingVideo?.timestamp || 0),
      fileCount: matchingVideo ? 2 : 1
    });
  }

  for (const video of videos) {
    if (usedVideos.has(video.filePath)) continue;
    const id = crypto.createHash('sha1').update(video.filePath).digest('hex');
    items.push({
      id,
      kind: 'video',
      name: path.basename(video.filePath),
      path: video.filePath,
      companionPath: null,
      directory: video.directory,
      extension: video.extension,
      size: video.size,
      timestamp: video.timestamp,
      fileCount: 1
    });
  }

  return items.sort((a, b) => b.timestamp - a.timestamp || a.name.localeCompare(b.name));
}

async function scanFolder(folder, includeSubfolders) {
  const resolvedFolder = path.resolve(folder);
  const stats = await fsp.stat(resolvedFolder);
  if (!stats.isDirectory()) throw new Error('The selected location is not a folder.');

  const errors = [];
  const files = await walkFolder(resolvedFolder, includeSubfolders, errors);
  const items = groupMedia(files);

  currentFolder = resolvedFolder;
  mediaById = new Map(items.map((item) => [item.id, item]));
  allowedMediaPaths = new Set(
    items
      .flatMap((item) => [item.path, item.companionPath].filter(Boolean))
      .map((filePath) => path.resolve(filePath).toLowerCase())
  );

  return {
    folder: resolvedFolder,
    folderName: path.basename(resolvedFolder),
    items,
    photoCount: items.filter((item) => item.kind !== 'video').length,
    videoCount: items.filter((item) => item.kind === 'video').length,
    liveCount: items.filter((item) => item.kind === 'live').length,
    totalBytes: items.reduce((sum, item) => sum + item.size, 0),
    errors
  };
}

async function convertHeic(filePath) {
  const outputPath = path.join(cacheFolder(), `${cacheKey(filePath, 'heic-jpeg')}.jpg`);
  if (fs.existsSync(outputPath)) return outputPath;

  const convert = require('heic-convert');
  const inputBuffer = await fsp.readFile(filePath);
  const outputBuffer = await convert({
    buffer: inputBuffer,
    format: 'JPEG',
    quality: 0.88
  });
  await fsp.writeFile(outputPath, outputBuffer);
  return outputPath;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(safeFfmpegPath(), args, {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe']
    });
    let errorOutput = '';
    child.stderr.on('data', (chunk) => {
      errorOutput = `${errorOutput}${chunk}`.slice(-8000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(errorOutput || `Media conversion stopped with code ${code}.`));
    });
  });
}

async function prepareVideo(filePath) {
  const outputPath = path.join(cacheFolder(), `${cacheKey(filePath, 'video-h264')}.mp4`);
  if (fs.existsSync(outputPath)) return outputPath;

  await runFfmpeg([
    '-y',
    '-i', filePath,
    '-map_metadata', '0',
    '-vf', 'scale=min(1920\\,iw):-2',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '24',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    outputPath
  ]);
  return outputPath;
}

async function createVideoThumbnail(filePath) {
  const outputPath = path.join(cacheFolder(), `${cacheKey(filePath, 'video-thumb')}.jpg`);
  if (fs.existsSync(outputPath)) return outputPath;

  await runFfmpeg([
    '-y',
    '-ss', '0',
    '-i', filePath,
    '-frames:v', '1',
    '-vf', 'scale=640:-2',
    '-q:v', '4',
    outputPath
  ]);
  return outputPath;
}

function sessionPath() {
  return path.join(app.getPath('userData'), 'session.json');
}

function faceIndexFolder() {
  const folder = path.join(app.getPath('userData'), 'face-indexes');
  fs.mkdirSync(folder, { recursive: true });
  return folder;
}

function faceIndexPath(folder) {
  const normalized = path.resolve(folder).toLowerCase();
  const key = crypto.createHash('sha256').update(normalized).digest('hex');
  return path.join(faceIndexFolder(), `${key}.bin`);
}

function assertActiveFolder(folder) {
  if (!currentFolder || path.resolve(folder).toLowerCase() !== currentFolder.toLowerCase()) {
    throw new Error('Face data can only be accessed for the active folder.');
  }
}

async function saveFaceIndex(folder, index) {
  assertActiveFolder(folder);
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows secure storage is not available, so face data was not saved.');
  }
  const destination = faceIndexPath(folder);
  const temporary = `${destination}.${process.pid}.tmp`;
  const payload = JSON.stringify({ ...index, folder: path.resolve(folder), savedAt: new Date().toISOString() });
  const encrypted = safeStorage.encryptString(payload);
  await fsp.writeFile(temporary, encrypted);
  await fsp.rm(destination, { force: true });
  await fsp.rename(temporary, destination);
  return true;
}

async function loadFaceIndex(folder) {
  assertActiveFolder(folder);
  try {
    const encrypted = await fsp.readFile(faceIndexPath(folder));
    if (!safeStorage.isEncryptionAvailable()) return null;
    const index = JSON.parse(safeStorage.decryptString(encrypted));
    if (path.resolve(index.folder).toLowerCase() !== path.resolve(folder).toLowerCase()) return null;
    return index;
  } catch {
    return null;
  }
}

async function clearFaceIndex(folder) {
  assertActiveFolder(folder);
  await fsp.rm(faceIndexPath(folder), { force: true });
  return true;
}

function registerLocalModelProtocol() {
  protocol.handle('kod', async (request) => {
    const parsed = new URL(request.url);
    if (parsed.hostname !== 'face-models') return new Response('Not found', { status: 404 });
    const modelRoot = path.resolve(__dirname, 'assets', 'face-models');
    const requested = path.resolve(modelRoot, decodeURIComponent(parsed.pathname.slice(1)));
    if (requested !== modelRoot && !requested.startsWith(`${modelRoot}${path.sep}`)) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(requested).href);
  });
}

ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:toggle-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());

ipcMain.handle('folder:select', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose a folder to sort',
    properties: ['openDirectory', 'dontAddToRecent']
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

ipcMain.handle('folder:scan', async (_event, { folder, includeSubfolders }) => {
  return scanFolder(folder, Boolean(includeSubfolders));
});

ipcMain.handle('media:url', async (_event, filePath) => {
  if (!isAllowedPath(filePath)) throw new Error('This file is outside the active media folder.');
  const extension = path.extname(filePath).toLowerCase();
  const previewPath = HEIC_EXTENSIONS.has(extension)
    ? await convertHeic(filePath)
    : filePath;
  return pathToFileURL(previewPath).href;
});

ipcMain.handle('media:prepare-video', async (_event, filePath) => {
  if (!isAllowedPath(filePath)) throw new Error('This file is outside the active media folder.');
  const previewPath = await prepareVideo(filePath);
  return pathToFileURL(previewPath).href;
});

ipcMain.handle('media:thumbnail', async (_event, { filePath, kind }) => {
  if (!isAllowedPath(filePath)) throw new Error('This file is outside the active media folder.');
  let thumbnailPath;
  if (kind === 'video') thumbnailPath = await createVideoThumbnail(filePath);
  else if (HEIC_EXTENSIONS.has(path.extname(filePath).toLowerCase())) thumbnailPath = await convertHeic(filePath);
  else thumbnailPath = filePath;
  return pathToFileURL(thumbnailPath).href;
});

ipcMain.handle('face:select-references', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose clear reference photos',
    properties: ['openFile', 'multiSelections', 'dontAddToRecent'],
    filters: [
      { name: 'Photos', extensions: ['jpg', 'jpeg', 'jfif', 'png', 'webp', 'bmp', 'heic', 'heif'] }
    ]
  });
  if (result.canceled) return [];
  allowedFaceReferencePaths = new Set(result.filePaths.map((filePath) => path.resolve(filePath).toLowerCase()));
  return result.filePaths.slice(0, 3);
});

ipcMain.handle('face:reference-url', async (_event, filePath) => {
  const resolved = path.resolve(filePath);
  if (!allowedFaceReferencePaths.has(resolved.toLowerCase())) {
    throw new Error('This reference photo was not selected through the app.');
  }
  const extension = path.extname(resolved).toLowerCase();
  const previewPath = HEIC_EXTENSIONS.has(extension) ? await convertHeic(resolved) : resolved;
  return pathToFileURL(previewPath).href;
});

ipcMain.handle('face:index-load', async (_event, folder) => loadFaceIndex(folder));
ipcMain.handle('face:index-save', async (_event, { folder, index }) => saveFaceIndex(folder, index));
ipcMain.handle('face:index-clear', async (_event, folder) => clearFaceIndex(folder));
ipcMain.handle('app:test-mode', () => !app.isPackaged && process.env.KEEP_OR_DELETE_TEST === '1');

ipcMain.handle('session:save', async (_event, session) => {
  const payload = {
    ...session,
    savedAt: new Date().toISOString()
  };
  await fsp.writeFile(sessionPath(), JSON.stringify(payload, null, 2), 'utf8');
  return true;
});

ipcMain.handle('session:load', async () => {
  try {
    const raw = await fsp.readFile(sessionPath(), 'utf8');
    const session = JSON.parse(raw);
    if (!session.folder || !fs.existsSync(session.folder)) return null;
    return session;
  } catch {
    return null;
  }
});

ipcMain.handle('session:clear', async () => {
  try {
    await fsp.unlink(sessionPath());
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return true;
});

ipcMain.handle('trash:move', async (event, ids) => {
  const results = [];
  const smokeTestMode = !app.isPackaged && process.env.KEEP_OR_DELETE_TEST === '1';
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const item = mediaById.get(id);
    if (!item) {
      const result = { id, success: false, message: 'The media item is no longer available.' };
      results.push(result);
      event.sender.send('trash:progress', {
        completed: index + 1,
        total: ids.length,
        id,
        name: 'Unavailable media',
        success: false
      });
      continue;
    }

    const paths = [item.path, item.companionPath].filter(Boolean);
    const failures = [];
    let movedFileCount = 0;
    for (const filePath of paths) {
      try {
        if (fs.existsSync(filePath)) {
          if (smokeTestMode) {
            await new Promise((resolve) => setTimeout(resolve, 180));
          } else {
            await shell.trashItem(filePath);
          }
          movedFileCount += 1;
        }
      } catch (error) {
        failures.push(`${path.basename(filePath)}: ${error.message}`);
      }
    }

    const result = {
      id,
      success: failures.length === 0,
      movedFileCount,
      message: failures.join('\n')
    };
    results.push(result);
    event.sender.send('trash:progress', {
      completed: index + 1,
      total: ids.length,
      id,
      name: item.name,
      success: result.success
    });
  }
  return results;
});

ipcMain.handle('system:show-folder', async () => {
  if (!currentFolder) return '';
  return shell.openPath(currentFolder);
});

ipcMain.handle('system:open-recycle-bin', async () => {
  const child = spawn('explorer.exe', ['shell:RecycleBinFolder'], {
    detached: true,
    windowsHide: false,
    stdio: 'ignore'
  });
  child.unref();
  return true;
});

ipcMain.handle('app:version', () => app.getVersion());

app.whenReady().then(() => {
  registerLocalModelProtocol();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
