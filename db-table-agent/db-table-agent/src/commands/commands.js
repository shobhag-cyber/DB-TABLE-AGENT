/* global Office */

// This file runs in a UI-less runtime.
// Copilot calls ScanAndSummarize() here when the user
// asks the agent to scan emails via natural language.

Office.onReady(function () {
  // Register the action so Copilot can invoke it
  if (Office.actions) {
    Office.actions.associate("ScanAndSummarize", ScanAndSummarize);
  }
});

// Called by Copilot agent when user says e.g.
// "scan my emails for DB table reports"
async function ScanAndSummarize(event) {
  try {
    const token = await getRestToken();
    const emails = await fetchEmails(token);

    const resp = await fetch("https://localhost:3000/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emails, days: 7 }),
    });

    const data = await resp.json();

    // Return result to Copilot agent as a formatted string
    const lines = (data.databases || []).map(
      (db) =>
        `• ${db.name}: ${db.sorted} sorted, ${db.unsorted} unsorted (total: ${db.sorted + db.unsorted})`
    );

    const summary =
      `Database Table Summary (last 7 days)\n` +
      `Emails scanned: ${data.emailsScanned}\n\n` +
      lines.join("\n") +
      `\n\nTotal sorted: ${data.totalSorted} | Total unsorted: ${data.totalUnsorted}`;

    Office.context.mailbox.item?.notificationMessages.addAsync(
      "DBSummary",
      {
        type: Office.MailboxEnums.ItemNotificationMessageType.InformationalMessage,
        message: summary,
        icon: "Icon.80x80",
        persistent: false,
      }
    );

    event.completed({ allowEvent: true });
  } catch (err) {
    event.completed({ allowEvent: false });
  }
}

// ── SHARED HELPERS (duplicated from taskpane.js for isolated runtime) ──

function getRestToken() {
  return new Promise((resolve, reject) => {
    Office.context.mailbox.getCallbackTokenAsync(
      { isRest: true },
      (result) => {
        if (result.status === Office.AsyncResultStatus.Succeeded) {
          resolve(result.value);
        } else {
          reject(new Error(result.error.message));
        }
      }
    );
  });
}

async function fetchEmails(token) {
  const restUrl = Office.context.mailbox.restUrl;
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();
  const url =
    `${restUrl}/v2.0/me/messages` +
    `?$top=30&$select=subject,bodyPreview,receivedDateTime` +
    `&$filter=receivedDateTime ge ${sevenDaysAgo}` +
    `&$orderby=receivedDateTime desc`;
  const resp = await fetch(url, {
    headers: { Authorization: "Bearer " + token },
  });
  const data = await resp.json();
  return data.value || [];
}
