# Cfx Lua Type Generator

A JavaScript tool that scans Lua files in a FiveM/RedM server and generates TypeScript-style type definitions for Lua Language Server, similar to [ox_types](https://github.com/overextended/ox_types).

## Features

- Automatically scans all Lua files in your FiveM/RedM server
- Parses LuaDoc comments (`---@param`, `---@return`, etc.)
- Detects both function-based and inline exports
- Separates client, server, and shared exports
- Configurable via JSON config file

## Installation

```bash
npm install
```

## Basic Usage

1. Configure `inputDir` to your server path
2. Run the type generator:

```bash
npm start
```

This will scan all Lua files and generate type definitions in the `./types` directory.

### Configuration

Edit the `config.json` file in your project root:

```json
{
  "inputDir": "./server",
  "outputDir": "./types",
  "excludePatterns": [
    "node_modules/**",
    "types/**"
  ],
  "verbose": false
}
```

#### Configuration Options

- **inputDir**: Directory to scan for Lua files (default: `./server`)
- **outputDir**: Where to output generated type files (default: `./types`)
- **excludePatterns**: Glob patterns to exclude from scanning
- **verbose**: Show detailed output during generation

### Using Generated Types

After generating types, add them to your VS Code settings:

1. Install the [CfxLua IntelliSense](https://marketplace.visualstudio.com/items?itemName=communityox.cfxlua-vscode-cox) extension
2. Open your VS Code settings (JSON)
3. Add the types directory to `Lua.workspace.library`:

```json
{
  "Lua.workspace.library": [
      // EXISTING LIBRARYS HERE
      "C:/path/to/type-gen/types",
  ],
}
```

## Supported Export Patterns

### Function-Based Export

```lua
--- Adds or updates multiple jobs in shared/jobs.lua.
--- @param newJobs table<string, table> A table where keys are job names
--- @param commitToFile boolean Whether to commit the job data
--- @return boolean success Whether all jobs were successfully created
--- @return string? message An optional message
function CreateJobs(newJobs, commitToFile)
    -- Implementation
end

exports('CreateJobs', CreateJobs)
```

### Inline Export

```lua
exports('CreateJobs', function(newJobs, commitToFile)
    -- Implementation
end)
```

## Example Output

The generator creates files like this:

**types/my_resource/server.lua**
```lua
---@meta

---**`server`**
---Adds or updates multiple jobs in shared/jobs.lua.
---@param newJobs table<string, table> A table where keys are job names
---@param commitToFile boolean Whether to commit the job data
---@return boolean success Whether all jobs were successfully created
---@return string? message An optional message
function exports.my_resource:CreateJobs(newJobs, commitToFile) end
```

## How It Works

1. **Scanning**: Recursively finds all `.lua` files in the input directory *(skipping folders matching the excludePatterns config)*
2. **Parsing**: Extracts `exports()` calls and their associated documentation
3. **Documentation**: Parses LuaDoc comments (`---@param`, `---@return`, etc.)
4. **Context Detection**: Determines if exports are client, server, or shared based on file paths
5. **Generation**: Creates properly formatted Lua type definition files

## Tips

- Use clear LuaDoc comments for best results
- Follow consistent naming conventions
- Place client-side code in files containing "client" in the name
- Place server-side code in files containing "server" in the name
- Shared code goes in files containing "shared" or neither

## Credits

Inspired by [ox_types](https://github.com/overextended/ox_types).

## License

MIT
