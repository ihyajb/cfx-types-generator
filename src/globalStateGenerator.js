/**
 * Generates Lua type definition files for GlobalState variables
 */
export class GlobalStateGenerator {
  constructor() {
    this.globalStates = new Map(); // Map of state name to type info
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
   * Generate type definition files for GlobalState
   * @returns {Object} Map of filename to content
   */
  generate() {
    const files = {};

    if (this.globalStates.size === 0) {
      return files;
    }

    // Generate the main GlobalState type definition
    files['shared.lua'] = this.generateGlobalStateFile();

    return files;
  }

  /**
   * Generate the GlobalState type definition file
   * @returns {string}
   */
  generateGlobalStateFile() {
    let content = '---@meta\n\n';
    content += '---Global state table accessible across all clients and server\n';
    content += '---@class GlobalStateTable\n';

    // Sort by name for consistency
    const sortedStates = Array.from(this.globalStates.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    for (const state of sortedStates) {
      // Add comment showing which resources use this GlobalState
      if (state.resources.length > 0) {
        content += `---Used by: ${state.resources.join(', ')}\n`;
      }

      content += `---@field ${state.name} ${state.type}\n`;
    }

    content += '\n---@type GlobalStateTable\n';
    content += 'GlobalState = {}\n';

    return content;
  }

  /**
   * Get count of unique GlobalState variables found
   * @returns {number}
   */
  getCount() {
    return this.globalStates.size;
  }
}
