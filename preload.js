const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getGames: () => ipcRenderer.invoke('games:get'),
  rescan: () => ipcRenderer.invoke('games:rescan'),
  launch: id => ipcRenderer.invoke('game:launch', id),
  getSystem: () => ipcRenderer.invoke('system:get'),
  openStore: id => ipcRenderer.invoke('store:open', id),
  getExplore: () => ipcRenderer.invoke('explore:get'),
  getStoreDeals: () => ipcRenderer.invoke('store:deals:get'),
  openExploreItem: item => ipcRenderer.invoke('explore:open', item)
});
