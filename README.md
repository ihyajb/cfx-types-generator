# Cfx Lua Type Generator

Automatically generate Lua type definitions for your FiveM/RedM server resource exports. This tool scans your server files and creates IntelliSense type definitions for resource exports, Cfx GlobalState, LocalPlayer and Player state variables, giving you autocomplete and type checking in VS Code.

## Features

- Automatically scans all Lua files in your FiveM/RedM server
- Parses LuaDoc comments (`---@param`, `---@return`, etc.)
- Detects both function-based and inline exports
- Separates client, server, and shared exports
- Generates type definitions for GlobalState variables
- Generates type definitions for Player and LocalPlayer state bags
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

- **inputDir**: Directory to scan for Lua files *(normally your server resources folder)*
- **outputDir**: Where to output generated type files
- **excludePatterns**: Glob patterns to exclude from scanning
- **verbose**: Show detailed output during generation

### Using Generated Types

Now that we generated the types, we need to add them to your VS Code settings:

1. Install the following extensions
    - [Lua](https://marketplace.visualstudio.com/items?itemName=sumneko.lua)
    - [CfxLua IntelliSense](https://marketplace.visualstudio.com/items?itemName=communityox.cfxlua-vscode-cox)
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

## Supported Patterns
### Export Patterns
#### Function-Based Export

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

#### Inline Export

```lua
exports('CreateJobs', function(newJobs, commitToFile)
    -- Implementation
end)
```

### State Patterns
#### GlobalState

```lua
GlobalState.weather = "sunny"
GlobalState.policeOnDuty = 5
GlobalState.heistCooldown = true
```

#### Player States

```lua
--SERVER
Player(source).state:set("isLoggedIn", true, true)
Player(playerId).state.invBusy = false

--CLIENT
LocalPlayer.state:set("inv_busy", false, true)
LocalPlayer.state.dead = true
```

## Example Output

The generator creates type definition files for both exports and state bags:

### Export Types

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

1. **Scanning**: Recursively finds all `.lua` files in the input directory (skipping folders matching the excludePatterns config)
2. **Parsing**: Extracts `exports()` calls, GlobalState assignments, and Player/LocalPlayer state operations
3. **Documentation**: Parses LuaDoc comments (`---@param`, `---@return`, etc.) for exports
4. **Type Inference**: Infers types from assigned values for state variables
5. **Context Detection**: Determines if exports are client, server, or shared based on file paths
6. **State Aggregation**: Combines state definitions from all resources into unified interfaces
7. **Generation**: Creates properly formatted Lua type definition files

## Tips

- Use clear LuaDoc comments for best results with exports
- Follow consistent naming conventions
- Place client-side code in files containing "client" in the name
- Place server-side code in files containing "server" in the name
- Shared code goes in files containing "shared" or neither
- See [qbx_core/server/functions.lua](https://github.com/Qbox-project/qbx_core/blob/main/server/functions.lua) for an example of "good" LuaDoc documentation

## Credits

Inspired by [ox_types](https://github.com/overextended/ox_types).

## License

MIT
