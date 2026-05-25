const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

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
        const parsed = JSON.parse(body);
        const emails = parsed.emails || [];
        const databaseFilter = parsed.databaseFilter || "";

        if (!emails.length) {
          return jsonResponse(res, 200, {
            tables: [],
            totalInSync: 0,
            totalOutOfSync: 0,
            emailsScanned: 0,
            summaryEmail: "No emails found."
          });
        }

        const emailText = emails
          .map((e) => `Subject: ${e.subject}\nBody: ${e.bodyPreview}`)
          .join("\n\n---\n\n");

        const text = await callGroq(emailText, databaseFilter);
        console.log("Groq response:", text);

        const raw = text.replace(/```json|```/g, "").trim();
        const result = JSON.parse(raw);

        return jsonResponse(res, 200, {
          tables: result.tables || [],
          totalInSync: result.totalInSync || 0,
          totalOutOfSync: result.totalOutOfSync || 0,
          emailsScanned: emails.length,
          summaryEmail: result.summaryEmail || ""
        });
      } catch (err) {
        console.error("Error:", err.message);
        return jsonResponse(res, 500, { error: err.message });
      }
    });
    return;
  }

  serveStatic(req, res, url);
}

function callGroq(emailText, databaseFilter) {
  const filterInstruction = databaseFilter
    ? `Only return results for database: "${databaseFilter}".`
    : "Return results for all databases found.";

  const payload = JSON.stringify({
    model: "llama-3.1-8b-instant",
    max_tokens: 2000,
    messages: [
      {
        role: "system",
        content: `You are a database sync monitoring assistant. Analyse Oracle GoldenGate sync check emails.

These emails show replication sync status between source and target databases.
- "NOT SYNC" in subject means tables are out of sync
- "SYNC" in subject means tables are in sync
- "Difference is there" means that table is OUT OF SYNC
- Each block shows: table_name: source_count and target_name@target: target_count

${filterInstruction}

Extract each table and its sync status. Respond ONLY with valid JSON:
{
  "sourceDB": "source database name",
  "targetDB": "target database name",
  "syncStatus": "NOT SYNC or SYNC",
  "tables": [
    {
      "name": "table name",
      "sourceCount": 0,
      "targetCount": 0,
      "difference": 0,
      "inSync": false
    }
  ],
  "totalInSync": 0,
  "totalOutOfSync": 0,
  "summaryEmail": "Subject: DB Sync Summary\\n\\nHi,\\n\\n..."
}`
      },
      {
        role: "user",
        content: `Analyse these sync check emails:\n\n${emailText}`
      }
    ]
  });

  return new Promise((resolve, reject) => {
    const reqNode = https.request({
      hostname: "api.groq.com",
      path: "/openai/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Length": Buffer.byteLength(payload)
      },
    }, (resNode) => {
      let data = "";
      resNode.on("data", (chunk) => (data += chunk));
      resNode.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error("Groq error: " + parsed.error.message));
            return;
          }
          resolve(parsed.choices[0].message.content);
        } catch (e) {
          reject(new Error("Failed to parse Groq response: " + data));
        }
      });
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
    "/taskpane.js": path.join(__dirname, "src/taskpane/taskpane.js"),
    "/commands.html": path.join(__dirname, "src/commands/commands.html"),
    "/commands.js": path.join(__dirname, "src/commands/commands.js"),
    "/assets/color.png": path.join(__dirname, "assets/color.png"),
    "/assets/outline.png": path.join(__dirname, "assets/outline.png"),
    "/openapi.yaml": path.join(__dirname, "openapi.yaml"),
  };
  const filePath = staticMap[url.pathname];
  if (!filePath || !fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found: " + url.pathname);
    return;
  }
  const mimeTypes = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".png": "image/png",
    ".yaml": "text/yaml"
  };
  res.setHeader("Content-Type", mimeTypes[path.extname(filePath)] || "text/plain");
  fs.createReadStream(filePath).pipe(res);
}

function jsonResponse(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

http.createServer(handler).listen(PORT, () => {
  console.log(`\n✅ DB Table Agent running on port ${PORT}`);
});
