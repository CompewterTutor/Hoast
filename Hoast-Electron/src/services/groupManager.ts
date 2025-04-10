// filepath: /Users/hippo/git_repos/personal/Hoast/Hoast-Electron/src/services/groupManager.ts
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { HostGroup, HostEntry, ParsedHostsFile } from '../types/hostsFile';
import { v4 as uuidv4 } from 'uuid';

/**
 * GroupManager events
 */
export enum GroupManagerEvent {
  /** Emitted when groups are loaded */
  LOADED = 'loaded',
  /** Emitted when groups are saved */
  SAVED = 'saved',
  /** Emitted when a group is created */
  GROUP_CREATED = 'group-created',
  /** Emitted when a group is updated */
  GROUP_UPDATED = 'group-updated',
  /** Emitted when a group is deleted */
  GROUP_DELETED = 'group-deleted',
  /** Emitted when entries are assigned to a group */
  ENTRIES_ASSIGNED = 'entries-assigned',
  /** Emitted when entries are removed from a group */
  ENTRIES_REMOVED = 'entries-removed',
  /** Emitted when an error occurs */
  ERROR = 'error'
}

/**
 * Options for group operations
 */
export interface GroupOperationOptions {
  /** Whether to save changes to disk immediately */
  saveImmediately?: boolean;
}

/**
 * Host entry group filter criteria
 */
export interface GroupFilterCriteria {
  /** Hostname pattern to match (regex or string) */
  hostnamePattern?: string | RegExp;
  /** IP address pattern to match (regex or string) */
  ipPattern?: string | RegExp;
}

/**
 * Options for auto-grouping entries
 */
export interface AutoGroupOptions {
  /** Criteria for each group */
  criteria: {
    /** Group name */
    name: string;
    /** Optional group description */
    description?: string;
    /** Filter criteria for this group */
    filter: GroupFilterCriteria;
    /** Optional group color */
    color?: string;
  }[];
  /** Whether to assign entries that don't match any criteria to a special "Ungrouped" group */
  createUngroupedGroup?: boolean;
  /** Whether to save changes to disk immediately */
  saveImmediately?: boolean;
}

/**
 * Manages host entry groups
 */
export class GroupManager extends EventEmitter {
  /** Path to the groups file */
  private groupsFilePath: string;
  /** Current groups */
  private groups: HostGroup[] = [];
  /** Mapping of entry hostnames to group IDs */
  private entryGroupMapping: { [hostname: string]: string } = {};
  /** Whether the groups have been loaded */
  private isLoaded: boolean = false;

  /**
   * Creates a new group manager
   * @param groupsFilename Optional custom filename for the groups file
   */
  constructor(groupsFilename: string = 'groups.json') {
    super();
    this.groupsFilePath = path.join(app.getPath('userData'), groupsFilename);
  }

  /**
   * Loads groups from disk
   * @returns Promise that resolves when the groups are loaded
   */
  async loadGroups(): Promise<HostGroup[]> {
    try {
      // Check if groups file exists
      if (fs.existsSync(this.groupsFilePath)) {
        // Read and parse the groups file
        const fileContent = await fs.promises.readFile(this.groupsFilePath, 'utf-8');
        const data = JSON.parse(fileContent);
        
        // Load groups and mappings
        this.groups = data.groups || [];
        this.entryGroupMapping = data.entryGroupMapping || {};
        this.isLoaded = true;
        
        this.emit(GroupManagerEvent.LOADED, this.groups);
        return this.groups;
      } else {
        // Groups file doesn't exist, initialize with empty arrays
        this.groups = [];
        this.entryGroupMapping = {};
        this.isLoaded = true;
        await this.saveGroups();
        
        return this.groups;
      }
    } catch (error) {
      this.emit(GroupManagerEvent.ERROR, error);
      // Fall back to empty arrays
      this.groups = [];
      this.entryGroupMapping = {};
      this.isLoaded = true;
      return this.groups;
    }
  }

  /**
   * Saves the current groups to disk
   * @returns Promise that resolves when the groups are saved
   */
  async saveGroups(): Promise<void> {
    try {
      // Ensure the directory exists
      const groupsDir = path.dirname(this.groupsFilePath);
      await fs.promises.mkdir(groupsDir, { recursive: true });
      
      // Write the groups file
      const data = {
        groups: this.groups,
        entryGroupMapping: this.entryGroupMapping,
        lastUpdated: new Date().toISOString()
      };
      
      await fs.promises.writeFile(
        this.groupsFilePath,
        JSON.stringify(data, null, 2),
        'utf-8'
      );
      
      this.emit(GroupManagerEvent.SAVED, this.groups);
    } catch (error) {
      this.emit(GroupManagerEvent.ERROR, error);
      throw error;
    }
  }

  /**
   * Gets all groups
   * @returns Array of all groups
   */
  getGroups(): HostGroup[] {
    // Return a deep copy to prevent external modifications
    return JSON.parse(JSON.stringify(this.groups));
  }

  /**
   * Gets a specific group by ID
   * @param groupId The ID of the group to get
   * @returns The group, or undefined if not found
   */
  getGroupById(groupId: string): HostGroup | undefined {
    const group = this.groups.find(g => g.id === groupId);
    return group ? JSON.parse(JSON.stringify(group)) : undefined;
  }

  /**
   * Creates a new group
   * @param name Name of the group
   * @param options Additional options (description, color, etc.)
   * @param operationOptions Options for the create operation
   * @returns The newly created group
   */
  async createGroup(
    name: string,
    options: Partial<Omit<HostGroup, 'id' | 'name'>> = {},
    operationOptions: GroupOperationOptions = {}
  ): Promise<HostGroup> {
    // Make sure groups are loaded
    if (!this.isLoaded) {
      await this.loadGroups();
    }
    
    const newGroup: HostGroup = {
      id: uuidv4(),
      name,
      enabled: true, // Enabled by default
      ...options
    };
    
    this.groups.push(newGroup);
    this.emit(GroupManagerEvent.GROUP_CREATED, newGroup);
    
    if (operationOptions.saveImmediately !== false) {
      await this.saveGroups();
    }
    
    return JSON.parse(JSON.stringify(newGroup));
  }

  /**
   * Updates an existing group
   * @param groupId ID of the group to update
   * @param updates Updates to apply to the group
   * @param operationOptions Options for the update operation
   * @returns The updated group, or undefined if not found
   */
  async updateGroup(
    groupId: string,
    updates: Partial<Omit<HostGroup, 'id'>>,
    operationOptions: GroupOperationOptions = {}
  ): Promise<HostGroup | undefined> {
    // Make sure groups are loaded
    if (!this.isLoaded) {
      await this.loadGroups();
    }
    
    const groupIndex = this.groups.findIndex(g => g.id === groupId);
    if (groupIndex === -1) {
      return undefined;
    }
    
    // Apply updates
    const updatedGroup = {
      ...this.groups[groupIndex],
      ...updates
    };
    
    this.groups[groupIndex] = updatedGroup;
    this.emit(GroupManagerEvent.GROUP_UPDATED, updatedGroup);
    
    if (operationOptions.saveImmediately !== false) {
      await this.saveGroups();
    }
    
    return JSON.parse(JSON.stringify(updatedGroup));
  }

  /**
   * Deletes a group
   * @param groupId ID of the group to delete
   * @param operationOptions Options for the delete operation
   * @returns Whether the group was deleted
   */
  async deleteGroup(
    groupId: string,
    operationOptions: GroupOperationOptions = {}
  ): Promise<boolean> {
    // Make sure groups are loaded
    if (!this.isLoaded) {
      await this.loadGroups();
    }
    
    const groupIndex = this.groups.findIndex(g => g.id === groupId);
    if (groupIndex === -1) {
      return false;
    }
    
    // Remove the group
    const deletedGroup = this.groups.splice(groupIndex, 1)[0];
    
    // Update entry mappings
    Object.keys(this.entryGroupMapping).forEach(hostname => {
      if (this.entryGroupMapping[hostname] === groupId) {
        delete this.entryGroupMapping[hostname];
      }
    });
    
    this.emit(GroupManagerEvent.GROUP_DELETED, deletedGroup);
    
    if (operationOptions.saveImmediately !== false) {
      await this.saveGroups();
    }
    
    return true;
  }

  /**
   * Gets the group for a specific host entry
   * @param hostname The hostname of the entry
   * @returns The group the entry belongs to, or undefined if not found
   */
  getGroupForEntry(hostname: string): HostGroup | undefined {
    const groupId = this.entryGroupMapping[hostname];
    if (!groupId) {
      return undefined;
    }
    
    return this.getGroupById(groupId);
  }

  /**
   * Assigns entries to a group
   * @param groupId ID of the group to assign entries to
   * @param entries Entries to assign to the group
   * @param operationOptions Options for the assign operation
   */
  async assignEntriesToGroup(
    groupId: string,
    entries: HostEntry[] | string[],
    operationOptions: GroupOperationOptions = {}
  ): Promise<void> {
    // Make sure groups are loaded
    if (!this.isLoaded) {
      await this.loadGroups();
    }
    
    // Verify group exists
    const groupIndex = this.groups.findIndex(g => g.id === groupId);
    if (groupIndex === -1) {
      throw new Error(`Group with ID ${groupId} not found`);
    }
    
    // Map of hostnames that were newly assigned
    const assignedHostnames: string[] = [];
    
    // Update entry mappings
    if (Array.isArray(entries)) {
      entries.forEach(entry => {
        const hostname = typeof entry === 'string' ? entry : entry.hostname;
        this.entryGroupMapping[hostname] = groupId;
        assignedHostnames.push(hostname);
      });
    }
    
    this.emit(GroupManagerEvent.ENTRIES_ASSIGNED, {
      groupId,
      hostnames: assignedHostnames
    });
    
    if (operationOptions.saveImmediately !== false) {
      await this.saveGroups();
    }
  }

  /**
   * Removes entries from a group
   * @param entries Entries to remove from their group
   * @param operationOptions Options for the remove operation
   */
  async removeEntriesFromGroup(
    entries: HostEntry[] | string[],
    operationOptions: GroupOperationOptions = {}
  ): Promise<void> {
    // Make sure groups are loaded
    if (!this.isLoaded) {
      await this.loadGroups();
    }
    
    // Map of hostnames that were removed from groups
    const removedHostnames: string[] = [];
    
    // Update entry mappings
    if (Array.isArray(entries)) {
      entries.forEach(entry => {
        const hostname = typeof entry === 'string' ? entry : entry.hostname;
        if (this.entryGroupMapping[hostname]) {
          delete this.entryGroupMapping[hostname];
          removedHostnames.push(hostname);
        }
      });
    }
    
    this.emit(GroupManagerEvent.ENTRIES_REMOVED, {
      hostnames: removedHostnames
    });
    
    if (operationOptions.saveImmediately !== false) {
      await this.saveGroups();
    }
  }

  /**
   * Gets all entries in a specific group
   * @param hostsFile The parsed hosts file to get entries from
   * @param groupId ID of the group to get entries for
   * @returns Array of entries in the group
   */
  getEntriesInGroup(hostsFile: ParsedHostsFile, groupId: string): HostEntry[] {
    return hostsFile.entries.filter(entry => 
      this.entryGroupMapping[entry.hostname] === groupId
    );
  }

  /**
   * Toggles the enabled state of a group
   * @param groupId ID of the group to toggle
   * @param operationOptions Options for the toggle operation
   * @returns The updated group, or undefined if not found
   */
  async toggleGroup(
    groupId: string,
    operationOptions: GroupOperationOptions = {}
  ): Promise<HostGroup | undefined> {
    // Make sure groups are loaded
    if (!this.isLoaded) {
      await this.loadGroups();
    }
    
    const groupIndex = this.groups.findIndex(g => g.id === groupId);
    if (groupIndex === -1) {
      return undefined;
    }
    
    // Toggle the enabled state
    const updatedGroup = {
      ...this.groups[groupIndex],
      enabled: !this.groups[groupIndex].enabled
    };
    
    this.groups[groupIndex] = updatedGroup;
    this.emit(GroupManagerEvent.GROUP_UPDATED, updatedGroup);
    
    if (operationOptions.saveImmediately !== false) {
      await this.saveGroups();
    }
    
    return JSON.parse(JSON.stringify(updatedGroup));
  }

  /**
   * Auto-groups entries based on patterns
   * @param hostsFile The parsed hosts file to group entries from
   * @param options Options for auto-grouping
   */
  async autoGroupEntries(
    hostsFile: ParsedHostsFile,
    options: AutoGroupOptions
  ): Promise<void> {
    // Make sure groups are loaded
    if (!this.isLoaded) {
      await this.loadGroups();
    }
    
    // First, create the necessary groups if they don't exist
    const createdGroups: { [name: string]: string } = {};
    
    for (const criterion of options.criteria) {
      // Check if a group with this name already exists
      const existingGroup = this.groups.find(g => g.name === criterion.name);
      if (existingGroup) {
        createdGroups[criterion.name] = existingGroup.id;
      } else {
        // Create a new group
        const newGroup = await this.createGroup(
          criterion.name,
          {
            description: criterion.description,
            color: criterion.color
          },
          { saveImmediately: false } // Don't save yet to reduce disk operations
        );
        
        createdGroups[criterion.name] = newGroup.id;
      }
    }
    
    // Create an "Ungrouped" group if requested
    if (options.createUngroupedGroup) {
      const existingUngrouped = this.groups.find(g => g.name === 'Ungrouped');
      if (existingUngrouped) {
        createdGroups['Ungrouped'] = existingUngrouped.id;
      } else {
        const newGroup = await this.createGroup(
          'Ungrouped',
          { description: 'Entries that don\'t match any group criteria' },
          { saveImmediately: false }
        );
        
        createdGroups['Ungrouped'] = newGroup.id;
      }
    }
    
    // Now assign entries to groups based on criteria
    const assignedEntries = new Set<string>();
    
    for (const criterion of options.criteria) {
      const groupId = createdGroups[criterion.name];
      const matchingEntries = hostsFile.entries.filter(entry => {
        // Skip already assigned entries
        if (assignedEntries.has(entry.hostname)) {
          return false;
        }
        
        // Match based on hostname pattern
        if (criterion.filter.hostnamePattern) {
          const pattern = criterion.filter.hostnamePattern;
          const hostnameMatches = typeof pattern === 'string'
            ? entry.hostname.includes(pattern)
            : pattern.test(entry.hostname);
          
          if (!hostnameMatches) {
            return false;
          }
        }
        
        // Match based on IP pattern
        if (criterion.filter.ipPattern) {
          const pattern = criterion.filter.ipPattern;
          const ipMatches = typeof pattern === 'string'
            ? entry.ip.includes(pattern)
            : pattern.test(entry.ip);
          
          if (!ipMatches) {
            return false;
          }
        }
        
        // Entry matches all criteria
        return true;
      });
      
      if (matchingEntries.length > 0) {
        // Assign entries to this group
        await this.assignEntriesToGroup(
          groupId,
          matchingEntries,
          { saveImmediately: false }
        );
        
        // Mark entries as assigned
        matchingEntries.forEach(entry => {
          assignedEntries.add(entry.hostname);
        });
      }
    }
    
    // Assign remaining entries to "Ungrouped" if requested
    if (options.createUngroupedGroup) {
      const ungroupedEntries = hostsFile.entries.filter(entry => 
        !assignedEntries.has(entry.hostname)
      );
      
      if (ungroupedEntries.length > 0) {
        await this.assignEntriesToGroup(
          createdGroups['Ungrouped'],
          ungroupedEntries,
          { saveImmediately: false }
        );
      }
    }
    
    // Save all changes at once
    if (options.saveImmediately !== false) {
      await this.saveGroups();
    }
  }
}