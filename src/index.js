import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { LuaParser } from './parser.js';
import { TypeGenerator } from './generator.js';
import { StateBagGenerator } from './state_generator.js';

const CONFIG_FILE = 'config.json';

/**
 * Load configuration from file
 * @returns {Object} Parsed configuration object
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
 * @param {Object} config - Configuration object
 * @returns {Promise<Array>} Array of file paths
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
 * Detect resource name from file path by looking for fxmanifest.lua
 * @param {string} filePath - Full path to the file
 * @param {string} inputDir - Base input directory
 * @returns {string} Detected resource name
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

  // Map to store type generators per resource
  const resourceGenerators = new Map();

  // State bag generator for all resources (GlobalState, Player.state, LocalPlayer.state)
  const stateBagGenerator = new StateBagGenerator();

  let totalExports = 0;
  let totalGlobalStates = 0;
  let totalPlayerStates = 0;
  let totalLocalPlayerStates = 0;

  // Parse each file
  for (const filePath of luaFiles) {
    if (config.verbose) {
      console.log(`Processing: ${filePath}`);
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const exports = parser.parse(content, filePath);
      const globalStates = parser.parseGlobalStates(content, filePath);
      const playerStatesResult = parser.parsePlayerStates(content, filePath);

      if (exports.length > 0) {
        // Detect resource name for this file
        const resourceName = detectResourceName(filePath, config.inputDir);

        // Get or create type generator for this resource
        if (!resourceGenerators.has(resourceName)) {
          resourceGenerators.set(resourceName, new TypeGenerator(resourceName));
        }

        const generator = resourceGenerators.get(resourceName);

        if (config.verbose) {
          console.log(`✓ Found ${exports.length} export${exports.length === 1 ? '' : 's'}`);
        }
        generator.addExports(exports, filePath);
        totalExports += exports.length;
      }

      if (globalStates.length > 0) {
        const resourceName = detectResourceName(filePath, config.inputDir);
        stateBagGenerator.addGlobalStates(globalStates, resourceName);
        totalGlobalStates += globalStates.length;

        if (config.verbose) {
          console.log(`✓ Found ${globalStates.length} GlobalState${globalStates.length === 1 ? '' : 's'}`);
        }
      }

      if (playerStatesResult.playerStates.length > 0) {
        const resourceName = detectResourceName(filePath, config.inputDir);
        stateBagGenerator.addPlayerStates(playerStatesResult.playerStates, resourceName);
        totalPlayerStates += playerStatesResult.playerStates.length;

        if (config.verbose) {
          console.log(`✓ Found ${playerStatesResult.playerStates.length} Player state${playerStatesResult.playerStates.length === 1 ? '' : 's'}`);
        }
      }

      if (playerStatesResult.localPlayerStates.length > 0) {
        const resourceName = detectResourceName(filePath, config.inputDir);
        stateBagGenerator.addLocalPlayerStates(playerStatesResult.localPlayerStates, resourceName);
        totalLocalPlayerStates += playerStatesResult.localPlayerStates.length;

        if (config.verbose) {
          console.log(`✓ Found ${playerStatesResult.localPlayerStates.length} LocalPlayer state${playerStatesResult.localPlayerStates.length === 1 ? '' : 's'}`);
        }
      }
    } catch (error) {
      console.error(`  ✗ Error parsing ${filePath}:`, error.message);
    }
  }

  console.log(`📊 Found ${totalExports} exports to document`);
  console.log(`🌐 Found ${totalGlobalStates} GlobalState assignments (${stateBagGenerator.getCount()} unique)`);
  console.log(`👤 Found ${totalPlayerStates + totalLocalPlayerStates} Player/LocalPlayer state assignments (${stateBagGenerator.getPlayerStateCount() + stateBagGenerator.getLocalPlayerStateCount()} unique)`);

  if (totalExports === 0 && stateBagGenerator.getTotalCount() === 0) {
    console.log('❌ No exports or states found in Lua files');
    return;
  }

  // Generate type files for each resource
  console.log(`📝 Generating type definitions for ${resourceGenerators.size} resource${resourceGenerators.size === 1 ? '' : 's'}...`);

  for (const [resourceName, generator] of resourceGenerators) {
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

  // Generate StateBag types in _internal folder
  if (stateBagGenerator.getTotalCount() > 0) {
    console.log(`\n🌐 Generating state definitions...`);
    const internalDir = path.join(config.outputDir, '_internal');

    if (!fs.existsSync(internalDir)) {
      fs.mkdirSync(internalDir, { recursive: true });
    }

    const stateFiles = stateBagGenerator.generate();

    for (const [filename, content] of Object.entries(stateFiles)) {
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
