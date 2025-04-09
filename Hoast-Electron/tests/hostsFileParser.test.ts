import fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { HostsFileService } from '../src/services/hostsFileParser';
import { HostEntry, ParsedHostsFile } from '../src/types/hostsFile';

// Mock fs and os modules
jest.mock('node:fs/promises');
jest.mock('node:os');
jest.mock('node:path');

describe('HostsFileService', () => {
  const mockHostsFilePath = '/mock/etc/hosts';
  const mockHostsFileContent = `# This is a sample hosts file
127.0.0.1 localhost
::1 localhost
# Commented entry
#192.168.1.1 example.com www.example.com  # Example website
10.0.0.1 test.local other.test  # Test server`;

  beforeEach(() => {
    // Reset all mocks
    jest.resetAllMocks();
    
    // Mock platform to be macOS
    (os.platform as jest.Mock).mockReturnValue('darwin');
    
    // Mock path.join
    (path.join as jest.Mock).mockImplementation((...args: string[]) => args.join('/'));
    
    // Mock fs.readFile
    (fs.readFile as jest.Mock).mockResolvedValue(mockHostsFileContent);
    
    // Mock fs.access to always succeed
    (fs.access as jest.Mock).mockResolvedValue(undefined);
    
    // Mock fs.stat
    (fs.stat as jest.Mock).mockResolvedValue({
      mtime: new Date(),
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should initialize with the default hosts path for the current OS', async () => {
    const service = new HostsFileService();
    expect(os.platform).toHaveBeenCalled();
    expect(service.getHostsFilePath()).toBe('/etc/hosts');
  });

  it('should initialize with a custom path if provided', async () => {
    const service = new HostsFileService(mockHostsFilePath);
    expect(service.getHostsFilePath()).toBe(mockHostsFilePath);
  });

  it('should read and parse the hosts file', async () => {
    const service = new HostsFileService(mockHostsFilePath);
    const result = await service.parseHostsFile();
    
    expect(fs.readFile).toHaveBeenCalledWith(mockHostsFilePath, 'utf-8');
    expect(result).toBeDefined();
    // Updated expectation to match actual parser behavior
    expect(result.entries.length).toBe(4); // 4 host entries (including IPv4, IPv6, commented entry, and test entry)
    expect(result.lines.length).toBe(6);   // 6 total lines
  });

  it('should correctly identify enabled and disabled entries', async () => {
    const service = new HostsFileService(mockHostsFilePath);
    const result = await service.parseHostsFile();
    
    const enabledEntries = result.entries.filter(entry => entry.enabled);
    const disabledEntries = result.entries.filter(entry => !entry.enabled);
    
    // Updated expectation to match actual parser behavior
    expect(enabledEntries.length).toBe(3); // 3 enabled entries
    expect(disabledEntries.length).toBe(1); // 1 commented/disabled entry
  });

  it('should correctly parse entry with aliases', async () => {
    const service = new HostsFileService(mockHostsFilePath);
    const result = await service.parseHostsFile();
    
    const entryWithAliases = result.entries.find(
      entry => entry.hostname === 'test.local'
    );
    
    expect(entryWithAliases).toBeDefined();
    expect(entryWithAliases!.aliases).toContain('other.test');
  });

  it('should correctly parse inline comments', async () => {
    const service = new HostsFileService(mockHostsFilePath);
    const result = await service.parseHostsFile();
    
    const entryWithComment = result.entries.find(
      entry => entry.comment && entry.comment.includes('Test server')
    );
    
    expect(entryWithComment).toBeDefined();
    expect(entryWithComment!.hostname).toBe('test.local');
  });

  it('should check if the file is readable', async () => {
    const service = new HostsFileService(mockHostsFilePath);
    
    const canRead = await service.canReadHostsFile();
    expect(canRead).toBe(true);
    expect(fs.access).toHaveBeenCalled();
  });

  it('should check if the file is writable', async () => {
    const service = new HostsFileService(mockHostsFilePath);
    
    const canWrite = await service.canWriteHostsFile();
    expect(canWrite).toBe(true);
    expect(fs.access).toHaveBeenCalled();
  });

  it('should handle read access errors', async () => {
    (fs.access as jest.Mock).mockRejectedValue(new Error('Access denied'));
    
    const service = new HostsFileService(mockHostsFilePath);
    const canRead = await service.canReadHostsFile();
    
    expect(canRead).toBe(false);
  });

  it('should handle write access errors', async () => {
    (fs.access as jest.Mock).mockRejectedValue(new Error('Access denied'));
    
    const service = new HostsFileService(mockHostsFilePath);
    const canWrite = await service.canWriteHostsFile();
    
    expect(canWrite).toBe(false);
  });
});