const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('keepOrDelete', {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close')
  },
  selectFolder: () => ipcRenderer.invoke('folder:select'),
  scanFolder: (folder, includeSubfolders) =>
    ipcRenderer.invoke('folder:scan', { folder, includeSubfolders }),
  mediaUrl: (filePath) => ipcRenderer.invoke('media:url', filePath),
  prepareVideo: (filePath) => ipcRenderer.invoke('media:prepare-video', filePath),
  thumbnailUrl: (filePath, kind) =>
    ipcRenderer.invoke('media:thumbnail', { filePath, kind }),
  selectFaceReferences: () => ipcRenderer.invoke('face:select-references'),
  faceReferenceUrl: (filePath) => ipcRenderer.invoke('face:reference-url', filePath),
  loadFaceIndex: (folder) => ipcRenderer.invoke('face:index-load', folder),
  saveFaceIndex: (folder, index) => ipcRenderer.invoke('face:index-save', { folder, index }),
  clearFaceIndex: (folder) => ipcRenderer.invoke('face:index-clear', folder),
  saveSession: (session) => ipcRenderer.invoke('session:save', session),
  loadSession: () => ipcRenderer.invoke('session:load'),
  clearSession: () => ipcRenderer.invoke('session:clear'),
  moveToTrash: (ids) => ipcRenderer.invoke('trash:move', ids),
  onTrashProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('trash:progress', listener);
    return () => ipcRenderer.removeListener('trash:progress', listener);
  },
  showFolder: () => ipcRenderer.invoke('system:show-folder'),
  openRecycleBin: () => ipcRenderer.invoke('system:open-recycle-bin'),
  isTestMode: () => ipcRenderer.invoke('app:test-mode'),
  version: () => ipcRenderer.invoke('app:version')
});
