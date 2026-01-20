require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const path = require("path");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const fs = require("fs");
/* ===========================
   DATABASE
=========================== */
const {
  createUser,
  findUserByEmail,
  getTeamMembers,
  db,
  initDB
} = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;

/* ===========================
   MIDDLEWARE
=========================== */
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      maxAge: 3600000
    }
  })
);

// Static files
app.use(express.static(path.join(__dirname, "Public")));

/* ===========================
   HELPERS
=========================== */
const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: "Unauthorized" });
};

const sendPublic = (res, file) =>
  res.sendFile(path.join(__dirname, "Public", file));

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const renderReportPage = (metric) => {
  const template = fs.readFileSync(
    path.join(__dirname, "Public", "report.html"),
    "utf8"
  );
  const state = (metric.state || "draft").toLowerCase();
  const isDraft = state === "draft";
  const isReviewed = state === "reviewed";
  const isFinal = state === "final";

  const trustMessage = isFinal
    ? "This report is finalized and read-only."
    : isReviewed
    ? "This report has been reviewed and can be finalized."
    : "This report is AI-generated and has not been reviewed.";

  const saveButton = isFinal
    ? ""
    : `<button type="submit" class="btn-primary">Save</button>`;
  const reviewButton = isDraft
    ? `<form method="POST" action="/report/${metric.id}/review">
        <button type="submit" class="nav-btn">Mark as Reviewed</button>
      </form>`
    : "";
  const finalizeButton = isReviewed
    ? `<form method="POST" action="/report/${metric.id}/finalize">
        <button type="submit" class="nav-btn">Finalize Report</button>
      </form>`
    : "";
  const regenerateButton = isDraft
    ? `<form method="POST" action="/report/${metric.id}/regenerate">
        <button type="submit" class="nav-btn">Regenerate AI</button>
      </form>`
    : "";

  return template
    .replaceAll("{{STATE}}", state.toUpperCase())
    .replaceAll("{{TRUST_MESSAGE}}", trustMessage)
    .replaceAll("{{REPORT_ID}}", escapeHtml(metric.id))
    .replaceAll("{{REPORT_CONTENT}}", escapeHtml(metric.data_json || ""))
    .replaceAll("{{READONLY_ATTR}}", isFinal ? "readonly" : "")
    .replaceAll("{{SAVE_BUTTON}}", saveButton)
    .replaceAll("{{REVIEW_BUTTON}}", reviewButton)
    .replaceAll("{{FINALIZE_BUTTON}}", finalizeButton)
    .replaceAll("{{REGENERATE_BUTTON}}", regenerateButton);
};

const getMetricById = (id) =>
  new Promise((resolve, reject) => {
    db.get(
      `SELECT id, user_id, data_json, state, reviewed_at, finalized_at, updated_at
       FROM metrics
       WHERE id = ?`,
      [id],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });

/* ===========================
   FILE UPLOAD (MVP – MEMORY)
=========================== */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

/* ===========================
   ROUTING (CLEAN URLS)
=========================== */

app.get("/", (req, res) => {
  if (req.session?.user) return res.redirect("/dashboard");
  return sendPublic(res, "index.html");
});

app.get("/login", (req, res) => sendPublic(res, "login.html"));
app.get("/signup", (req, res) => sendPublic(res, "signup.html"));
app.get("/forgot", (req, res) => sendPublic(res, "forgot.html"));

app.get("/dashboard", (req, res) => {
  if (req.session?.user) return sendPublic(res, "dashboard.html");
  return res.redirect("/login");
});

app.get("/upload", (req, res) => {
  if (req.session?.user) return sendPublic(res, "upload.html");
  return res.redirect("/login");
});

// Redirect legacy .html
["login", "signup", "forgot", "dashboard", "upload"].forEach(route => {
  app.get(`/${route}.html`, (req, res) => res.redirect(`/${route}`));
});

/* ===========================
   AUTH API
=========================== */

app.post("/api/signup", async (req, res) => {
  try {
    const { email, password, name, company } = req.body;
    if (!email || !password || !company) {
      return res.status(400).json({ error: "Missing fields" });
    }

    await createUser(email, password, name, company);
    res.json({ success: true });

  } catch (err) {
    res.status(400).json({ error: err.message || "Signup failed" });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await findUserByEmail(email);

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  req.session.user = {
    id: user._id,
    email: user.email,
    name: user.name,
    company: user.company_name,
    tier: user.tier || "Free"
  };

  res.json({ success: true, redirect: "/dashboard" });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

/* ===========================
   EXECBRIEF PIPELINE
=========================== */

app.post(
  "/api/upload",
  requireAuth,
  upload.array("files", 10),
  async (req, res) => {
    try {
      return res.status(501).json({
        success: false,
        error: "Upload processing is not configured on this deployment."
      });
    } catch (err) {
      console.error("❌ Upload error:", err);
      return res.status(500).json({
        success: false,
        error: err.message || "Upload failed"
      });
    }
  }
);

/* ===========================
   PROFILE / TEAM
=========================== */

app.get("/api/profile", requireAuth, async (req, res) => {
  const user = await findUserByEmail(req.session.user.email);
  res.json({
    name: user.name,
    email: user.email,
    company: user.company_name,
    tier: user.tier || "Free"
  });
});

app.post("/api/profile/update", requireAuth, (req, res) => {
  const { name, company } = req.body;
  req.session.user.name = name;
  req.session.user.company = company;
  req.session.save();
  res.json({ success: true });
});

app.get("/api/team", requireAuth, async (req, res) => {
  const members = await getTeamMembers(req.session.user.company);
  res.json({ members });
});

app.post("/api/team/invite", requireAuth, (req, res) => {
  const link = `https://${req.headers.host}/signup?invite=${encodeURIComponent(
    req.session.user.company
  )}`;
  res.json({ link });
});

/* ===========================
   REPORTS
=========================== */

app.get("/report/:id", requireAuth, async (req, res) => {
  try {
    const metric = await getMetricById(req.params.id);
    if (!metric) return res.status(404).send("Report not found");

    if (req.headers.accept && req.headers.accept.includes("application/json")) {
      return res.json({
        id: metric.id,
        user_id: metric.user_id,
        data_json: metric.data_json,
        state: metric.state,
        reviewed_at: metric.reviewed_at,
        finalized_at: metric.finalized_at,
        updated_at: metric.updated_at
      });
    }

    return res.send(renderReportPage(metric));
  } catch (err) {
    console.error("Failed to load report:", err);
    return res.status(500).send("Failed to load report");
  }
});

app.post("/report/:id/update", requireAuth, async (req, res) => {
  try {
    const { data_json } = req.body;
    if (!data_json) return res.status(400).send("Missing report data");

    const metric = await getMetricById(req.params.id);
    if (!metric) return res.status(404).send("Report not found");

    if (metric.state === "final") {
      return res.status(403).send("Finalized reports are read-only");
    }

    db.run(
      `UPDATE metrics SET data_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [data_json, req.params.id],
      (err) => {
        if (err) {
          console.error("Failed to update report:", err);
          return res.status(500).send("Failed to update report");
        }
        return res.json({ success: true });
      }
    );
  } catch (err) {
    console.error("Failed to update report:", err);
    return res.status(500).send("Failed to update report");
  }
});

app.post("/report/:id/metadata", requireAuth, async (req, res) => {
  try {
    const { metadata } = req.body;
    if (!metadata) return res.status(400).send("Missing metadata");

    const metric = await getMetricById(req.params.id);
    if (!metric) return res.status(404).send("Report not found");

    if (metric.state === "final") {
      return res.status(403).send("Finalized reports are read-only");
    }

    let parsed = {};
    if (metric.data_json) {
      try {
        parsed = JSON.parse(metric.data_json);
      } catch (err) {
        parsed = {};
      }
    }

    const updated = {
      ...parsed,
      metadata: {
        ...(parsed.metadata || {}),
        ...metadata
      }
    };

    db.run(
      `UPDATE metrics SET data_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [JSON.stringify(updated), req.params.id],
      (err) => {
        if (err) {
          console.error("Failed to update metadata:", err);
          return res.status(500).send("Failed to update metadata");
        }
        return res.json({ success: true });
      }
    );
  } catch (err) {
    console.error("Failed to update metadata:", err);
    return res.status(500).send("Failed to update metadata");
  }
});

app.post("/report/:id/regenerate", requireAuth, async (req, res) => {
  try {
    const metric = await getMetricById(req.params.id);
    if (!metric) return res.status(404).send("Report not found");

    if (metric.state !== "draft") {
      return res.status(403).send("AI regeneration allowed only in draft state");
    }

    return res.status(501).send(
      "AI regeneration is not configured on this deployment."
    );
  } catch (err) {
    console.error("Failed to regenerate report:", err);
    return res.status(500).send("Failed to regenerate report");
  }
});

app.post("/report/:id/review", requireAuth, async (req, res) => {
  try {
    const metric = await getMetricById(req.params.id);
    if (!metric) return res.status(404).send("Report not found");

    if (metric.state !== "draft") {
      return res.status(403).send("Only draft reports can be reviewed");
    }

    db.run(
      `UPDATE metrics SET state = 'reviewed', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [req.params.id],
      (err) => {
        if (err) {
          console.error("Failed to review report:", err);
          return res.status(500).send("Failed to review report");
        }
        return res.redirect(`/report/${req.params.id}`);
      }
    );
  } catch (err) {
    console.error("Failed to review report:", err);
    return res.status(500).send("Failed to review report");
  }
});

app.post("/report/:id/finalize", requireAuth, async (req, res) => {
  try {
    const metric = await getMetricById(req.params.id);
    if (!metric) return res.status(404).send("Report not found");

    if (metric.state !== "reviewed") {
      return res.status(403).send("Only reviewed reports can be finalized");
    }

    db.run(
      `UPDATE metrics SET state = 'final', finalized_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [req.params.id],
      (err) => {
        if (err) {
          console.error("Failed to finalize report:", err);
          return res.status(500).send("Failed to finalize report");
        }
        return res.redirect(`/report/${req.params.id}`);
      }
    );
  } catch (err) {
    console.error("Failed to finalize report:", err);
    return res.status(500).send("Failed to finalize report");
  }
});

/* ===========================
   START SERVER
=========================== */

initDB();

app.listen(PORT, () => {
  console.log(`✅ ExecBrief running on http://localhost:${PORT}`);
});
