/**
 * Parses Lua files to extract export definitions, state bag assignments, and their documentation
 */
export class LuaParser {
  constructor() {
    this.exports = [];
    this.globalStates = [];
    this.playerStates = [];
    this.localPlayerStates = [];
  }

  /**
   * Parse a Lua file content and extract all exports
   * @param {string} content - The Lua file content
   * @param {string} filePath - The file path for context
   * @returns {Array} Array of export definitions
   */
  parse(content, filePath) {
    this.exports = [];
    const lines = content.split('\n');

    const context = this.detectContext(filePath);

    // Find all the exports
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes('exports(')) {
        const exportData = this.parseExport(lines, i, context);
        if (exportData) {
          this.exports.push(exportData);
        }
      }
    }

    return this.exports;
  }

  /**
   * Parse GlobalState assignments from Lua file content
   * @param {string} content - The Lua file content
   * @param {string} filePath - The file path for context
   * @returns {Array} Array of GlobalState definitions
   */
  parseGlobalStates(content, filePath) {
    this.globalStates = [];
    const lines = content.split('\n');
    const context = this.detectContext(filePath);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip commented lines
      if (line.startsWith('--')) {
        continue;
      }

      // Match GlobalState.key = value
      const match = line.match(/GlobalState\.(\w+)\s*=\s*(.+)/);
      if (match) {
        const name = match[1];
        const value = match[2].trim();
        const type = this.inferTypeFromValue(value);

        this.globalStates.push({
          name,
          type,
          context,
          filePath,
          value
        });
      }
    }

    return this.globalStates;
  }

  /**
   * Infer Lua type from a value string
   * @param {string} value
   * @returns {string}
   */
  inferTypeFromValue(value) {
    // Remove trailing comments
    value = value.split('--')[0].trim();

    // Boolean
    if (value === 'true' || value === 'false') {
      return 'boolean';
    }

    // Nil
    if (value === 'nil') {
      return 'nil';
    }

    // String (single or double quotes)
    if ((value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"'))) {
      return 'string';
    }

    // Number
    if (/^-?\d+\.?\d*$/.test(value)) {
      return 'number';
    }

    // Table
    if (value.startsWith('{')) {
      return 'table';
    }

    // Default to any for complex expressions
    return 'any';
  }

  /**
   * Parse Player and LocalPlayer state assignments from Lua file content
   * @param {string} content - The Lua file content
   * @param {string} filePath - The file path for context
   * @returns {Object} Object containing playerStates and localPlayerStates arrays
   */
  parsePlayerStates(content, filePath) {
    this.playerStates = [];
    this.localPlayerStates = [];
    const lines = content.split('\n');
    const context = this.detectContext(filePath);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip commented lines
      if (line.startsWith('--')) {
        continue;
      }

      // Match Player(something).state:set('key', value, replicated)
      // or Player(something).state.set('key', value, replicated)
      const playerMatch = line.match(/Player\([^)]+\)\.state[:.]set\(\s*['"]([^'"]+)['"]\s*,\s*([^,]+)(?:,\s*([^)]+))?\)/);

      if (playerMatch) {
        const name = playerMatch[1];
        const value = playerMatch[2].trim();
        const replicated = playerMatch[3] ? playerMatch[3].trim() : 'false';
        const type = this.inferTypeFromValue(value);

        this.playerStates.push({
          name,
          type,
          context,
          filePath,
          value,
          replicated: replicated === 'true'
        });
      }

      // Match LocalPlayer.state:set('key', value, replicated)
      // or LocalPlayer.state.set('key', value, replicated)
      const localPlayerMatch = line.match(/LocalPlayer\.state[:.]set\(\s*['"]([^'"]+)['"]\s*,\s*([^,]+)(?:,\s*([^)]+))?\)/);

      if (localPlayerMatch) {
        const name = localPlayerMatch[1];
        const value = localPlayerMatch[2].trim();
        const replicated = localPlayerMatch[3] ? localPlayerMatch[3].trim() : 'false';
        const type = this.inferTypeFromValue(value);

        this.localPlayerStates.push({
          name,
          type,
          context,
          filePath,
          value,
          replicated: replicated === 'true'
        });
      }
    }

    return {
      playerStates: this.playerStates,
      localPlayerStates: this.localPlayerStates
    };
  }

  /**
   * Detect if file is client, server, or shared
   * @param {string} filePath
   * @returns {string}
   */
  detectContext(filePath) {
    const lowerPath = filePath.toLowerCase();

    if (lowerPath.includes('client')) {
      return 'client';
    } else if (lowerPath.includes('server')) {
      return 'server';
    } else if (lowerPath.includes('shared')) {
      return 'shared';
    }

    return 'shared';
  }

  /**
   * Parse an export statement and its documentation
   * @param {Array} lines - All lines in the file
   * @param {number} lineIndex - Index of the export line
   * @param {string} context - client/server/shared
   * @returns {Object|null}
   */
  parseExport(lines, lineIndex, context) {
    const exportLine = lines[lineIndex];

    // If an export contains the world function and parentheses right after, it's an inline function (hopefully)
    const isInline = exportLine.includes('function(') || exportLine.includes('function (');

    // Match export with either a function reference or inline function
    let exportMatch = exportLine.match(/exports\s*\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)\s*\)/);
    let exportName, functionRef;

    if (exportMatch) {
      exportName = exportMatch[1];
      functionRef = exportMatch[2];
    } else if (isInline) {
      const inlineMatch = exportLine.match(/exports\s*\(\s*['"]([^'"]+)['"]\s*,\s*function/);
      if (inlineMatch) {
        exportName = inlineMatch[1];
        functionRef = null; // No reference name for inline functions
      } else {
        return null;
      }
    } else {
      return null;
    }

    let functionDef = null;
    let docs = null;
    let functionLineIndex = lineIndex;

    if (!isInline) {
      // Look for function definition above
      const result = this.findFunctionDefinition(lines, lineIndex, functionRef);
      if (result) {
        functionDef = result.functionDef;
        functionLineIndex = result.lineIndex;
      }
    } else {
      functionDef = this.parseInlineFunction(lines, lineIndex);
    }

    // We need to look backwards for documentation comments
    docs = this.extractDocumentation(lines, functionLineIndex);

    return {
      name: exportName,
      context: context,
      documentation: docs,
      parameters: functionDef?.parameters || [],
      returnTypes: functionDef?.returnTypes || [],
      description: docs.description || '',
      filePath: lines[lineIndex]
    };
  }

  /**
   * Extract LuaDoc comments before a function definition
   * Looks backwards from the function definition to find documentation
   * @param {Array} lines - All lines in the file
   * @param {number} startIndex - Index to start searching backwards from
   * @returns {Object} Parsed documentation with description, params, returns, etc.
   */
  extractDocumentation(lines, startIndex) {
    const docs = {
      description: '',
      params: [],
      returns: [],
      rawComments: []
    };

    let i = startIndex - 1;
    const commentLines = [];
    let hasThreeDashComments = false;

    // Check if there are any three-dash comments (they take precedence over two-dash comments)
    let j = startIndex - 1;
    while (j >= 0) {
      const checkLine = lines[j].trim();
      if (checkLine.startsWith('---')) {
        hasThreeDashComments = true;
        break;
      } else if (checkLine === '' || checkLine.startsWith('--')) {
        j--;
      } else {
        break;
      }
    }

    // Collect all comment lines above the function and stop at first non-comment line
    while (i >= 0) {
      const line = lines[i].trim();

      if (line === '') {
        // Stop at empty line - no documentation
        break;
      } else if (line.startsWith('---')) {
        const commentContent = line.substring(3).trim();
        commentLines.unshift(commentContent);
        i--;
      } else if (line.startsWith('--') && !line.startsWith('---')) {
        // Collect two-dash comments also
        commentLines.unshift(line.substring(2).trim());
        i--;
      } else {
        // Stop at non-comment, non-empty line
        break;
      }
    }

    // Parse LuaDoc tags
    let descriptionLines = [];
    let foundTag = false;

    for (const line of commentLines) {
      if (line.startsWith('@param')) {
        foundTag = true;
        const paramMatch = line.match(/@param\s+(\w+)\s+([^\s]+)(?:\s+(.+))?/);
        if (paramMatch) {
          docs.params.push({
            name: paramMatch[1],
            type: paramMatch[2],
            description: paramMatch[3] || ''
          });
        }
      } else if (line.startsWith('@return')) {
        foundTag = true;
        const returnMatch = line.match(/@return\s+([^\s]+)(?:\s+(.+))?/);
        if (returnMatch) {
          docs.returns.push({
            type: returnMatch[1],
            description: returnMatch[2] || ''
          });
        }
      } else if (line.startsWith('@deprecated')) {
        foundTag = true;
        docs.deprecated = line.substring('@deprecated'.length).trim();
      } else {
        // Regular description line - only add if we haven't found tags yet
        if (!foundTag && line.trim()) {
          descriptionLines.push(line);
        }
      }
    }

    docs.description = descriptionLines.join('\n').trim();
    docs.rawComments = commentLines;

    return docs;
  }

  /**
   * Find function definition by searching upward from the export statement
   * @param {Array} lines - All lines in the file
   * @param {number} exportLineIndex - Index of the export line
   * @param {string} functionName - Name of the function to find
   * @returns {Object|null} Function definition and line index, or null if not found
   */
  findFunctionDefinition(lines, exportLineIndex, functionName) {
    // Search upward for definition (maximum 500 lines above)
    for (let i = exportLineIndex - 1; i >= Math.max(0, exportLineIndex - 500); i--) {
      const line = lines[i].trim();

      // Skip commented-out lines
      if (line.startsWith('--')) {
        continue;
      }

      // Check for local function or global function
      const funcMatch = line.match(/(?:local\s+)?function\s+(\w+)\s*\(([^)]*)\)/);

      if (funcMatch && funcMatch[1] === functionName) {
        return {
          functionDef: this.parseFunctionSignature(funcMatch[2]),
          lineIndex: i
        };
      }
    }

    return null;
  }

  /**
   * Parse inline function definition from export statement
   * Handles multi-line function definitions
   * @param {Array} lines - All lines in the file
   * @param {number} lineIndex - Index of the export line
   * @returns {Object} Function signature with parameters and return types
   */
  parseInlineFunction(lines, lineIndex) {
    let combinedText = '';
    for (let i = 0; i < 5 && lineIndex + i < lines.length; i++) {
      combinedText += ' ' + lines[lineIndex + i].trim();

      const match = combinedText.match(/function\s*\(([^)]*)\)/);
      if (match) {
        return this.parseFunctionSignature(match[1]);
      }
    }

    return { parameters: [], returnTypes: [] };
  }

  /**
   * Parse function signature to extract parameters
   * @param {string} paramsString
   * @returns {Object}
   */
  parseFunctionSignature(paramsString) {
    const parameters = [];

    if (paramsString.trim()) {
      const params = paramsString.split(',').map(p => p.trim());

      for (const param of params) {
        if (param) {
          parameters.push({
            name: param,
            type: 'any' // Will be overridden by @param (if available)
          });
        }
      }
    }

    return { parameters, returnTypes: [] };
  }
}
