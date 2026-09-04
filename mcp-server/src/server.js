import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "./tools.js";

const PORT = process.env.PORT || 8787;
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

// Simple bearer-token check -- this endpoint reaches Supabase with the
// service_role key, so it must not be left open on the public internet.
// Left optional (unset MCP_AUTH_TOKEN skips the check) only for local dev.
app.use("/mcp", (req, res, next) => {
  if (!AUTH_TOKEN) return next();
  const header = req.header("authorization") || "";
  if (header === `Bearer ${AUTH_TOKEN}`) return next();
  res.status(401).json({ error: "unauthorized" });
});

// Stateless mode: a fresh McpServer + transport per request. Simpler than
// keeping sessions alive across requests, and the n8n MCP Client Tool node
// calls this per tool invocation anyway, so there's no session to reuse.
app.post("/mcp", async (req, res) => {
  try {
    const server = new McpServer({ name: "incontec-financeiro", version: "1.0.0" });
    registerTools(server);

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("Erro ao lidar com requisicao MCP:", err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
});

// GET/DELETE aren't used in stateless mode (no session to resume or close),
// but the spec expects a 405 rather than silence for clients that try.
app.get("/mcp", (_req, res) => res.status(405).json({ error: "method not allowed (stateless server)" }));
app.delete("/mcp", (_req, res) => res.status(405).json({ error: "method not allowed (stateless server)" }));

app.listen(PORT, () => {
  console.log(`Servidor MCP financeiro rodando em http://localhost:${PORT}/mcp`);
});
