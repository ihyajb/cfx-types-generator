/**
 * Parses Lua files to extract export definitions and their documentation
 */
export class LuaParser {
  constructor() {
    this.exports = [];
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

    let isInline = false;
    let inlineCheckText = exportLine;

    // Check up to 3 lines ahead for inline function definition
    for (let i = 0; i < 3 && lineIndex + i < lines.length; i++) {
      const checkLine = lines[lineIndex + i].trim();
      // Skip commented lines when checking for inline functions
      if (!checkLine.startsWith('--')) {
        inlineCheckText += ' ' + checkLine;
        if (inlineCheckText.includes('function(') || inlineCheckText.includes('function (')) {
          isInline = true;
          break;
        }
      }
    }

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
   * Extract LuaDoc comments before a line
   * @param {Array} lines
   * @param {number} startIndex
   * @returns {Object}
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

    // Check if there are any three-dash comments (since they take precedence)
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

    // Collects all comment lines above & stop at first non-comment line
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
   * Find function definition by name
   * @param {Array} lines
   * @param {number} exportLineIndex
   * @param {string} functionName
   * @returns {Object|null}
   */
  findFunctionDefinition(lines, exportLineIndex, functionName) {
    // Search up for definition (is 500 lines enough or too much?)
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
   * Parse inline function
   * @param {Array} lines
   * @param {number} lineIndex
   * @returns {Object}
   */
  parseInlineFunction(lines, lineIndex) {
    // Combine next few lines to handle multi-line function definitions (why do devs do this ಠ_ಠ)
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
