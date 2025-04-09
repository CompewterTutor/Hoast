import fs from 'node:fs/promises';
import { HostsFileWriter, HostsFileWriterEvent, WriteResult } from '../src/services/hostsFileWriter';
import { HostEntry, CommentLine, ParsedHostsFile } from '../src/types/hostsFile';

// Mock fs and os modules
jest.mock('node:fs/promises');

describe('HostsFileWriter', () => {
  const mockFilePath = '/mock/etc/hosts';
  let writer: HostsFileWriter;
  
  // Sample parsed hosts file for testing
  const sampleParsedFile: ParsedHostsFile = {
    lines: [
      {
        raw: '# This is a sample hosts file',
        lineNumber: 0
      } as CommentLine,
      {
        ip: '127.0.0.1',
        hostname: 'localhost',
        enabled: true,
        aliases: [] as string[],
        lineNumber: 1,
        raw: '127.0.0.1\tlocalhost'
      } as HostEntry,
      {
        ip: '::1',
        hostname: 'localhost',
        enabled: true,
        aliases: [] as string[],
        lineNumber: 2,
        raw: '::1\tlocalhost'
      } as HostEntry,
      {
        raw: '# Commented entry',
        lineNumber: 3
      } as CommentLine,
      {
        ip: '192.168.1.1',
        hostname: 'example.com',
        enabled: false,
        aliases: ['www.example.com'] as string[],
        comment: '# Example website',
        lineNumber: 4,
        raw: '#192.168.1.1 example.com www.example.com  # Example website'
      } as HostEntry,
      {
        ip: '10.0.0.1',
        hostname: 'test.local',
        enabled: true,
        aliases: ['other.test'] as string[],
        comment: '# Test server',
        lineNumber: 5,
        raw: '10.0.0.1 test.local other.test  # Test server'
      } as HostEntry
    ],
    entries: [
      {
        ip: '127.0.0.1',
        hostname: 'localhost',
        enabled: true,
        aliases: [] as string[],
        lineNumber: 1,
        raw: '127.0.0.1\tlocalhost'
      } as HostEntry,
      {
        ip: '::1',
        hostname: 'localhost',
        enabled: true,
        aliases: [] as string[],
        lineNumber: 2,
        raw: '::1\tlocalhost'
      } as HostEntry,
      {
        ip: '192.168.1.1',
        hostname: 'example.com',
        enabled: false,
        aliases: ['www.example.com'] as string[],
        comment: '# Example website',
        lineNumber: 4,
        raw: '#192.168.1.1 example.com www.example.com  # Example website'
      } as HostEntry,
      {
        ip: '10.0.0.1',
        hostname: 'test.local',
        enabled: true,
        aliases: ['other.test'] as string[],
        comment: '# Test server',
        lineNumber: 5,
        raw: '10.0.0.1 test.local other.test  # Test server'
      } as HostEntry
    ],
    filePath: mockFilePath,
    lastModified: new Date()
  };
  
  // Expected file content when the parsed file is converted back to text
  const expectedFileContent = 
`# This is a sample hosts file
127.0.0.1\tlocalhost
::1\tlocalhost
# Commented entry
# 192.168.1.1\texample.com www.example.com # Example website
10.0.0.1\ttest.local other.test # Test server`;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock fs.writeFile to resolve successfully by default
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    
    // Mock fs.copyFile (for backups) to resolve successfully
    (fs.copyFile as jest.Mock).mockResolvedValue(undefined);
    
    writer = new HostsFileWriter();
  });
  
  describe('convertToString', () => {
    it('should convert a parsed hosts file back to text', () => {
      const result = writer.convertToString(sampleParsedFile);
      
      // Check that each expected line is in the result
      const lines = expectedFileContent.split('\n');
      lines.forEach(line => {
        expect(result).toContain(line);
      });
      
      // Check the general structure
      expect(result.split('\n').length).toBe(sampleParsedFile.lines.length);
    });
    
    it('should preserve the order of lines based on line number', () => {
      // Create a copy with shuffled lines
      const shuffledFile = { ...sampleParsedFile };
      shuffledFile.lines = [...sampleParsedFile.lines].sort(() => Math.random() - 0.5); 
      
      const result = writer.convertToString(shuffledFile);
      
      // The result should still be in the original order
      const lines = expectedFileContent.split('\n');
      lines.forEach((line, index) => {
        expect(result.split('\n')[index]).toContain(line);
      });
    });
    
    it('should properly format comments and enabled/disabled entries', () => {
      const result = writer.convertToString(sampleParsedFile);
      
      // Check that disabled entries start with #
      expect(result).toContain('# 192.168.1.1');
      
      // Check that enabled entries don't start with #
      expect(result).toContain('127.0.0.1\tlocalhost');
      
      // Check that comments are preserved
      expect(result).toContain('# Example website');
    });
  });
  
  describe('writeHostsFile', () => {
    it('should write the hosts file correctly', async () => {
      const result = await writer.writeHostsFile(sampleParsedFile);
      
      expect(fs.writeFile).toHaveBeenCalledWith(mockFilePath, expect.any(String), 'utf-8');
      expect(result.success).toBe(true);
      expect(result.filePath).toBe(mockFilePath);
    });
    
    it('should create a backup if requested', async () => {
      await writer.writeHostsFile(sampleParsedFile, { createBackup: true });
      
      expect(fs.copyFile).toHaveBeenCalledWith(mockFilePath, expect.stringContaining(mockFilePath + '.backup.'));
    });
    
    it('should handle write errors', async () => {
      // Set up error handler to avoid unhandled promise rejection
      const errorHandler = jest.fn();
      writer.on(HostsFileWriterEvent.ERROR, errorHandler);
      
      const mockError = new Error('Write failed');
      (fs.writeFile as jest.Mock).mockRejectedValue(mockError);
      
      const result = await writer.writeHostsFile(sampleParsedFile);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe(mockError);
      expect(errorHandler).toHaveBeenCalled();
    });
    
    it('should emit events on success and failure', async () => {
      // Test success event
      const successHandler = jest.fn();
      writer.on(HostsFileWriterEvent.SUCCESS, successHandler);
      
      await writer.writeHostsFile(sampleParsedFile);
      
      expect(successHandler).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        filePath: mockFilePath
      }));
      
      // Test error event
      const mockError = new Error('Write failed');
      (fs.writeFile as jest.Mock).mockRejectedValue(mockError);
      
      const errorHandler = jest.fn();
      writer.on(HostsFileWriterEvent.ERROR, errorHandler);
      
      await writer.writeHostsFile(sampleParsedFile);
      
      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: mockError,
        filePath: mockFilePath
      }));
    });
    
    it('should throw an error when trying to use elevated permissions', async () => {
      // Set up error handler to avoid unhandled promise rejection
      const errorHandler = jest.fn();
      writer.on(HostsFileWriterEvent.ERROR, errorHandler);
      
      const result = await writer.writeHostsFile(sampleParsedFile, { useElevatedPermissions: true });
      
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Elevated permissions not yet implemented');
      expect(errorHandler).toHaveBeenCalled();
    });
  });
  
  describe('updateHostEntry', () => {
    it('should update an existing entry', async () => {
      // Clone an entry and modify it
      const originalEntry = sampleParsedFile.entries[0];
      const updatedEntry: HostEntry = {
        ...originalEntry,
        hostname: 'modified.local',
        enabled: false
      };
      
      const result = await writer.updateHostEntry(sampleParsedFile, updatedEntry);
      
      expect(result.success).toBe(true);
      expect(fs.writeFile).toHaveBeenCalled();
      
      // Verify the written content would contain the updated entry
      const writeCallArgs = (fs.writeFile as jest.Mock).mock.calls[0];
      const writtenContent = writeCallArgs[1];
      expect(writtenContent).toContain('# 127.0.0.1\tmodified.local');
    });
    
    it('should return an error if the entry is not found', async () => {
      const nonExistentEntry: HostEntry = {
        ip: '1.1.1.1',
        hostname: 'nonexistent.com',
        enabled: true,
        aliases: [] as string[],
        lineNumber: 999, // Non-existent line number
        raw: '1.1.1.1 nonexistent.com'
      };
      
      const result = await writer.updateHostEntry(sampleParsedFile, nonExistentEntry);
      
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Host entry not found');
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });
  
  describe('addHostEntry', () => {
    it('should add a new entry to the hosts file', async () => {
      const newEntry = {
        ip: '1.1.1.1',
        hostname: 'new-entry.com',
        enabled: true,
        aliases: ['alias.new-entry.com'] as string[],
        comment: '# New entry'
      };
      
      const result = await writer.addHostEntry(sampleParsedFile, newEntry);
      
      expect(result.success).toBe(true);
      expect(fs.writeFile).toHaveBeenCalled();
      
      // Verify the written content would contain the new entry
      const writeCallArgs = (fs.writeFile as jest.Mock).mock.calls[0];
      const writtenContent = writeCallArgs[1];
      expect(writtenContent).toContain('1.1.1.1\tnew-entry.com alias.new-entry.com # New entry');
    });
    
    it('should assign the correct line number to the new entry', async () => {
      const newEntry = {
        ip: '1.1.1.1',
        hostname: 'new-entry.com',
        enabled: true,
        aliases: [] as string[]
      };
      
      // Capture the writeHostsFile calls to inspect the parsed file that's passed
      const spy = jest.spyOn(writer, 'writeHostsFile');
      
      await writer.addHostEntry(sampleParsedFile, newEntry);
      
      // Get the parsed file that was passed to writeHostsFile
      const updatedParsedFile: ParsedHostsFile = spy.mock.calls[0][0];
      
      // Find the newly added entry
      const addedEntry = updatedParsedFile.entries.find(entry => entry.hostname === newEntry.hostname);
      
      expect(addedEntry).toBeDefined();
      expect(addedEntry!.lineNumber).toBe(6); // Should be one more than the last line number
    });
  });
  
  describe('removeHostEntry', () => {
    it('should remove an entry from the hosts file', async () => {
      const lineNumberToRemove = 4; // Line number of the entry to remove
      
      const result = await writer.removeHostEntry(sampleParsedFile, lineNumberToRemove);
      
      expect(result.success).toBe(true);
      expect(fs.writeFile).toHaveBeenCalled();
      
      // Verify the written content would not contain the removed entry
      const writeCallArgs = (fs.writeFile as jest.Mock).mock.calls[0];
      const writtenContent = writeCallArgs[1];
      expect(writtenContent).not.toContain('192.168.1.1 example.com www.example.com');
      
      // But should still contain other entries
      expect(writtenContent).toContain('127.0.0.1\tlocalhost');
    });
    
    it('should not fail if the entry does not exist', async () => {
      const nonExistentLineNumber = 999;
      
      const result = await writer.removeHostEntry(sampleParsedFile, nonExistentLineNumber);
      
      expect(result.success).toBe(true);
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });
  
  describe('toggleHostEntry', () => {
    it('should toggle an enabled entry to disabled', async () => {
      const lineNumber = 1; // Line number of an enabled entry (127.0.0.1 localhost)
      
      const result = await writer.toggleHostEntry(sampleParsedFile, lineNumber);
      
      expect(result.success).toBe(true);
      expect(fs.writeFile).toHaveBeenCalled();
      
      // Verify the written content would contain the disabled entry
      const writeCallArgs = (fs.writeFile as jest.Mock).mock.calls[0];
      const writtenContent = writeCallArgs[1];
      expect(writtenContent).toContain('# 127.0.0.1\tlocalhost');
    });
    
    it('should toggle a disabled entry to enabled', async () => {
      const lineNumber = 4; // Line number of a disabled entry (192.168.1.1 example.com)
      
      const result = await writer.toggleHostEntry(sampleParsedFile, lineNumber);
      
      expect(result.success).toBe(true);
      expect(fs.writeFile).toHaveBeenCalled();
      
      // Verify the written content would contain the enabled entry
      const writeCallArgs = (fs.writeFile as jest.Mock).mock.calls[0];
      const writtenContent = writeCallArgs[1];
      expect(writtenContent).toContain('192.168.1.1\texample.com');
      expect(writtenContent).not.toContain('# 192.168.1.1\texample.com');
    });
    
    it('should return an error if the entry is not found', async () => {
      const nonExistentLineNumber = 999;
      
      const result = await writer.toggleHostEntry(sampleParsedFile, nonExistentLineNumber);
      
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Host entry not found');
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });
});