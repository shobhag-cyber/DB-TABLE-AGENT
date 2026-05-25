# DB Table Agent
Outlook Add-in + Microsoft 365 Copilot Declarative Agent

Scans your Outlook inbox for database table reports and produces a single
summary showing sorted vs unsorted table counts per database.

---

## What's in this project

```
db-table-agent/
├── appPackage/
│   ├── manifest.json          ← Unified manifest (add-in + Copilot agent)
│   ├── declarativeAgent.json  ← Copilot agent instructions & conversation starters
│   └── apiPlugin.json         ← Tells Copilot how to call our backend action
├── src/
│   ├── taskpane/
│   │   ├── taskpane.html      ← Side panel UI shown in Outlook
│   │   └── taskpane.js        ← Reads emails via Office.js, calls backend
│   └── commands/
│       ├── commands.html      ← UI-less runtime for Copilot add-in actions
│       └── commands.js        ← ScanAndSummarize() function called by Copilot
├── assets/
│   ├── color.png              ← 80x80 colour icon (add your own)
│   └── outline.png            ← 32x32 outline icon (add your own)
├── server.js                  ← Local HTTPS backend (proxies Claude API)
└── package.json
```

---

## Setup (step by step)

### Step 1 — Install dependencies
```bash
npm install
```

### Step 2 — Install the HTTPS certificate (required by Office)
```bash
npm run install-cert
```
When prompted, click **Yes / Allow** to trust the certificate.

### Step 3 — Add your Anthropic API key
Open `server.js` and find this line:
```js
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "YOUR_ANTHROPIC_API_KEY_HERE";
```
Either replace the string with your key, or set it as an environment variable:
- **Mac/Linux:** `export ANTHROPIC_API_KEY=sk-ant-...`
- **Windows:** `set ANTHROPIC_API_KEY=sk-ant-...`

### Step 4 — Add your icons
Place two PNG files in the `assets/` folder:
- `color.png` — 80×80 px, full colour icon
- `outline.png` — 32×32 px, white/transparent outline icon

### Step 5 — Update the manifest ID
Open `appPackage/manifest.json` and replace:
```json
"id": "00000000-0000-0000-0000-000000000001"
```
with a real UUID. Generate one at: https://www.uuidgenerator.net/

### Step 6 — Start the server
```bash
npm start
```
You should see:
```
✅ DB Table Agent server running at https://localhost:3000
```

### Step 7 — Sideload into Outlook
```bash
npm run sideload
```
This opens Outlook Web with the add-in loaded.
Or manually sideload via Outlook → Get Add-ins → My Add-ins → Upload manifest.json

---

## Using the Outlook add-in (task pane)

1. Open Outlook
2. Click any email
3. Click **"Scan Emails"** in the toolbar ribbon
4. The right-side panel opens — click **"Scan my emails"**
5. Results show per-database table counts + a ready-to-send summary email

---

## Using the Microsoft 365 Copilot agent

> Requires a Microsoft 365 Copilot licence.

1. Open Microsoft 365 Copilot (copilot.microsoft.com or in Teams)
2. Find **"DB Table Agent"** in the agents panel (right side)
3. Click it to start a conversation
4. Try these example prompts:
   - *"Scan my emails and show me a summary of sorted and unsorted tables"*
   - *"Which databases have the most unsorted tables?"*
   - *"Give me today's DB report"*

The agent uses natural language to understand your request and calls the
same `ScanAndSummarize` backend action automatically.

---

## Deploying to production

1. Host `server.js` on Azure, AWS, or any Node.js host (must be HTTPS)
2. Update all `https://localhost:3000` references in the manifest and JS files
   to your production URL
3. Upload `appPackage/manifest.json` to:
   - Microsoft 365 Admin Center → Settings → Integrated Apps (for your org)
   - Or Teams App Catalog for broader distribution

---

## Note on Outlook + Copilot add-in actions

As of mid-2025, add-in actions in Copilot are fully supported for
Word, Excel, and PowerPoint. Outlook support is in progress by Microsoft.

The `copilotAgents` section in `manifest.json` and `declarativeAgent.json`
are already configured — your add-in will automatically gain Copilot
natural language capabilities in Outlook the moment Microsoft enables it.
# updated
