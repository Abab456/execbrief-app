require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const path = require("path");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const fs = require("fs");

const {
  db,
  initDB,
  createUser,
  findUserByEmail
} = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   MIDDLEWARE
========================= */
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
  })
);

app.use(express.static(path.join(__dirname, "Public")));

/* =========================
   AUTH GUARD
========================= */
const requireAuth = (req, res, next) => {
  if (req.session?.user) return next();
  return res.status(401).json({ error: "Unauthorized" });
};

const sendPublic = (res, file) =>
  res.sendFile(path.join(__dirname, "Public", file));

/* =========================
   FILE UPLOAD
========================= */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

/* =========================
   BASIC ROUTES
========================= */
app.get("/", (req, res) =>
  req.session?.user ? res.redirect("/dashboard") : sendPublic(res, "index.html")
);

["login", "signup", "forgot"].forEach(r =>
  app.get(`/${r}`, (_, res) => sendPublic(res, `${r}.html`))
);

app.get("/dashboard", requireAuth, (_, res) =>
  sendPublic(res, "dashboard.html")
);

app.get("/upload", requireAuth, (_, res) =>
  sendPublic(res, "upload.html")
);

/* =========================
   API — AUTH
========================= */
app.post("/api/signup", async (req, res) => {
  await createUser(
    req.body.email,
    req.body.password,
    req.body.name,
    req.body.company
  );
  res.json({ success: true });
});

app.post("/api/login", async (req, res) => {
  try {
    const user = await findUserByEmail(req.body.email);
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    req.session.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      company: user.company_name,
      tier: user.tier || "Free"
    };

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

/* =========================
   API — PROFILE
========================= */
app.get("/api/profile", requireAuth, async (req, res) => {
  const user = await findUserByEmail(req.session.user.email);
  if (!user) return res.status(404).json({ error: "User not found" });

  res.json({
    name: user.name,
    email: user.email,
    company: user.company_name,
    tier: user.tier || "Free"
  });
});

/* =========================
   API — REPORTS
========================= */
app.get("/api/reports", requireAuth, (req, res) => {
  db.all(
    `
    SELECT id, state, updated_at, reviewed_at, finalized_at
    FROM metrics
    WHERE user_id = ?
    ORDER BY datetime(updated_at) DESC
    `,
    [req.session.user.id],
    (_, rows) => res.json({ reports: rows || [] })
  );
});

/* =========================
   REPORT VIEW (HTML)
========================= */
app.get("/report/:id", requireAuth, (req, res) => {
  db.get(
    `SELECT * FROM metrics WHERE id = ? AND user_id = ?`,
    [req.params.id, req.session.user.id],
    (err, report) => {
      if (err || !report) return res.status(404).send("Report not found");

      let parsed = {};
      try { parsed = JSON.parse(report.data_json || "{}"); } catch {}

      const files = Array.isArray(parsed.filenames)
        ? `<ul>${parsed.filenames.map(f => `<li>${f}</li>`).join("")}</ul>`
        : "";

      const sourcesSection = files
        ? `<section class="dashboard-section">
             <div class="dashboard-card">
               <h3>Sources</h3>${files}
             </div>
           </section>`
        : "";

      const lineageSection = report.parent_report_id
        ? `<section class="dashboard-section">
             <div class="dashboard-card">
               Regenerated from
               <a href="/report/${report.parent_report_id}">
                 Report #${report.parent_report_id}
               </a>
             </div>
           </section>`
        : "";

      let html = fs.readFileSync(
        path.join(__dirname, "Public", "report.html"),
        "utf8"
      );

      html = html
        .replace(/{{STATE}}/g, report.state.toUpperCase())
        .replace(
          "{{TRUST_MESSAGE}}",
          "This report is based on uploaded source data."
        )
        .replace("{{REPORT_ID}}", report.id)
        .replace(
          "{{REPORT_CONTENT}}",
          files || parsed.note || "No content available."
        )
        .replace(
          "{{LOCK_NOTICE}}",
          report.state !== "draft"
            ? `<div class="lock-notice">This report is locked.</div>`
            : ""
        )
        .replace(
          "{{SAVE_FORM}}",
          report.state === "draft"
            ? `<form method="POST" action="/report/${report.id}/update">
                 <button type="submit">Save</button>
               </form>`
            : ""
        )
        .replace(
          "{{REVIEW_BUTTON}}",
          report.state === "draft"
            ? `<form method="POST" action="/report/${report.id}/review">
                 <button>Mark Reviewed</button>
               </form>`
            : ""
        )
        .replace(
          "{{FINALIZE_BUTTON}}",
          report.state === "reviewed"
            ? `<form method="POST" action="/report/${report.id}/finalize">
                 <button>Finalize</button>
               </form>`
            : ""
        )
        .replace(
          "{{REGENERATE_BUTTON}}",
          report.state !== "draft"
            ? `<form method="POST" action="/report/${report.id}/regenerate">
                 <button>Regenerate</button>
               </form>`
            : ""
        )
        .replace("{{SOURCES_SECTION}}", sourcesSection)
        .replace("{{LINEAGE_SECTION}}", lineageSection);

      res.send(html);
    }
  );
});

/* =========================
   REPORT ACTIONS
========================= */
app.post("/report/:id/update", requireAuth, (req, res) => {
  db.run(
    `
    UPDATE metrics
    SET data_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ? AND state = 'draft'
    `,
    [req.body.data_json, req.params.id, req.session.user.id],
    () => res.redirect(`/report/${req.params.id}`)
  );
});

app.post("/report/:id/review", requireAuth, (req, res) => {
  db.run(
    `
    UPDATE metrics
    SET state = 'reviewed', reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ? AND state = 'draft'
    `,
    [req.params.id, req.session.user.id],
    () => res.redirect(`/report/${req.params.id}`)
  );
});

app.post("/report/:id/finalize", requireAuth, (req, res) => {
  db.run(
    `
    UPDATE metrics
    SET state = 'final', finalized_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ? AND state = 'reviewed'
    `,
    [req.params.id, req.session.user.id],
    () => res.redirect(`/report/${req.params.id}`)
  );
});

app.post("/report/:id/regenerate", requireAuth, (req, res) => {
  db.get(
    `SELECT data_json FROM metrics WHERE id = ? AND user_id = ?`,
    [req.params.id, req.session.user.id],
    (_, report) => {
      db.run(
        `
        INSERT INTO metrics (user_id, data_json, state, parent_report_id)
        VALUES (?, ?, 'draft', ?)
        `,
        [req.session.user.id, report.data_json, req.params.id],
        function () {
          res.redirect(`/report/${this.lastID}`);
        }
      );
    }
  );
});

/* =========================
   UPLOAD
========================= */
app.post("/api/upload", requireAuth, (req, res) => {
  upload.array("files", 10)(req, res, err => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (!req.files?.length) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const payload = JSON.stringify({
      filenames: req.files.map(f => f.originalname),
      note: "Draft created via upload"
    });

    db.run(
      `INSERT INTO metrics (user_id, data_json, state)
       VALUES (?, ?, 'draft')`,
      [req.session.user.id, payload],
      function (dbErr) {
        if (dbErr) {
          return res.status(500).json({ error: "Failed to create report" });
        }
        return res.json({ reportId: this.lastID });
      }
    );
  });
});

/* =========================
   START
========================= */
initDB();
app.listen(PORT, () =>
  console.log(`✅ ExecBrief running on http://localhost:${PORT}`)
);
