// filepath: /Users/hippo/git_repos/personal/Hoast/Hoast-Electron/src/preload.ts
// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';
import { HostEntry, ParsedHostsFile } from './types/hostsFile';
import { AppConfiguration } from './types/configuration';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Hosts file operations
  getHostsFile: (): Promise<ParsedHostsFile> => ipcRenderer.invoke('hosts:get-file'),
  addHostEntry: (entry: Omit<HostEntry, 'lineNumber' | 'raw'>) => 
    ipcRenderer.invoke('hosts:add-entry', entry),
  updateHostEntry: (entry: HostEntry) => 
    ipcRenderer.invoke('hosts:update-entry', entry),
  toggleHostEntry: (lineNumber: number) => 
    ipcRenderer.invoke('hosts:toggle-entry', lineNumber),
  removeHostEntry: (lineNumber: number) => 
    ipcRenderer.invoke('hosts:remove-entry', lineNumber),
  
  // Configuration management
  getConfig: (): Promise<AppConfiguration> => 
    ipcRenderer.invoke('config:get'),
  updateConfig: (partialConfig: Partial<AppConfiguration>) => 
    ipcRenderer.invoke('config:update', partialConfig),
  resetConfig: () => ipcRenderer.invoke('config:reset'),
  
  // System operations
  flushDNSCache: () => ipcRenderer.invoke('system:flush-dns'),
  
  // Add host entry dialog functions
  submitNewEntry: (entry: Omit<HostEntry, 'lineNumber' | 'raw'>) =>
    ipcRenderer.invoke('add-entry:submit', entry),
  cancelAddEntry: () => ipcRenderer.invoke('add-entry:cancel'),
  
  // Menu action events
  onShowPreferences: (callback: () => void) => {
    ipcRenderer.on('menu:show-preferences', () => callback());
    return () => {
      ipcRenderer.removeAllListeners('menu:show-preferences');
    };
  },
  
  // Event listeners
  onHostsFileChanged: (callback: (parsedFile: ParsedHostsFile) => void) => {
    ipcRenderer.on('hosts:file-changed', (_event, parsedFile) => callback(parsedFile));
    return () => {
      ipcRenderer.removeAllListeners('hosts:file-changed');
    };
  }
});
