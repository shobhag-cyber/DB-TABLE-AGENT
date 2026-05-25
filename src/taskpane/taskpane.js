/* global Office */

// ── CONFIGURATION ──────────────────────────────────────────────
// Store your Anthropic API key in your backend (server.js).
// The task pane calls YOUR local backend, which proxies to Claude.
// This keeps your API key off the client entirely.
const BACKEND_URL = "https://db-table-agent.onrender.com/api/scan";

// ── OFFICE INIT ────────────────────────────────────────────────
Office.onReady(function () {
  document.getElementById("scanBtn").removeAttribute("disabled");
});

// ── MAIN SCAN FUNCTION ─────────────────────────────────────────
async function scanEmails() {
  setStatus("Connecting to your inbox...");
  toggleBtn(true);
  clearResults();
  hideError();

  try {
    // 1. Get an Outlook REST token via Office.js
    const token = await getRestToken();

    // 2. Fetch last 30 emails from Outlook REST API
    setStatus("Reading your emails...");
    const emails = await fetchEmails(token);

    if (!emails.length) {
      showError("No emails found in your inbox.");
      return;
    }

    // 3. Send email text to our backend → Claude API
    setStatus(`Analysing ${emails.length} emails with Claude...`);
    const result = await callBackend({ emails, days: 7 });

    // 4. Render the results
    renderResults(result);
    setStatus(`Done — scanned ${result.emailsScanned} emails.`);

  } catch (err) {
    showError("Error: " + err.message);
    setStatus("");
  } finally {
    toggleBtn(false);
  }
}

// ── GET OUTLOOK REST TOKEN ─────────────────────────────────────
function getRestToken() {
  return new Promise((resolve, reject) => {
    Office.context.mailbox.getCallbackTokenAsync(
      { isRest: true },
      (result) => {
        if (result.status === Office.AsyncResultStatus.Succeeded) {
          resolve(result.value);
        } else {
          reject(new Error("Could not get Outlook token: " + result.error.message));
        }
      }
    );
  });
}

// ── FETCH EMAILS VIA OUTLOOK REST ─────────────────────────────
async function fetchEmails(token) {
  const restUrl = Office.context.mailbox.restUrl;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const url =
    `${restUrl}/v2.0/me/messages` +
    `?$top=30` +
    `&$select=subject,bodyPreview,receivedDateTime` +
    `&$filter=receivedDateTime ge ${sevenDaysAgo}` +
    `&$orderby=receivedDateTime desc`;

  const resp = await fetch(url, {
    headers: { Authorization: "Bearer " + token },
  });

  if (!resp.ok) throw new Error("Failed to fetch emails: " + resp.statusText);
  const data = await resp.json();
  return data.value || [];
}

// ── CALL LOCAL BACKEND (which calls Claude) ────────────────────
async function callBackend(payload) {
  const resp = await fetch(BACKEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error("Backend error: " + err);
  }
  return resp.json();
}

// ── RENDER TABLE + EMAIL DRAFT ─────────────────────────────────
function renderResults(data) {
  const dbs = data.databases || [];
  const body = document.getElementById("resultsBody");
  body.innerHTML = "";

  let totalSorted = 0;
  let totalUnsorted = 0;

  dbs.forEach((db) => {
    const sorted = db.sorted || 0;
    const unsorted = db.unsorted || 0;
    totalSorted += sorted;
    totalUnsorted += unsorted;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escHtml(db.name)}</td>
      <td class="sorted-val">${sorted}</td>
      <td class="unsorted-val">${unsorted}</td>
      <td>${sorted + unsorted}</td>
    `;
    body.appendChild(tr);
  });

  // Totals row
  const totalsRow = document.createElement("tr");
  totalsRow.className = "totals";
  totalsRow.innerHTML = `
    <td>TOTAL</td>
    <td class="sorted-val">${totalSorted}</td>
    <td class="unsorted-val">${totalUnsorted}</td>
    <td>${totalSorted + totalUnsorted}</td>
  `;
  body.appendChild(totalsRow);

  // Email draft
  document.getElementById("emailDraft").textContent = data.summaryEmail || "";

  // Show section
  document.getElementById("resultsSection").style.display = "block";
}

// ── COPY EMAIL ─────────────────────────────────────────────────
function copyEmail() {
  const text = document.getElementById("emailDraft").textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector(".copy-btn");
    btn.textContent = "Copied!";
    setTimeout(() => (btn.textContent = "Copy email"), 2000);
  });
}

// ── HELPERS ───────────────────────────────────────────────────
function setStatus(msg) {
  document.getElementById("status").textContent = msg;
}
function toggleBtn(disabled) {
  document.getElementById("scanBtn").disabled = disabled;
}
function clearResults() {
  document.getElementById("resultsSection").style.display = "none";
  document.getElementById("resultsBody").innerHTML = "";
  document.getElementById("emailDraft").textContent = "";
}
function showError(msg) {
  const el = document.getElementById("error");
  el.textContent = msg;
  el.style.display = "block";
}
function hideError() {
  document.getElementById("error").style.display = "none";
}
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
