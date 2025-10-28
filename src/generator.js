/**
 * Generates Lua type definition files from parsed exports
 */
export class TypeGenerator {
  constructor(resourceName) {
    this.resourceName = resourceName;
    this.clientExports = [];
    this.serverExports = [];
    this.sharedExports = [];
  }

  /**
   * Add exports from a file
   * @param {Array} exports
   * @param {string} filePath
   */
  addExports(exports, filePath) {
    for (const exp of exports) {
      if (exp.context === 'client') {
        this.clientExports.push(exp);
      } else if (exp.context === 'server') {
        this.serverExports.push(exp);
      } else {
        this.sharedExports.push(exp);
      }
    }
  }

  /**
   * Generate all type definition files
   * @returns {Object} Map of filename to content
   */
  generate() {
    const files = {};

    // Always generate shared.lua with class definition for LSP autocomplete (since idk how else to do it)
    files['shared.lua'] = this.generateSharedFile();

    if (this.clientExports.length > 0) {
      files['client.lua'] = this.generateTypeFile(this.clientExports, 'client');
    }

    if (this.serverExports.length > 0) {
      files['server.lua'] = this.generateTypeFile(this.serverExports, 'server');
    }

    // If there are actual shared context exports, append them to shared.lua
    if (this.sharedExports.length > 0) {
      files['shared.lua'] += '\n' + this.generateTypeFile(this.sharedExports, 'shared');
    }

    return files;
  }

  /**
   * Generate the shared.lua file with base class definition for LSP autocomplete
   * @returns {string} Generated Lua type definition content
   */
  generateSharedFile() {
    const className = this.resourceName;

    // Use bracket notation if resource name has dashes
    const exportAccess = this.resourceName.includes('-')
      ? `exports['${this.resourceName}']`
      : `exports.${this.resourceName}`;

    return `---@meta\n\n---@class ${className}\n${exportAccess} = {}\n`;
  }

  /**
   * Generate a type definition file for a specific context
   * @param {Array} exports - Export definitions to generate
   * @param {string} context - Context (client/server/shared)
   * @returns {string} Generated Lua type definition content
   */
  generateTypeFile(exports, context) {
    let content = '---@meta\n\n';

    // Sort exports alphabetically for consistency
    const sortedExports = [...exports].sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    for (const exp of sortedExports) {
      content += this.generateExportDefinition(exp, context);
      content += '\n\n';
    }

    return content.trim() + '\n';
  }

  /**
   * Generate a single export definition with full documentation
   * @param {Object} exp - Export definition
   * @param {string} context - Context (client/server/shared)
   * @returns {string} Generated Lua type definition for the export
   */
  generateExportDefinition(exp, context) {
    let def = '';

    // Add context marker (client/server/shared)
    def += `---**\`${context}\`**\n`;

    // Add description or default message
    if (exp.description) {
      const descLines = exp.description.split('\n');
      for (const line of descLines) {
        if (line.trim()) {
          def += `---${line}\n`;
        }
      }
    } else {
      def += `---This export doesn't have a description\n`;
    }

    // Merge documentation params with function params
    const params = this.mergeParameters(exp.parameters, exp.documentation.params);

    // Loop through parameters to add
    for (const param of params) {
      def += `---@param ${param.name} ${param.type}`;
      if (param.description) {
        def += ` ${param.description}`;
      }
      def += '\n';
    }

    // return type documentation
    if (exp.documentation.returns.length > 0) {
      for (const ret of exp.documentation.returns) {
        def += `---@return ${ret.type}`;
        if (ret.description) {
          def += ` ${ret.description}`;
        }
        def += '\n';
      }
    }

    if (exp.documentation.deprecated) {
      def += `---@deprecated ${exp.documentation.deprecated}\n`;
    }

    // Generate function signature
    const paramNames = params.map(p => p.name).join(', ');

    // Use bracket notation if resource name contains a dash
    const exportAccess = this.resourceName.includes('-')
      ? `exports['${this.resourceName}']`
      : `exports.${this.resourceName}`;

    def += `function ${exportAccess}:${exp.name}(${paramNames}) end`;

    return def;
  }

  /**
   * Merge function parameters with their documentation
   * Combines information from both sources, preferring documented types
   * @param {Array} funcParams - Parameters from function signature
   * @param {Array} docParams - Parameters from documentation
   * @returns {Array} Merged parameter definitions
   */
  mergeParameters(funcParams, docParams) {
    const merged = [];

    // Create a map of documented parameters
    const docMap = new Map();
    for (const docParam of docParams) {
      docMap.set(docParam.name, docParam);
    }

    // Merge with function parameters
    for (const funcParam of funcParams) {
      const doc = docMap.get(funcParam.name);

      merged.push({
        name: funcParam.name,
        type: doc?.type || funcParam.type || 'any',
        description: doc?.description || ''
      });
    }

    // Add any documented parameters not in function signature
    for (const docParam of docParams) {
      if (!funcParams.find(p => p.name === docParam.name)) {
        merged.push({
          name: docParam.name,
          type: docParam.type,
          description: docParam.description
        });
      }
    }

    return merged;
  }

  /**
   * Clean and normalize type names
   * @param {string} type
   * @returns {string}
   */
  normalizeType(type) {
    // Map common Lua types to proper format
    const typeMap = {
      'string': 'string',
      'number': 'number',
      'boolean': 'boolean',
      'table': 'table',
      'function': 'function',
      'nil': 'nil',
      'any': 'any'
    };

    return typeMap[type.toLowerCase()] || type;
  }
}
