/**
 * Generates Lua type definition files for GlobalState variables
 */
export class GlobalStateGenerator {
  constructor() {
    this.globalStates = new Map(); // Map of state name to type info
    this.playerStates = new Map(); // Map of Player state name to type info
    this.localPlayerStates = new Map(); // Map of LocalPlayer state name to type info
  }

  /**
   * Add GlobalState definitions from a resource
   * @param {Array} states - Array of GlobalState definitions
   * @param {string} resourceName - Name of the resource
   */
  addGlobalStates(states, resourceName) {
    for (const state of states) {
      const existing = this.globalStates.get(state.name);

      if (existing) {
        // If we've seen this GlobalState before, track which resources use it
        if (!existing.resources.includes(resourceName)) {
          existing.resources.push(resourceName);
        }

        // If types differ, use 'any' as a fallback
        if (existing.type !== state.type) {
          existing.type = 'any';
        }
      } else {
        // First time seeing this GlobalState
        this.globalStates.set(state.name, {
          name: state.name,
          type: state.type,
          context: state.context,
          resources: [resourceName],
          value: state.value
        });
      }
    }
  }

  /**
   * Add Player state definitions from a resource
   * @param {Array} states - Array of Player state definitions
   * @param {string} resourceName - Name of the resource
   */
  addPlayerStates(states, resourceName) {
    for (const state of states) {
      const existing = this.playerStates.get(state.name);

      if (existing) {
        if (!existing.resources.includes(resourceName)) {
          existing.resources.push(resourceName);
        }

        if (existing.type !== state.type) {
          existing.type = 'any';
        }
      } else {
        this.playerStates.set(state.name, {
          name: state.name,
          type: state.type,
          context: state.context,
          resources: [resourceName],
          value: state.value,
          replicated: state.replicated
        });
      }
    }
  }

  /**
   * Add LocalPlayer state definitions from a resource
   * @param {Array} states - Array of LocalPlayer state definitions
   * @param {string} resourceName - Name of the resource
   */
  addLocalPlayerStates(states, resourceName) {
    for (const state of states) {
      const existing = this.localPlayerStates.get(state.name);

      if (existing) {
        if (!existing.resources.includes(resourceName)) {
          existing.resources.push(resourceName);
        }

        if (existing.type !== state.type) {
          existing.type = 'any';
        }
      } else {
        this.localPlayerStates.set(state.name, {
          name: state.name,
          type: state.type,
          context: state.context,
          resources: [resourceName],
          value: state.value,
          replicated: state.replicated
        });
      }
    }
  }

  /**
   * Generate type definition files for GlobalState
   * @returns {Object} Map of filename to content
   */
  generate() {
    const files = {};

    if (this.globalStates.size === 0 && this.playerStates.size === 0 && this.localPlayerStates.size === 0) {
      return files;
    }

    // Generate the main state type definition file
    files['shared.lua'] = this.generateStateFile();

    return files;
  }

  /**
   * Generate the state type definition file
   * @returns {string}
   */
  generateStateFile() {
    let content = '---@meta\n\n';

    // GlobalState section
    if (this.globalStates.size > 0) {
      content += '---Global state table accessible across all clients and server\n';
      content += '---@class GlobalStateTable\n';

      const sortedGlobalStates = Array.from(this.globalStates.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      for (const state of sortedGlobalStates) {
        // if (state.resources.length > 0) {
        //   content += `---Used by: ${state.resources.join(', ')}\n`;
        // }
        content += `---@field ${state.name} ${state.type}\n`;
      }

      content += '\n---@type GlobalStateTable\n';
      content += 'GlobalState = {}\n\n';
    }

    // Shared Player/LocalPlayer state section
    if (this.playerStates.size > 0 || this.localPlayerStates.size > 0) {
      content += '---Player state table\n';
      content += '---@class StateBagInterface\n';

      // Merge all player and local player states
      const allStates = new Map();

      // Add all Player() states
      for (const [name, state] of this.playerStates) {
        allStates.set(name, {
          ...state,
          contexts: ['server'],
          replication: state.replicated ? 'to client' : 'server only'
        });
      }

      // Add all LocalPlayer states
      for (const [name, state] of this.localPlayerStates) {
        const existing = allStates.get(name);
        if (existing) {
          // Already exists, merge
          existing.contexts.push('client');
        //   if (!existing.resources.includes(...state.resources)) {
        //     existing.resources.push(...state.resources);
        //   }
          // Update replication info
          if (state.replicated) {
            if (existing.replication === 'server only') {
              existing.replication = 'bidirectional';
            } else if (existing.replication === 'to client') {
              existing.replication = 'bidirectional';
            }
          }
          // If types differ, use 'any'
          if (existing.type !== state.type) {
            existing.type = 'any';
          }
        } else {
          // Add as new state
          allStates.set(name, {
            ...state,
            contexts: ['client'],
            replication: state.replicated ? 'to server' : 'client only'
          });
        }
      }

      const sortedStates = Array.from(allStates.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      for (const state of sortedStates) {
        //TODO: Make this clearer later
        // if (state.resources.length > 0) {
        //   content += `---Used by: ${state.resources.join(', ')}\n`;
        // }
        // content += `---Contexts: ${state.contexts.join(', ')}<br>\n`;
        // if (state.replication !== 'client only' && state.replication !== 'server only') {
        //   content += `---Replicated: ${state.replication}<br>\n`;
        // }
        content += `---@field ${state.name} ${state.type}<br>\n`;
      }

      content += '---@field set fun(self: any, key: string, value: any, replicated?: boolean)\n';

      content += '\n---Set a state bag value\n';
      content += '---@param key string The state key to set\n';
      content += '---@param value any The value to set\n';
      content += '---@param replicated boolean Whether to replicate to clients (server) or server (client)\n';
      content += 'function StateBagInterface:set(key, value, replicated) end\n\n';

      content += '---@class PlayerTable\n';
      content += '---@field state StateBagInterface\n';
      content += '\n---Get player by server id\n';
      content += '---@param serverId number\n';
      content += '---@return PlayerTable\n';
      content += 'function Player(serverId) end\n\n';

      content += '---@class LocalPlayerTable\n';
      content += '---@field state StateBagInterface\n';
      content += '\n---@type LocalPlayerTable\n';
      content += 'LocalPlayer = {}\n';
    }

    return content;
  }

  /**
   * Get count of unique GlobalState variables found
   * @returns {number}
   */
  getCount() {
    return this.globalStates.size;
  }

  /**
   * Get count of unique Player state variables found
   * @returns {number}
   */
  getPlayerStateCount() {
    return this.playerStates.size;
  }

  /**
   * Get count of unique LocalPlayer state variables found
   * @returns {number}
   */
  getLocalPlayerStateCount() {
    return this.localPlayerStates.size;
  }

  /**
   * Get total count of all state variables
   * @returns {number}
   */
  getTotalCount() {
    return this.globalStates.size + this.playerStates.size + this.localPlayerStates.size;
  }
}
