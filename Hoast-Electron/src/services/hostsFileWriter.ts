import fs from 'node:fs/promises';
import { EventEmitter } from 'events';
import { HostEntry, CommentLine, HostsFileLine, ParsedHostsFile } from '../types/hostsFile';
import * as sudo from 'sudo-prompt';
import path from 'node:path';
import os from 'node:os';

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
 * Validation result for a host entry
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

/**
 * Service for writing changes to the hosts file
 */
export class HostsFileWriter extends EventEmitter {
  /**
   * Validate a host entry to ensure it's properly formatted
   * @param entry The host entry to validate
   * @returns Validation result with any errors
   */
  public validateHostEntry(entry: Partial<HostEntry>): ValidationResult {
    const errors: string[] = [];
    
    // Check for required fields
    if (!entry.ip) {
      errors.push('IP address is required');
    } else if (!this.isValidIP(entry.ip)) {
      errors.push('Invalid IP address format');
    }
    
    if (!entry.hostname) {
      errors.push('Hostname is required');
    } else if (!this.isValidHostname(entry.hostname)) {
      errors.push('Invalid hostname format');
    }
    
    // Validate aliases if present
    if (entry.aliases && entry.aliases.length > 0) {
      for (const alias of entry.aliases) {
        if (!this.isValidHostname(alias)) {
          errors.push(`Invalid alias format: ${alias}`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
  
  /**
   * Check if a string is a valid IP address (IPv4 or IPv6)
   */
  private isValidIP(ip: string): boolean {
    // IPv4 validation
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
      // Check each octet is <= 255
      const octets = ip.split('.');
      return octets.every(octet => parseInt(octet, 10) <= 255);
    }
    
    // IPv6 validation (simplified)
    // Full IPv6 validation is complex, this is a basic check
    if (/^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(ip)) {
      return true;
    }
    
    // IPv6 abbreviated forms (::)
    if (/^::([0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$/.test(ip)) {
      return true;
    }
    
    if (/^([0-9a-fA-F]{1,4}:){1,7}:$/.test(ip)) {
      return true;
    }
    
    if (/^([0-9a-fA-F]{1,4}:){1,6}:([0-9a-fA-F]{1,4}:){1,6}[0-9a-fA-F]{1,4}$/.test(ip)) {
      return true;
    }
    
    // Allow localhost special cases
    return ip === '::1' || ip === 'localhost';
  }
  
  /**
   * Check if a string is a valid hostname
   */
  private isValidHostname(hostname: string): boolean {
    // Hostnames follow RFC 1123 rules
    // Allow alphanumeric, -, and . characters
    // Cannot start/end with - or .
    // Maximum length 255 characters
    if (hostname.length > 255) {
      return false;
    }
    
    // Basic hostname validation
    if (!/^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])*(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])*)*$/.test(hostname)) {
      return false;
    }
    
    // Check each segment length (max 63 chars)
    const segments = hostname.split('.');
    return segments.every(segment => segment.length <= 63);
  }
  
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
        await this.writeWithElevatedPermissions(filePath, content);
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
   * Write to hosts file with elevated permissions using sudo-prompt
   * @param filePath Path to the hosts file
   * @param content Content to write to the file
   * @returns Promise that resolves when the write is complete
   */
  private writeWithElevatedPermissions(filePath: string, content: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create a temporary file with the content
      const tempDir = os.tmpdir();
      const tempFilePath = path.join(tempDir, `hoast-temp-${Date.now()}.txt`);
      
      // First, write to the temporary file
      fs.writeFile(tempFilePath, content, 'utf-8')
        .then(() => {
          // Create platform-specific command to copy the temp file to hosts file
          let command: string;
          if (process.platform === 'win32') {
            // Windows command using copy
            command = `cmd.exe /c copy "${tempFilePath}" "${filePath}" /Y`;
          } else {
            // Unix-based command using tee instead of cat + redirection
            // tee requires sudo and will write directly to the file with elevated permissions
            command = `tee "${filePath}" < "${tempFilePath}" && rm "${tempFilePath}"`;
          }
          
          // Execute the command with elevated permissions
          sudo.exec(command, {
            name: 'Hoast - Hosts File Manager',
            icns: process.platform === 'darwin' ? path.join(process.resourcesPath, 'icon.icns') : undefined, // macOS icon
          }, (error, stdout, stderr) => {
            // Clean up temp file on Unix-like platforms is done in the command
            // For Windows, we need to clean up the temp file here
            if (process.platform === 'win32') {
              // Handle cleanup of temp file, but don't fail if it errors
              fs.unlink(tempFilePath)
                .catch(unlinkError => {
                  // Just log the error, don't reject the promise
                  console.warn(`Failed to delete temporary file: ${unlinkError.message}`);
                });
            }
            
            if (error) {
              reject(new Error(`Error writing to hosts file: ${stderr || error.message}`));
            } else {
              resolve();
            }
          });
        })
        .catch(err => {
          reject(new Error(`Failed to write temporary file: ${err.message}`));
        });
    });
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
    // Validate the new entry
    const validationResult = this.validateHostEntry(newEntry);
    if (!validationResult.valid) {
      return {
        success: false,
        error: new Error(`Validation failed: ${validationResult.errors?.join(', ')}`),
        filePath: parsedFile.filePath
      };
    }
    
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
  
  /**
   * Execute a command with elevated privileges using sudo-prompt
   * @param command The command to execute
   * @param args The arguments to pass to the command
   * @param description A description of what the command does
   * @returns Promise that resolves when the command completes
   */
  public executeWithElevatedPrivileges(command: string, args: string[], description: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Format the command and arguments into a single string
      const fullCommand = `${command} ${args.join(' ')}`;
      
      // Execute the command with elevated permissions
      sudo.exec(fullCommand, {
        name: 'Hoast - Hosts File Manager',
        icns: process.platform === 'darwin' ? path.join(process.resourcesPath, 'icon.icns') : undefined, // macOS icon
      }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Failed to execute "${description}": ${stderr || error.message}`));
        } else {
          resolve();
        }
      });
    });
  }
}