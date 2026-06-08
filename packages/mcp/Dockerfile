# Minimal image so Glama (and other MCP hosts) can sandbox-run the WebBLE MCP
# server over stdio. It launches the published npm package, which speaks the
# Model Context Protocol on stdin/stdout, so no ports are exposed.
FROM node:20-slim
ENTRYPOINT ["npx", "-y", "@ios-web-bluetooth/mcp"]
