// filepath: /Users/hippo/git_repos/personal/Hoast/Hoast-Electron/src/services/hostsFileWatcher.ts
import * as chokidar from 'chokidar';
import fs from 'node:fs/promises';
import { EventEmitter } from 'events';

/**
 * Event types emitted by the HostsFileWatcher
 */
export enum HostsFileWatcherEvent {
  CHANGED = 'changed',
  ERROR = 'error'
}

/**
 * Service to watch for changes to the hosts file
 * This allows the application to stay in sync with external modifications
 */
export class HostsFileWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private filePath: string;
  private lastModified: Date | null = null;
  private isWatching: boolean = false;
  private debounceTimer: NodeJS.Timeout | null = null;
  private debounceDelay: number = 300; // ms

  /**
   * Creates a new file watcher for the hosts file
   * @param hostsFilePath Path to the hosts file to watch
   */
  constructor(hostsFilePath: string) {
    super();
    this.filePath = hostsFilePath;
  }

  /**
   * Start watching the hosts file for changes
   * @returns True if watching started successfully
   */
  public async startWatching(): Promise<boolean> {
    if (this.isWatching) {
      console.log('Already watching hosts file');
      return true;
    }

    try {
      // Get initial file stats to use as baseline for change detection
      const stats = await fs.stat(this.filePath);
      this.lastModified = stats.mtime;

      // Create watcher
      this.watcher = chokidar.watch(this.filePath, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 500,
          pollInterval: 100,
        },
      });

      // Setup watch event handlers
      this.watcher
        .on('change', this.handleFileChanged.bind(this))
        .on('error', (error: Error) => {
          console.error('Error watching hosts file:', error);
          this.emit(HostsFileWatcherEvent.ERROR, error);
        });

      this.isWatching = true;
      console.log(`Started watching hosts file: ${this.filePath}`);
      return true;
    } catch (error) {
      console.error('Failed to start watching hosts file:', error);
      this.isWatching = false;
      return false;
    }
  }

  /**
   * Stop watching the hosts file
   */
  public async stopWatching(): Promise<void> {
    if (!this.isWatching || !this.watcher) {
      return;
    }

    await this.watcher.close();
    this.watcher = null;
    this.isWatching = false;
    console.log(`Stopped watching hosts file: ${this.filePath}`);
  }

  /**
   * Handler for file change events
   * Includes debouncing to prevent multiple rapid events
   */
  private async handleFileChanged(path: string): Promise<void> {
    // Debounce changes to avoid multiple events for a single change
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      try {
        // Get current file stats
        const stats = await fs.stat(this.filePath);
        const currentMtime = stats.mtime;

        // Check if the modification time has changed
        if (!this.lastModified || currentMtime.getTime() !== this.lastModified.getTime()) {
          this.lastModified = currentMtime;
          console.log(`Hosts file changed externally: ${path}`);
          this.emit(HostsFileWatcherEvent.CHANGED, path);
        }
      } catch (error) {
        console.error('Error checking file stats:', error);
        this.emit(HostsFileWatcherEvent.ERROR, error);
      }
    }, this.debounceDelay);
  }

  /**
   * Check if the watcher is currently active
   */
  public isActive(): boolean {
    return this.isWatching;
  }

  /**
   * Get the path of the file being watched
   */
  public getFilePath(): string {
    return this.filePath;
  }
}