# Setup

## installs

npm install

# Optional: install Ollama client bindings if you plan to run the item flow against an Ollama model
# npm install @langchain/ollama --save

npm install --save-dev pino-pretty

sudo apt install jq


## Logging

The web search MCP server now writes structured JSON logs to `logs/web-search.log` (relative to the
project root). Logs automatically rotate once they exceed roughly 5 MB, keeping up to five archived
files (for example, `web-search.log.1`, `web-search.log.2`, and so on). Override the defaults with the
following environment variables when needed:

- `WEB_SEARCH_LOG_DIR` – directory for the log files.
- `WEB_SEARCH_LOG_MAX_SIZE` – maximum size of the active log file in bytes before rotation.
- `WEB_SEARCH_LOG_MAX_FILES` – number of rotated log files to retain.

Errors continue to stream to `stderr` so operators can still spot critical issues during local runs,
but all info-level events are captured exclusively in the rotating log files for easier debugging.


## CL

curl -s -X POST http://localhost:3000/run \
  -H 'content-type: application/json' \
  -d '{
    "thread_id": "demo-1",
    "messages": [
      {"role":"user","content":"What time is it? Use tools if needed."}
    ]
  }' | jq

## node

# Install nvm (if you don't have it)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
# Then reload your shell, e.g., source ~/.bashrc

# Install Node.js 20 (current LTS)
nvm install 20
nvm use 20

# Verify:
node -v   # should be v20.x.x
npm -v

## Test MCP server

# ensure env points to the stdio server entry:
export MCP_SEARCH_CMD=node
MCP_SEARCH_ARGS=/web-search/index.js

> When possible, configure the MCP server to include a `statusCode` field (e.g., `429` or `503`) in
> error responses. The client now defensively inspects error text for rate-limit hints, but explicit
> status codes make diagnosing server-side throttling much simpler.

node -e 'import("./src/tools/searchWeb.js").then(async m=>{
  console.log(await m.searchWeb.invoke({ query: "AI tooling updates", max_results: 3 }));
})'
