@Sites Build a private site named "Nihongo Coach" that hosts an MCP server, so I can use it as a plugin in ChatGPT.

The MCP server is only a proxy to my existing MCP server. Do not write any card logic yourself.

- Add a site secret named `NIHONGO_MCP_URL`. I will paste its value myself. Never print, log, return or show its value anywhere, including in errors.
- Expose exactly two tools, `save_card` and `list_cards`, with the same names, descriptions, input schemas and annotations as the upstream server. Get them by sending this JSON-RPC request to `NIHONGO_MCP_URL` (POST, `Content-Type: application/json`) and copying `result.tools` unchanged:
  `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`
  If you cannot load them at runtime, call it once while building and copy the result into the code.
- When ChatGPT calls one of the tools, POST this to `NIHONGO_MCP_URL` with `?source=chatgpt` appended to the URL, and return the upstream `result` (its `content` and `isError`) unchanged:
  `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"<tool>","arguments":<arguments>}}`
  If the upstream answers with an HTTP error, return a tool error saying the Nihongo Coach server returned that status code, without the URL.
- Keep the site private: only I can open it. Do not make it public or shareable by link.
- The site page itself can be one short line: "Nihongo Coach plugin for ChatGPT".

When it is ready, publish it so the plugin is created, then show me the tool list the plugin has.
