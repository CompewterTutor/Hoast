import fs from 'node:fs/promises';
import { EventEmitter } from 'events';
import { HostEntry, CommentLine, HostsFileLine, ParsedHostsFile } from '../types/hostsFile';

/**
 * Events emitted by the HostsFileWriter
 */
export enum HostsFileWriterEvent {
  SUCCESS = 'success',
  ERROR = 'error'
}

/**
 * Result of a write operation
 */
export interface WriteResult {
  success: boolean;
  error?: Error;
  filePath: string;
}

/**
 * Options for writing to the hosts file
 */
export interface WriteOptions {
  /** Whether to make a backup of the hosts file before writing */
  createBackup?: boolean;
  /** Whether to use elevated permissions */
  useElevatedPermissions?: boolean;
}

/**
 * Service for writing changes to the hosts file
 */
export class HostsFileWriter extends EventEmitter {
  /**
   * Convert a parsed hosts file back to text
   * Preserves all formatting, comments, and structure of the original file
   */
  public convertToString(parsedFile: ParsedHostsFile): string {
    // Sort all lines by line number to ensure correct order
    const sortedLines = [...parsedFile.lines].sort((a, b) => a.lineNumber - b.lineNumber);
    
    // Convert each line back to string format
    const textLines = sortedLines.map(line => this.lineToString(line));
    
    // Join with appropriate line endings
    return textLines.join('\n');
  }
  
  /**
   * Convert a single line back to string format
   */
  private lineToString(line: HostsFileLine): string {
    // For comment lines or empty lines, just return the raw string
    if (!('ip' in line)) {
      return line.raw;
    }
    
    // For host entries, format based on enabled status and other properties
    const entry = line as HostEntry;
    
    // Start with comment character if disabled
    const prefix = entry.enabled ? '' : '# ';
    
    // Build the main part of the host entry
    let entryStr = `${prefix}${entry.ip}\t${entry.hostname}`;
    
    // Add aliases if any
    if (entry.aliases && entry.aliases.length > 0) {
      entryStr += ' ' + entry.aliases.join(' ');
    }
    
    // Add inline comment if present
    if (entry.comment) {
      entryStr += ' ' + entry.comment;
    }
    
    return entryStr;
  }
  
  /**
   * Write the hosts file to disk
   * @param parsedFile The parsed hosts file to write
   * @param options Options for the write operation
   * @returns Promise resolving to WriteResult
   */
  public async writeHostsFile(parsedFile: ParsedHostsFile, options: WriteOptions = {}): Promise<WriteResult> {
    try {
      const { filePath } = parsedFile;
      
      // Create backup if requested
      if (options.createBackup) {
        await this.createBackup(filePath);
      }
      
      // Convert parsed data to string
      const content = this.convertToString(parsedFile);
      
      // Write the file
      if (options.useElevatedPermissions) {
        // TODO: Implement elevated permissions writing
        // This will be implemented in a future task
        throw new Error('Elevated permissions not yet implemented');
      } else {
        // Regular file writing
        await fs.writeFile(filePath, content, 'utf-8');
      }
      
      // Emit success event
      const result: WriteResult = {
        success: true,
        filePath
      };
      this.emit(HostsFileWriterEvent.SUCCESS, result);
      
      return result;
    } catch (error) {
      // Emit error event
      const result: WriteResult = {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        filePath: parsedFile.filePath
      };
      this.emit(HostsFileWriterEvent.ERROR, result);
      
      return result;
    }
  }
  
  /**
   * Update a specific host entry in the parsed file and write it to disk
   * @param parsedFile The parsed hosts file
   * @param updatedEntry The entry with updated properties
   * @param options Options for the write operation
   * @returns Promise resolving to WriteResult
   */
  public async updateHostEntry(parsedFile: ParsedHostsFile, updatedEntry: HostEntry, options: WriteOptions = {}): Promise<WriteResult> {
    // Create a deep copy of the parsed file
    const updatedFile = this.cloneParsedFile(parsedFile);
    
    // Find the entry to update by line number
    const lineIndex = updatedFile.lines.findIndex(
      line => line.lineNumber === updatedEntry.lineNumber
    );
    
    if (lineIndex === -1) {
      return {
        success: false,
        error: new Error(`Host entry not found with line number ${updatedEntry.lineNumber}`),
        filePath: parsedFile.filePath
      };
    }
    
    // Update the entry in the lines array
    updatedFile.lines[lineIndex] = updatedEntry;
    
    // Also update the entry in the entries array
    const entryIndex = updatedFile.entries.findIndex(
      entry => entry.lineNumber === updatedEntry.lineNumber
    );
    
    if (entryIndex !== -1) {
      updatedFile.entries[entryIndex] = updatedEntry;
    }
    
    // Write the updated file
    return this.writeHostsFile(updatedFile, options);
  }
  
  /**
   * Add a new host entry to the hosts file
   * @param parsedFile The parsed hosts file
   * @param newEntry The new entry to add (without line number)
   * @param options Options for the write operation
   * @returns Promise resolving to WriteResult
   */
  public async addHostEntry(parsedFile: ParsedHostsFile, newEntry: Omit<HostEntry, 'lineNumber' | 'raw'>, options: WriteOptions = {}): Promise<WriteResult> {
    // Create a deep copy of the parsed file
    const updatedFile = this.cloneParsedFile(parsedFile);
    
    // Create a complete entry with line number and raw string
    const completeEntry: HostEntry = {
      ...newEntry,
      lineNumber: this.getNextLineNumber(updatedFile),
      raw: '' // Will be generated during convertToString
    };
    
    // Add the new entry to the lines array
    updatedFile.lines.push(completeEntry);
    
    // Add the new entry to the entries array
    updatedFile.entries.push(completeEntry);
    
    // Write the updated file
    return this.writeHostsFile(updatedFile, options);
  }
  
  /**
   * Remove a host entry from the hosts file
   * @param parsedFile The parsed hosts file
   * @param lineNumber The line number of the entry to remove
   * @param options Options for the write operation
   * @returns Promise resolving to WriteResult
   */
  public async removeHostEntry(parsedFile: ParsedHostsFile, lineNumber: number, options: WriteOptions = {}): Promise<WriteResult> {
    // Create a deep copy of the parsed file
    const updatedFile = this.cloneParsedFile(parsedFile);
    
    // Filter out the entry from the lines array
    updatedFile.lines = updatedFile.lines.filter(line => line.lineNumber !== lineNumber);
    
    // Filter out the entry from the entries array
    updatedFile.entries = updatedFile.entries.filter(entry => entry.lineNumber !== lineNumber);
    
    // Write the updated file
    return this.writeHostsFile(updatedFile, options);
  }
  
  /**
   * Toggle a host entry's enabled state
   * @param parsedFile The parsed hosts file
   * @param lineNumber The line number of the entry to toggle
   * @param options Options for the write operation
   * @returns Promise resolving to WriteResult
   */
  public async toggleHostEntry(parsedFile: ParsedHostsFile, lineNumber: number, options: WriteOptions = {}): Promise<WriteResult> {
    // Find the entry to toggle
    const entry = parsedFile.entries.find(entry => entry.lineNumber === lineNumber);
    
    if (!entry) {
      return {
        success: false,
        error: new Error(`Host entry not found with line number ${lineNumber}`),
        filePath: parsedFile.filePath
      };
    }
    
    // Create an updated entry with toggled enabled state
    const updatedEntry: HostEntry = {
      ...entry,
      enabled: !entry.enabled
    };
    
    // Update the entry
    return this.updateHostEntry(parsedFile, updatedEntry, options);
  }
  
  /**
   * Create a backup of the hosts file
   * @param filePath Path to the hosts file
   * @returns Promise resolving to the backup file path
   */
  private async createBackup(filePath: string): Promise<string> {
    const backupPath = `${filePath}.backup.${Date.now()}`;
    await fs.copyFile(filePath, backupPath);
    return backupPath;
  }
  
  /**
   * Get the next available line number
   */
  private getNextLineNumber(parsedFile: ParsedHostsFile): number {
    if (parsedFile.lines.length === 0) {
      return 0;
    }
    
    const maxLineNumber = Math.max(...parsedFile.lines.map(line => line.lineNumber));
    return maxLineNumber + 1;
  }
  
  /**
   * Create a deep copy of a parsed hosts file
   */
  private cloneParsedFile(parsedFile: ParsedHostsFile): ParsedHostsFile {
    return {
      lines: JSON.parse(JSON.stringify(parsedFile.lines)),
      entries: JSON.parse(JSON.stringify(parsedFile.entries)),
      filePath: parsedFile.filePath,
      lastModified: new Date(parsedFile.lastModified.getTime())
    };
  }
}