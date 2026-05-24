// server.js — Local HTTPS backend
// Proxies requests to Claude API so your API key never touches the browser.
//
// HOW TO START: node server.js
// RUNS ON:      https://localhost:3000

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

// ── CONFIG ─────────────────────────────────────────────────────
const PORT = 3000;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

// Put your Anthropic API key here, or better: set env variable
// export ANTHROPIC_API_KEY=sk-ant-...
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

// ── SIMPLE ROUTER ──────────────────────────────────────────────
async function handler(req, res) {
  // CORS headers (needed for Office.js to call this server)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `https://localhost:${PORT}`);

  // ── POST /api/scan — Claude analysis endpoint ──────────────
  if (req.method === "POST" && url.pathname === "/api/scan") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { emails = [], databaseFilter = "", days = 7 } = JSON.parse(body);

        // Build email text for Claude
        const emailText = emails
          .map((e) => `Subject: ${e.subject}\n${e.bodyPreview}`)
          .join("\n\n---\n\n");

        if (!emailText.trim()) {
          return jsonResponse(res, 200, {
            databases: [],
            totalSorted: 0,
            totalUnsorted: 0,
            emailsScanned: 0,
            summaryEmail: "No emails found to analyse.",
          });
        }

        const filterInstruction = databaseFilter
          ? `Only return results for database: "${databaseFilter}".`
          : "Return results for all databases found.";

        // Call Claude
        const claudeResp = await callClaude(emailText, filterInstruction);

        // Parse Claude response
        const raw = claudeResp.content
          .map((b) => b.text || "")
          .join("")
          .replace(/```json|```/g, "")
          .trim();

        const parsed = JSON.parse(raw);

        // Add totals if Claude didn't include them
        const totalSorted = parsed.databases.reduce((a, d) => a + (d.sorted || 0), 0);
        const totalUnsorted = parsed.databases.reduce((a, d) => a + (d.unsorted || 0), 0);

        return jsonResponse(res, 200, {
          databases: parsed.databases,
          totalSorted,
          totalUnsorted,
          emailsScanned: emails.length,
          summaryEmail: parsed.summaryEmail || buildFallbackEmail(parsed.databases, totalSorted, totalUnsorted),
        });
      } catch (err) {
        return jsonResponse(res, 500, { error: err.message });
      }
    });
    return;
  }

  // ── Serve static files (taskpane.html, taskpane.js, etc.) ──
  serveStatic(req, res, url);
}

// ── CALL CLAUDE API ────────────────────────────────────────────
function callClaude(emailText, filterInstruction) {
  const payload = JSON.stringify({
    model: CLAUDE_MODEL,
    max_tokens: 1000,
    system: `You are a database reporting assistant. Extract database sorted/unsorted table information from email content.

SORTED keywords: sorted, indexed, ordered, organised, structured, partitioned
UNSORTED keywords: unsorted, unindexed, unordered, unorganised, raw, unpartitioned, not sorted, not indexed

${filterInstruction}

If the same database appears in multiple emails, SUM the counts.

Respond ONLY with valid JSON — no markdown fences, no explanation:
{
  "databases": [
    { "name": "database name", "sorted": 0, "unsorted": 0, "source": "brief note on which email" }
  ],
  "summaryEmail": "Subject: DB Table Summary\\n\\nHi,\\n\\nHere is the database table summary...\\n\\nRegards"
}`,
    messages: [
      {
        role: "user",
        content: `Analyse these emails and extract database table information:\n\n${emailText}`,
      },
    ],
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const reqNode = https.request(options, (resNode) => {
      let data = "";
      resNode.on("data", (chunk) => (data += chunk));
      resNode.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error("Failed to parse Claude response: " + data));
        }
      });
    });

    reqNode.on("error", reject);
    reqNode.write(payload);
    reqNode.end();
  });
}

// ── SERVE STATIC FILES ─────────────────────────────────────────
function serveStatic(req, res, url) {
  const staticMap = {
    "/taskpane.html": path.join(__dirname, "src/taskpane/taskpane.html"),
    "/taskpane.js": path.join(__dirname, "src/taskpane/taskpane.js"),
    "/commands.html": path.join(__dirname, "src/commands/commands.html"),
    "/commands.js": path.join(__dirname, "src/commands/commands.js"),
    "/assets/color.png": path.join(__dirname, "assets/color.png"),
    "/assets/outline.png": path.join(__dirname, "assets/outline.png"),
  };

  const filePath = staticMap[url.pathname];
  if (!filePath || !fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found: " + url.pathname);
    return;
  }

  const ext = path.extname(filePath);
  const mimeTypes = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".png": "image/png",
    ".json": "application/json",
  };

  res.setHeader("Content-Type", mimeTypes[ext] || "text/plain");
  fs.createReadStream(filePath).pipe(res);
}

// ── HELPERS ────────────────────────────────────────────────────
function jsonResponse(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function buildFallbackEmail(databases, totalSorted, totalUnsorted) {
  const lines = databases
    .map((db) => `  - ${db.name}: ${db.sorted} sorted, ${db.unsorted} unsorted`)
    .join("\n");

  return (
    `Subject: Database Table Summary\n\n` +
    `Hi,\n\n` +
    `Here is the latest database table summary from your Outlook emails:\n\n` +
    `${lines}\n\n` +
    `Total sorted: ${totalSorted}\n` +
    `Total unsorted: ${totalUnsorted}\n\n` +
    `Regards,\n` +
    `DB Table Agent`
  );
}

// ── START SERVER ───────────────────────────────────────────────
// Office Add-ins require HTTPS. Use the self-signed cert that
// the Yeoman generator installs, or generate one with:
//   npx office-addin-dev-certs install
// Then point the paths below to the generated files.

const certDir = path.join(
  process.env.HOME || process.env.USERPROFILE,
  ".office-addin-dev-certs"
);

const certPath = path.join(certDir, "localhost.crt");
const keyPath = path.join(certDir, "localhost.key");

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const sslOptions = {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  };
  https.createServer(sslOptions, handler).listen(PORT, () => {
    console.log(`\n✅ DB Table Agent server running at https://localhost:${PORT}`);
    console.log(`   Task pane → https://localhost:${PORT}/taskpane.html`);
    console.log(`   API scan  → https://localhost:${PORT}/api/scan\n`);
  });
} else {
  // Fallback: HTTP (for initial setup before cert is installed)
  console.warn(
    "\n⚠️  No SSL certificate found. Running on HTTP (not suitable for Outlook)."
  );
  console.warn(
    "   Run:  npx office-addin-dev-certs install\n   Then restart this server.\n"
  );
  http.createServer(handler).listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}
