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
  db,
  createUser,
  findUserByEmail,
  getTeamMembers,
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

app.use(express.static(path.join(__dirname, "Public")));

/* ===========================
   HELPERS
=========================== */
const requireAuth = (req, res, next) => {
  if (req.session?.user) return next();
  return res.status(401).json({ error: "Unauthorized" });
};

const sendPublic = (res, file) =>
  res.sendFile(path.join(__dirname, "Public", file));

/* ===========================
   FILE UPLOAD
=========================== */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

/* ===========================
   PAGE ROUTES
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

app.get("/api/profile", requireAuth, async (req, res) => {
  try {
    const user = await findUserByEmail(req.session.user.email);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      name: user.name,
      email: user.email,
      company: user.company_name,
      tier: user.tier || "Free"
    });
  } catch (err) {
    console.error("Profile error:", err);
    res.status(500).json({ error: "Profile load failed" });
  }
});
app.post("/report/:id/regenerate", requireAuth, (req, res) => {
  const reportId = req.params.id;
  const userId = req.session.user.id;
  const html = safeRender(template, html =>
  html
    .replace(/{{STATE}}/g, report.state.toUpperCase())
    .replace(/{{TRUST_MESSAGE}}/g, "This report is based on uploaded source data.")
    .replace(/{{REPORT_ID}}/g, report.id)
    .replace(/{{REPORT_CONTENT}}/g, report.data_json || "")
    .replace(/{{LOCK_NOTICE}}/g,
      report.state !== "draft"
        ? `<div class="lock-notice">This report is locked and cannot be edited.</div>`
        : ""
    )
    .replace(/{{SAVE_BUTTON}}/g,
      report.state === "draft"
        ? `<button class="btn-primary" type="submit">Save</button>`
        : ""
    )
    .replace(/{{REVIEW_BUTTON}}/g,
      report.state === "draft"
        ? `<form method="POST" action="/report/${report.id}/review">
             <button class="btn-text-white">Mark Reviewed</button>
           </form>`
        : ""
    )
    .replace(/{{FINALIZE_BUTTON}}/g,
      report.state === "reviewed"
        ? `<form method="POST" action="/report/${report.id}/finalize">
             <button class="btn-primary">Finalize</button>
           </form>`
        : ""
    )
    .replace(/{{REGENERATE_BUTTON}}/g,
      report.state !== "draft"
        ? `<form method="POST" action="/report/${report.id}/regenerate">
             <button class="btn-text-white">Regenerate</button>
           </form>`
        : ""
    )
    .replace(/{{SOURCES_SECTION}}/g, sourcesSection || "")
    .replace(/{{LINEAGE_SECTION}}/g, lineageHtml || "")
);


  db.get(
    `SELECT data_json FROM metrics WHERE id = ? AND user_id = ?`,
    [reportId, userId],
    (err, report) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Failed to regenerate");
      }
      if (!report) {
        return res.status(404).send("Report not found");
      }

      db.run(
        `
        INSERT INTO metrics (user_id, data_json, state, parent_report_id)
        VALUES (?, ?, 'draft', ?)
        `,
        [userId, report.data_json, reportId],
        function () {
          res.redirect(`/report/${this.lastID}`);
        }
      );
    }
  );
});


/* ===========================
   ✅ REQUIRED DASHBOARD APIs
=========================== */

/** 🔹 Company info */
app.get("/api/company", requireAuth, (req, res) => {
  res.json({
    company: req.session.user.company,
    tier: req.session.user.tier || "Free"
  });
});

/** 🔹 Reports list */
app.get("/api/reports", requireAuth, (req, res) => {
  db.all(
    `
    SELECT id, state, reviewed_at, finalized_at, updated_at
    FROM metrics
    WHERE user_id = ?
    ORDER BY datetime(updated_at) DESC
    `,
    [req.session.user.id],
    (err, rows) => {
      if (err) {
        console.error("Failed to load reports:", err);
        return res.status(500).json({ error: "Failed to load reports" });
      }
      res.json({ reports: rows || [] });
    }
  );
});

/* ===========================
   REPORT VIEW
=========================== */
app.get("/report/:id", requireAuth, (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;

  db.get(
    `SELECT * FROM metrics WHERE id = ? AND user_id = ?`,
    [id, userId],
    (err, report) => {
      if (err || !report) return res.status(404).send("Report not found");

      const template = fs.readFileSync(
        path.join(__dirname, "Public", "report.html"),
        "utf8"
      );

      const html = template
        .replace(/{{STATE}}/g, report.state.toUpperCase())
        .replace(/{{REPORT_ID}}/g, report.id)
        .replace(/{{REPORT_CONTENT}}/g, report.data_json || "")
        .replace(
          "{{READONLY_ATTR}}",
          report.state === "final" ? "readonly" : ""
        )
        .replace(
          "{{REGENERATE_BUTTON}}",
          report.state !== "draft"
            ? `<form method="POST" action="/report/${id}/regenerate">
                 <button>Regenerate</button>
               </form>`
            : ""
        );

      res.send(html);
    }
  );
});

app.get("/api/summary", requireAuth, (req, res) => {
  res.json({
    summary: "This executive brief is based on your latest uploaded data and reflects the current decision context."
  });
});

app.get("/api/signals", requireAuth, (req, res) => {
  res.json([
    {
      label: "Revenue Trend",
      value: "+8%",
      direction: "↑",
      trend: "good",
      context: "Revenue increased month-over-month"
    },
    {
      label: "Cost Pressure",
      value: "Moderate",
      direction: "→",
      trend: "stable",
      context: "Costs remain within expected range"
    }
  ]);
});

app.get("/api/actions", requireAuth, (req, res) => {
  res.json({
    actions: [
      {
        title: "Review pricing strategy",
        reason: "Market demand supports higher margins",
        consequence: "Potential short-term churn",
        impact: "High",
        confidence: 82
      }
    ]
  });
});


/* ===========================
   AUTH APIs
=========================== */
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await findUserByEmail(email);

    if (!user || !(await bcrypt.compare(password, user.password))) {
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
  } catch (err) {
    console.error("Login failed:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

/* ===========================
   UPLOAD
=========================== */
app.post("/api/upload", requireAuth, upload.array("files", 10), (req, res) => {
  const payload = JSON.stringify({
    filenames: req.files.map(f => f.originalname),
    note: "Draft created via upload"
  });

  db.run(
    `INSERT INTO metrics (user_id, data_json, state)
     VALUES (?, ?, 'draft')`,
    [req.session.user.id, payload],
    function () {
      res.json({ reportId: this.lastID });
    }
  );
});

/* ===========================
   START SERVER
=========================== */
initDB();

app.listen(PORT, () => {
  console.log(`✅ ExecBrief running on http://localhost:${PORT}`);
});
