document.addEventListener("DOMContentLoaded", () => {
  initDashboard();
});

async function initDashboard() {
  try {
    // 1) Check auth + load company context
    const companyRes = await fetch("/api/company");
    if (companyRes.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const companyData = await companyRes.json();

    // Update UI (NEW IDs)
    const companyNameEl = document.getElementById("company-name");
    const userNameEl = document.getElementById("user-name");

    if (companyNameEl) companyNameEl.innerText = companyData.name || "My Company";
    if (userNameEl) userNameEl.innerText = companyData.user || "User";

    // Load sections
    await Promise.allSettled([loadSummary(), loadSignals(), loadActions()]);
  } catch (err) {
    console.error("Dashboard init failed:", err);
  }

  // Logout handler (NEW id)
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      await fetch("/api/logout", { method: "POST" });
      window.location.href = "/login.html";
    });
  }
}

/* -------------------------------
   Helpers
-------------------------------- */

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function trendBadge(trend) {
  const t = (trend || "").toLowerCase();
  if (t === "good") return `<span class="tag tag-high" style="background:rgba(34,197,94,.10); color:#16a34a;">Good</span>`;
  if (t === "bad") return `<span class="tag tag-high" style="background:rgba(239,68,68,.12); color:#dc2626;">Risk</span>`;
  return `<span class="tag tag-medium" style="background:rgba(11,18,32,.06); color:rgba(11,18,32,.65);">Stable</span>`;
}

function impactTag(impact) {
  const i = (impact || "").toLowerCase();
  if (i.includes("high")) return `<span class="tag tag-high">High impact</span>`;
  return `<span class="tag tag-medium">Medium impact</span>`;
}

function skeletonCards(count = 3) {
  return Array.from({ length: count })
    .map(
      () => `
      <div class="metric-card" style="opacity:.9">
        <div style="height:12px; width:55%; background:rgba(11,18,32,.08); border-radius:8px;"></div>
        <div style="height:32px; width:35%; background:rgba(11,18,32,.10); border-radius:10px; margin-top:14px;"></div>
        <div style="height:12px; width:80%; background:rgba(11,18,32,.07); border-radius:8px; margin-top:14px;"></div>
      </div>
    `
    )
    .join("");
}

/* -------------------------------
   Loaders
-------------------------------- */

async function loadSummary() {
  const summaryEl = document.getElementById("summary-text");
  if (!summaryEl) return;

  // Skeleton
  summaryEl.innerHTML = `<span style="color:rgba(11,18,32,.55); font-weight:800;">Loading summary…</span>`;

  const res = await fetch("/api/summary");
  const data = await res.json();

  summaryEl.innerText = data.summary || "No summary available.";
}

async function loadSignals() {
  const container = document.getElementById("signals-container");
  if (!container) return;

  container.innerHTML = skeletonCards(3);

  const res = await fetch("/api/signals");
  const signals = await res.json();

  container.innerHTML = signals
    .map((sig) => {
      const label = escapeHtml(sig.label);
      const value = escapeHtml(sig.value);
      const direction = escapeHtml(sig.direction || "");
      const trend = escapeHtml(sig.trend || "stable");
      const context = escapeHtml(sig.context || "");

      const trendClass =
        trend.toLowerCase() === "good"
          ? "trend-good"
          : trend.toLowerCase() === "bad"
          ? "trend-bad"
          : "trend-stable";

      return `
        <div class="metric-card">
          <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
            <div class="metric-label">${label}</div>
            ${trendBadge(trend)}
          </div>

          <div class="metric-value">${value}</div>

          <div class="${trendClass}" style="margin-top:6px;">
            ${direction} ${trend.toUpperCase()}
          </div>

          <div style="margin-top:10px; color:rgba(11,18,32,.62); font-weight:700; font-size:13px;">
            ${context}
          </div>
        </div>
      `;
    })
    .join("");
}

async function loadActions() {
  const container = document.getElementById("actions-container");
  if (!container) return;

  container.innerHTML = `
    <div class="action-item"><div class="muted" style="font-weight:900;">Loading recommended actions…</div></div>
    <div class="action-item"><div class="muted" style="font-weight:900;">Loading…</div></div>
  `;

  const res = await fetch("/api/actions");
  const data = await res.json();

  container.innerHTML = (data.actions || [])
    .map((action) => {
      const title = escapeHtml(action.title);
      const reason = escapeHtml(action.reason);
      const consequence = escapeHtml(action.consequence);
      const impact = escapeHtml(action.impact || "Medium");
      const confidence = Number(action.confidence || 0);

      return `
        <div class="action-item">
          <div style="flex:1; min-width: 240px;">
            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
              ${impactTag(impact)}
              <div class="action-title">${title}</div>
            </div>

            <div class="action-reason" style="margin-top:8px;">
              ${reason}
            </div>

            <div style="display:flex; gap:14px; flex-wrap:wrap; margin-top:12px; color:rgba(11,18,32,.65); font-weight:800; font-size:13px;">
              <span>✅ Confidence: <span style="color:rgba(11,18,32,.9)">${confidence}%</span></span>
              <span>⚠️ Risk: <span style="color:rgba(11,18,32,.9)">${consequence}</span></span>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  // If no actions exist
  if (!data.actions || data.actions.length === 0) {
    container.innerHTML = `
      <div class="action-item">
        <div class="muted" style="font-weight:900;">No actions available right now.</div>
      </div>
    `;
  }
}
