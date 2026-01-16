require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const path = require("path");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const { buildExploratoryPrompt } = require("./src/core/buildExploratoryPrompt");
/* ===========================
   DATABASE
=========================== */
const {
  createUser,
  findUserByEmail,
  getTeamMembers
} = require("./database");

/* ===========================
   EXECBRIEF CORE
=========================== */
const { parseUploadFiles } = require("./src/adapters/uploadAdapter");
const { normalize } = require("./src/core/normalize");
const { buildSignals } = require("./src/core/signalLibrary");

const { buildExecBriefPrompt } = require("./src/core/buildExecBriefPrompt");
const { buildExplorePrompt } = require("./src/core/prompts/explore.prompt");

const { auditExplore } = require("./src/core/audit/auditExplore");

const { generateBriefFromPrompt } = require("./src/services/aiService");

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
app.use(express.static(path.join(__dirname, "public")));

/* ===========================
   HELPERS
=========================== */
const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: "Unauthorized" });
};

const sendPublic = (res, file) =>
  res.sendFile(path.join(__dirname, "public", file));

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
      const mode = req.body.mode || "exec";
      const context = (req.body.context || "").trim();

      // MVP raw data
      const raw = {
        source: "upload",
        confidence: "medium",
        assumptions: ["MVP demo data"],
        current: { revenue: 420000, cac: 145, churn_rate: 0.021 },
        previous: { revenue: 445000, cac: 112, churn_rate: 0.020 }
      };

      const normalized = normalize(raw);
      const signalsPack = buildSignals(normalized);

      const prompt = buildExecBriefPrompt({
        mode,
        signalsPack,
        context
      });

      const brief = await generateBriefFromPrompt(prompt);

      return res.json({ success: true, brief });

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

      }

      const context = (req.body.context || "").trim();
      const mode = req.body.mode || "exec"; // exec | explore

      // 1️⃣ Adapter
      const raw = parseUploadFiles(req.files);

      // 2️⃣ Normalize
      const normalized = normalize(raw);

      // 3️⃣ Signals
      const signalsPack = buildSignals(normalized);

      let prompt;
      let brief;

      // =========================
      // MODE SWITCH
      // =========================
      if (mode === "explore") {
        prompt = buildExplorePrompt({ signalsPack, context });
        brief = await generateBriefFromPrompt(prompt);

        const audit = auditExplore({ briefJson: brief });
        if (!audit.ok) {
          return res.status(422).json({
            success: false,
            error: "Audit failed",
            details: audit.errors
          });
        }

        return res.json({ success: true, mode: "explore", brief });
      }

      // =========================
      // DEFAULT: EXECUTIVE BRIEF
      // =========================
      prompt = buildExecBriefPrompt({ signalsPack, context });
      brief = await generateBriefFromPrompt(prompt);

      return res.json({
        success: true,
        mode: "exec",
        brief
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
   START SERVER
=========================== */

app.listen(PORT, () => {
  console.log(`✅ ExecBrief running on http://localhost:${PORT}`);
});
