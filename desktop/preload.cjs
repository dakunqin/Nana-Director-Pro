const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("nanaDesktop", {
  openComfy: () => ipcRenderer.invoke("nana:open-comfy"),
  chooseDataRoot: () => ipcRenderer.invoke("nana:choose-data"),
  openDataRoot: () => ipcRenderer.invoke("nana:open-data"),
});
