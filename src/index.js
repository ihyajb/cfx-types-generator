import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { LuaParser } from './parser.js';
import { TypeGenerator } from './generator.js';
import { GlobalStateGenerator } from './globalStateGenerator.js';

const CONFIG_FILE = 'config.json';

/**
 * Load configuration from file
 */
function loadConfig() {
  const configPath = path.join(process.cwd(), CONFIG_FILE);

  if (!fs.existsSync(configPath)) {
    console.error(`❌ Error: ${CONFIG_FILE} not found in current directory`);
    process.exit(1);
  }

  try {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const userConfig = JSON.parse(configContent);
    return userConfig;
  } catch (error) {
    console.error(`❌ Error: Could not parse ${CONFIG_FILE}`);
    console.error(error.message);
    process.exit(1);
  }
}

/**
 * Find Lua files based on configuration
 */
async function findLuaFiles(config) {
  const { inputDir, excludePatterns } = config;

  if (config.verbose) {
    console.log('Exclude patterns:', excludePatterns);
  }

  const files = await glob('**/*.lua', {
    cwd: inputDir,
    ignore: excludePatterns,
    absolute: false
  });

  if (config.verbose) {
    console.log(`Found ${files.length} files before filtering`);
  }

  return files.map(file => path.join(inputDir, file));
}

/**
 * Detect resource name from file path
 * Looks for fxmanifest.lua in parent directories
 */
function detectResourceName(filePath, inputDir) {
  let currentDir = path.dirname(filePath);
  const inputDirResolved = path.resolve(inputDir);

  // Walk up the directory tree looking for fxmanifest.lua
  while (currentDir.startsWith(inputDirResolved)) {
    const manifestPath = path.join(currentDir, 'fxmanifest.lua');

    if (fs.existsSync(manifestPath)) {
      // Found fxmanifest.lua, use the directory name as resource name
      return path.basename(currentDir);
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break; // Reached root
    currentDir = parentDir;
  }

  // Fallback: use the first directory under inputDir
  const relativePath = path.relative(inputDirResolved, filePath);
  const parts = relativePath.split(path.sep);

  // Skip bracket folders like [qb], [standalone]
  for (const part of parts) {
    if (part && !part.startsWith('[')) {
      return part;
    }
  }

  return 'unknown_resource';
}

/**
 * Main execution function
 */
async function main() {
  console.log('🚀 FiveM Lua Type Generator by @ihyajb\n');

  const config = loadConfig();

  console.log(`Input Directory: ${config.inputDir}`);
  console.log(`Output Directory: ${config.outputDir}\n`);

  // Find all Lua files
  const luaFiles = await findLuaFiles(config);

  if (luaFiles.length === 0) {
    console.log('❌ No Lua files found');
    return;
  }

  console.log(`📁 Found ${luaFiles.length} Lua file${luaFiles.length === 1 ? '' : 's'} to parse`);

  const parser = new LuaParser();

  // Map to store generators per resource
  const generators = new Map();

  // GlobalState generator for all resources
  const globalStateGenerator = new GlobalStateGenerator();

  let totalExports = 0;
  let totalGlobalStates = 0;

  // Parse each file
  for (const filePath of luaFiles) {
    if (config.verbose) {
      console.log(`Processing: ${filePath}`);
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const exports = parser.parse(content, filePath);
      const globalStates = parser.parseGlobalStates(content, filePath);

      if (exports.length > 0) {
        // Detect resource name for this file
        const resourceName = detectResourceName(filePath, config.inputDir);

        // Get or create generator for this resource
        if (!generators.has(resourceName)) {
          generators.set(resourceName, new TypeGenerator(resourceName));
        }

        const generator = generators.get(resourceName);

        if (config.verbose) {
          console.log(`✓ Found ${exports.length} export${exports.length === 1 ? '' : 's'}`);
        }
        generator.addExports(exports, filePath);
        totalExports += exports.length;
      }

      if (globalStates.length > 0) {
        const resourceName = detectResourceName(filePath, config.inputDir);
        globalStateGenerator.addGlobalStates(globalStates, resourceName);
        totalGlobalStates += globalStates.length;

        if (config.verbose) {
          console.log(`✓ Found ${globalStates.length} GlobalState${globalStates.length === 1 ? '' : 's'}`);
        }
      }
    } catch (error) {
      console.error(`  ✗ Error parsing ${filePath}:`, error.message);
    }
  }

  console.log(`📊 Found ${totalExports} exports to document`);
  console.log(`🌐 Found ${totalGlobalStates} GlobalState assignments (${globalStateGenerator.getCount()} unique)`);

  if (totalExports === 0 && globalStateGenerator.getCount() === 0) {
    console.log('❌ No exports or GlobalStates found in Lua files');
    return;
  }

  // Generate type files for each resource
  console.log(`📝 Generating type definitions for ${generators.size} resource${generators.size === 1 ? '' : 's'}...`);

  for (const [resourceName, generator] of generators) {
    const outputDir = path.join(config.outputDir, resourceName);

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const typeFiles = generator.generate();

    // Write type files
    for (const [filename, content] of Object.entries(typeFiles)) {
      const outputPath = path.join(outputDir, filename);
      fs.writeFileSync(outputPath, content, 'utf-8');
      console.log(`  ✓ Generated: ${outputPath}`);
    }
  }

  // Generate GlobalState types in _internal folder
  if (globalStateGenerator.getCount() > 0) {
    console.log(`\n🌐 Generating GlobalState definitions...`);
    const internalDir = path.join(config.outputDir, '_internal');

    if (!fs.existsSync(internalDir)) {
      fs.mkdirSync(internalDir, { recursive: true });
    }

    const globalStateFiles = globalStateGenerator.generate();

    for (const [filename, content] of Object.entries(globalStateFiles)) {
      const outputPath = path.join(internalDir, filename);
      fs.writeFileSync(outputPath, content, 'utf-8');
      console.log(`  ✓ Generated: ${outputPath}`);
    }
  }

  console.log('\n✅ Type generation complete!');
  console.log(`\n💡 Add this to your Lua.workspace.library in VS Code settings:`);
  console.log(`   "${path.resolve(config.outputDir).replace(/\\/g, '\\\\')}"`);
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
