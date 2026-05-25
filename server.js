const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

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
            databases: [],
            totalSorted: 0,
            totalUnsorted: 0,
            emailsScanned: 0,
            summaryEmail: "No emails found."
          });
        }

        const emailText = emails
          .map((e) => `Subject: ${e.subject}\n${e.bodyPreview}`)
          .join("\n\n---\n\n");

        const filterInstruction = databaseFilter
          ? `Only return results for database: "${databaseFilter}".`
          : "Return results for all databases found.";

        const geminiResp = await callGemini(emailText, filterInstruction);
        console.log("Gemini response:", geminiResp);

        const raw = geminiResp
          .replace(/```json|```/g, "")
          .trim();

        const result = JSON.parse(raw);
        const totalSorted = result.databases.reduce((a, d) => a + (d.sorted || 0), 0);
        const totalUnsorted = result.databases.reduce((a, d) => a + (d.unsorted || 0), 0);

        return jsonResponse(res, 200, {
          databases: result.databases,
          totalSorted,
          totalUnsorted,
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

function callGemini(emailText, filterInstruction) {
  const prompt = `You are a database reporting assistant. Extract database sorted/unsorted table information from email content.
SORTED keywords: sorted, indexed, ordered, organised, structured, partitioned
UNSORTED keywords: unsorted, unindexed, unordered, unorganised, raw, unpartitioned
${filterInstruction}
Respond ONLY with valid JSON no markdown:
{"databases":[{"name":"db name","sorted":0,"unsorted":0,"source":"note"}],"summaryEmail":"Subject: DB Table Summary\\n\\nHi,..."}

Emails to analyse:
${emailText}`;

  const payload = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }]
  });

  return new Promise((resolve, reject) => {
    const reqNode = https.request({
      hostname: "generativelanguage.googleapis.com",
      path: `/v1beta/models/gemini-1.5-flash-8b:generateContent?key=${GEMINI_API_KEY}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      },
    }, (resNode) => {
      let data = "";
      resNode.on("data", (chunk) => (data += chunk));
      resNode.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          console.log("Full Gemini response:", JSON.stringify(parsed));
          const text = parsed.candidates[0].content.parts[0].text;
          resolve(text);
        } catch (e) {
          reject(new Error("Failed to parse Gemini response: " + data));
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
 
