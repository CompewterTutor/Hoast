// filepath: /Users/hippo/git_repos/personal/Hoast/Hoast-Electron/tests/hostsFileWatcher.test.ts
import fs from 'node:fs/promises';
import { EventEmitter } from 'events';
import { HostsFileWatcher, HostsFileWatcherEvent } from '../src/services/hostsFileWatcher';
import { HostsFileService, HostsFileServiceEvent } from '../src/services/hostsFileParser';

// Mock modules
jest.mock('node:fs/promises');
jest.mock('chokidar', () => {
  // Create a mock FSWatcher
  const mockWatcher = {
    on: jest.fn().mockImplementation(function(this: any, event, handler) {
      if (!this.eventHandlers) {
        this.eventHandlers = {};
      }
      this.eventHandlers[event] = handler;
      return this;
    }),
    close: jest.fn().mockResolvedValue(undefined),
    // Method to simulate events for testing
    simulateEvent: function(this: any, event: string, ...args: any[]) {
      if (this.eventHandlers && this.eventHandlers[event]) {
        this.eventHandlers[event](...args);
      }
    }
  };

  return {
    watch: jest.fn().mockReturnValue(mockWatcher)
  };
});

describe('HostsFileWatcher', () => {
  const mockFilePath = '/mock/etc/hosts';
  let watcher: HostsFileWatcher;
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock fs.stat to return a consistent mtime for the initial check
    (fs.stat as jest.Mock).mockResolvedValue({
      mtime: new Date(2023, 1, 1)
    });
    
    watcher = new HostsFileWatcher(mockFilePath);
  });

  afterEach(async () => {
    if (watcher.isActive()) {
      await watcher.stopWatching();
    }
  });

  it('should create a watcher instance with the correct file path', () => {
    expect(watcher.getFilePath()).toBe(mockFilePath);
    expect(watcher.isActive()).toBe(false);
  });

  it('should start watching when requested', async () => {
    const success = await watcher.startWatching();
    expect(success).toBe(true);
    expect(watcher.isActive()).toBe(true);
    
    // Verify the chokidar.watch was called with the correct path
    const chokidar = require('chokidar');
    expect(chokidar.watch).toHaveBeenCalledWith(
      mockFilePath, 
      expect.objectContaining({
        persistent: true,
        ignoreInitial: true
      })
    );
  });

  it('should stop watching when requested', async () => {
    await watcher.startWatching();
    expect(watcher.isActive()).toBe(true);
    
    await watcher.stopWatching();
    expect(watcher.isActive()).toBe(false);
    
    // Verify the watcher.close was called
    const chokidar = require('chokidar');
    const mockWatcher = chokidar.watch.mock.results[0].value;
    expect(mockWatcher.close).toHaveBeenCalled();
  });

  it('should emit change events when file is modified', async () => {
    const changeHandler = jest.fn();
    watcher.on(HostsFileWatcherEvent.CHANGED, changeHandler);
    
    await watcher.startWatching();
    
    // Get the mock watcher instance
    const chokidar = require('chokidar');
    const mockWatcher = chokidar.watch.mock.results[0].value;
    
    // Before simulating a change, update the mock fs.stat to return a new mtime
    (fs.stat as jest.Mock).mockResolvedValue({
      mtime: new Date(2023, 1, 2) // Different date than the initial one
    });
    
    // Simulate a file change event
    mockWatcher.simulateEvent('change', mockFilePath);
    
    // Wait for the debounced handler to execute
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    // Verify the change event was emitted
    expect(changeHandler).toHaveBeenCalledWith(mockFilePath);
  });

  it('should not emit change event if mtime is the same', async () => {
    const changeHandler = jest.fn();
    watcher.on(HostsFileWatcherEvent.CHANGED, changeHandler);
    
    await watcher.startWatching();
    
    // Get the mock watcher instance
    const chokidar = require('chokidar');
    const mockWatcher = chokidar.watch.mock.results[0].value;
    
    // Keep the same mtime (don't update fs.stat mock) so no change is detected
    
    // Simulate a file change event
    mockWatcher.simulateEvent('change', mockFilePath);
    
    // Wait for the debounced handler to execute
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    // Verify the change event was NOT emitted
    expect(changeHandler).not.toHaveBeenCalled();
  });

  it('should emit error events when errors occur', async () => {
    const errorHandler = jest.fn();
    watcher.on(HostsFileWatcherEvent.ERROR, errorHandler);
    
    await watcher.startWatching();
    
    // Get the mock watcher instance
    const chokidar = require('chokidar');
    const mockWatcher = chokidar.watch.mock.results[0].value;
    
    // Simulate an error event
    const mockError = new Error('Mock watcher error');
    mockWatcher.simulateEvent('error', mockError);
    
    // Verify the error event was emitted
    expect(errorHandler).toHaveBeenCalledWith(mockError);
  });
});

describe('HostsFileService with Watcher', () => {
  const mockFilePath = '/mock/etc/hosts';
  const mockContent = `127.0.0.1 localhost
::1 localhost
# Test comment
192.168.1.1 example.com
`;
  let service: HostsFileService;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock fs functions
    (fs.readFile as jest.Mock).mockResolvedValue(mockContent);
    (fs.access as jest.Mock).mockResolvedValue(undefined);
    (fs.stat as jest.Mock).mockResolvedValue({
      mtime: new Date(2023, 1, 1)
    });
    
    service = new HostsFileService(mockFilePath);
  });
  
  afterEach(async () => {
    if (service.isWatcherActive()) {
      await service.stopFileWatcher();
    }
  });
  
  it('should start a file watcher', async () => {
    const success = await service.startFileWatcher();
    expect(success).toBe(true);
    expect(service.isWatcherActive()).toBe(true);
  });
  
  it('should stop a file watcher', async () => {
    await service.startFileWatcher();
    expect(service.isWatcherActive()).toBe(true);
    
    await service.stopFileWatcher();
    expect(service.isWatcherActive()).toBe(false);
  });
  
  it('should reload data when file changes are detected', async () => {
    const changeHandler = jest.fn();
    service.on(HostsFileServiceEvent.FILE_CHANGED, changeHandler);
    
    // Initialize by parsing the file
    await service.parseHostsFile();
    
    // Start the watcher
    await service.startFileWatcher();
    
    // Update the mock content for the next read
    const newContent = `127.0.0.1 localhost
::1 localhost
# Test comment
192.168.1.1 example.com
10.0.0.1 test.local
`;
    (fs.readFile as jest.Mock).mockResolvedValue(newContent);
    (fs.stat as jest.Mock).mockResolvedValue({
      mtime: new Date(2023, 1, 2)  // Different date than initial
    });
    
    // Get the mock watcher instance from chokidar
    // This requires knowledge of internal implementation details,
    // which is generally not ideal but necessary for this test
    const chokidar = require('chokidar');
    const mockWatcher = chokidar.watch.mock.results[0].value;
    
    // Simulate a file change event
    mockWatcher.simulateEvent('change', mockFilePath);
    
    // Wait for the debounced handler to execute
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    // Verify the change event was emitted and the file was reloaded
    expect(changeHandler).toHaveBeenCalled();
    expect(fs.readFile).toHaveBeenCalledTimes(2); // Initial + reload
  });
});