/**
 * Types for hosts file parsing and management
 */

/**
 * Represents a single entry in the hosts file
 */
export interface HostEntry {
  /** IP address (e.g., "127.0.0.1") */
  ip: string;
  /** Hostname (e.g., "localhost") */
  hostname: string;
  /** Whether this entry is enabled (uncommented) */
  enabled: boolean;
  /** Additional hostnames on the same line */
  aliases: string[];
  /** Any comment that appears at the end of the line */
  comment?: string;
  /** Original line number in the hosts file */
  lineNumber: number;
  /** The raw text of the original line */
  raw: string;
}

/**
 * Represents a comment line or empty line in the hosts file
 */
export interface CommentLine {
  /** The raw text of the comment or empty line */
  raw: string;
  /** Original line number in the hosts file */
  lineNumber: number;
}

/**
 * Type representing any line in the hosts file
 */
export type HostsFileLine = HostEntry | CommentLine;

/**
 * Represents the entire parsed hosts file
 */
export interface ParsedHostsFile {
  /** All lines in the hosts file (both entries and comments) */
  lines: HostsFileLine[];
  /** Only host entries (no comments or empty lines) */
  entries: HostEntry[];
  /** Path to the hosts file */
  filePath: string;
  /** Last time the file was modified */
  lastModified: Date;
}