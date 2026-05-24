const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "POST" && url.pathname === "/api/scan") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { emails = [], databaseFilter = "", days = 7 } = JSON.parse(body);
        const emailText = emails.map((e) => `Subject: ${e.subject}\n${e.bodyPreview}`).join("\n\n---\n\n");
        if (!emailText.trim()) {
          return jsonResponse(res, 200, { databases: [], totalSorted: 0, totalUnsorted: 0, emailsScanned: 0, summaryEmail: "No emails found." });
        }
        const filterInstruction = databaseFilter ? `Only return results for database: "${databaseFilter}".` : "Return results for all databases found.";
        const claudeResp = await callClaude(emailText, filterInstruction);
        const raw = claudeResp.content.map((b) => b.text || "").join("").replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(raw);
        const totalSorted = parsed.databases.reduce((a, d) => a + (d.sorted || 0), 0);
        const totalUnsorted = parsed.databases.reduce((a, d) => a + (d.unsorted || 0), 0);
        return jsonResponse(res, 200, { databases: parsed.databases, totalSorted, totalUnsorted, emailsScanned: emails.length, summaryEmail: parsed.summaryEmail || "" });
      } catch (err) { return jsonResponse(res, 500, { error: err.message }); }
    });
    return;
  }

  serveStatic(req, res, url);
}

function callClaude(emailText, filterInstruction) {
  const payload = JSON.stringify({
    model: CLAUDE_MODEL, max_tokens: 1000,
    system: `You are a database reporting assistant. Extract database sorted/unsorted table information from email content.
SORTED keywords: sorted, indexed, ordered, organised, structured, partitioned
UNSORTED keywords: unsorted, unindexed, unordered, unorganised, raw, unpartitioned
${filterInstruction}
Respond ONLY with valid JSON:
{"databases":[{"name":"db name","sorted":0,"unsorted":0,"source":"note"}],"summaryEmail":"Subject: DB Table Summary\\n\\nHi,..."}`,
    messages: [{ role: "user", content: `Analyse these emails:\n\n${emailText}` }],
  });

  return new Promise((resolve, reject) => {
    const reqNode = https.request({
      hostname: "api.anthropic.com", path: "/v1/messages", method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Length": Buffer.byteLength(payload) },
    }, (resNode) => {
      let data = "";
      resNode.on("data", (chunk) => (data += chunk));
      resNode.on("end", () => { try { resolve(JSON.parse(data)); } catch (e) { reject(new Error("Failed to parse Claude response: " + data)); } });
    });
    reqNode.on("error", reject);
    reqNode.write(payload);
    reqNode.end();
  });
}

function serveStatic(req, res, url) {
  const staticMap = {
    "/": path.join(__dirname, "src/taskpane/taskpane.html"),
    "/taskpane.html": path.join(__dirname, "src/taskpane/taskpane.html"),
    "/taskpane.js":   path.join(__dirname, "src/taskpane/taskpane.js"),
    "/commands.html": path.join(__dirname, "src/commands/commands.html"),
    "/commands.js": path.join(__dirname, "src/commands/commands.js"),
    "/assets/color.png": path.join(__dirname, "assets/color.png"),
    "/assets/outline.png": path.join(__dirname, "assets/outline.png"),
    "/openapi.yaml": path.join(__dirname, "openapi.yaml"),
  };
  const filePath = staticMap[url.pathname];
  if (!filePath || !fs.existsSync(filePath)) { res.writeHead(404); res.end("Not found: " + url.pathname); return; }
  const mimeTypes = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png" };
  res.setHeader("Content-Type", mimeTypes[path.extname(filePath)] || "text/plain");
  fs.createReadStream(filePath).pipe(res);
}

function jsonResponse(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// Force HTTP — Codespaces handles HTTPS termination automatically
http.createServer(handler).listen(PORT, () => {
  console.log(`\n✅ DB Table Agent running on port ${PORT}`);
  console.log(`   Open: http://localhost:${PORT}/taskpane.html\n`);
});
// patch handled above
