const path = require("path");
const fs = require("fs");
const envPath = path.join(__dirname, ".env");
const envResult = require("dotenv").config({ path: envPath });
if (envResult.error) {
  console.warn("⚠️ Failed to load .env:", envResult.error.message);
} else {
  console.log("✅ Loaded .env from", envPath);
}
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const cors = require("cors");
const session = require("express-session");

const { Photo, Video, Comment, Song, Message, Recording } = require("./models");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "iloveher2024";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/loveapp";
console.log("🔧 MONGO_URI loaded:", MONGO_URI);

// Storage for uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "./public/uploads";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname.replace(/\s/g, "_"));
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: "love-secret-key",
    resave: false,
    saveUninitialized: false,
  }),
);
app.use(express.static("public"));
app.use("/uploads", express.static("public/uploads"));

// Connect MongoDB
mongoose
  .connect(MONGO_URI)
  .then(async () => {
    console.log("✅ MongoDB connected");
    // Seed default data
    const msg = await Message.findOne();
    if (!msg) {
      await Message.create({
        content: `Every morning I wake up grateful that you exist.\n\nYou are the reason I smile without knowing why,\nthe voice I want to hear first,\nand the face I want to see last.\n\nWith you, everything makes sense —\nthe butterflies, the late nights, the warmth.\n\nI think they call this love.\nAnd I never want it to end.`,
        signature: "— Forever yours 💕",
      });
    }
    const song = await Song.findOne({ active: true });
    if (!song) {
      await Song.create({
        youtubeId: "MxfbUPpwDlw",
        title: "I Think They Call This Love",
        artist: "Elliot James Reay",
        active: true,
      });
    }
  })
  .catch((err) => console.error("MongoDB error:", err));

// ===== AUTH MIDDLEWARE =====
const requireAdmin = (req, res, next) => {
  if (req.session.isAdmin) return next();
  res.status(401).json({ error: "Unauthorized" });
};

// ===== PUBLIC API =====
app.get("/api/public", async (req, res) => {
  try {
    const [photos, videos, song, message, recordings] = await Promise.all([
      Photo.find().sort({ order: 1, createdAt: 1 }),
      Video.find().sort({ createdAt: -1 }),
      Song.findOne({ active: true }),
      Message.findOne(),
      Recording.find().sort({ createdAt: -1 }),
    ]);
    res.json({ photos, videos, song, message, recordings });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get comments for a video
app.get("/api/videos/:id/comments", async (req, res) => {
  const comments = await Comment.find({ videoId: req.params.id }).sort({
    createdAt: -1,
  });
  res.json(comments);
});

// Post a comment (public - girlfriend can comment)
app.post("/api/videos/:id/comments", async (req, res) => {
  try {
    const comment = await Comment.create({
      videoId: req.params.id,
      text: req.body.text,
      author: req.body.author || "My Love 💕",
    });
    res.json(comment);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== ADMIN AUTH =====
app.post("/api/admin/login", (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: "Wrong password" });
  }
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get("/api/admin/check", (req, res) => {
  res.json({ isAdmin: !!req.session.isAdmin });
});

// ===== ADMIN: PHOTOS =====
app.post(
  "/api/admin/photos",
  requireAdmin,
  upload.single("photo"),
  async (req, res) => {
    try {
      const photo = await Photo.create({
        url: "/uploads/" + req.file.filename,
        caption: req.body.caption || "💕",
        order: req.body.order || 0,
      });
      res.json(photo);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },
);

app.delete("/api/admin/photos/:id", requireAdmin, async (req, res) => {
  try {
    const photo = await Photo.findByIdAndDelete(req.params.id);
    if (photo) {
      const fp = "./public" + photo.url;
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== ADMIN: VIDEOS =====
app.post(
  "/api/admin/videos",
  requireAdmin,
  upload.single("video"),
  async (req, res) => {
    try {
      const video = await Video.create({
        url: "/uploads/" + req.file.filename,
        title: req.body.title || "Our Moment 💕",
        thumbnail: req.body.thumbnail || "",
      });
      res.json(video);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },
);

app.delete("/api/admin/videos/:id", requireAdmin, async (req, res) => {
  try {
    const video = await Video.findByIdAndDelete(req.params.id);
    if (video) {
      const fp = "./public" + video.url;
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await Comment.deleteMany({ videoId: req.params.id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== ADMIN: SONG =====
app.get("/api/admin/songs", requireAdmin, async (req, res) => {
  const songs = await Song.find().sort({ createdAt: -1 });
  res.json(songs);
});

app.post("/api/admin/song", requireAdmin, async (req, res) => {
  try {
    await Song.updateMany({}, { active: false });
    const song = await Song.create({
      youtubeId: req.body.youtubeId,
      title: req.body.title,
      artist: req.body.artist,
      active: true,
    });
    res.json(song);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/admin/songs/:id", requireAdmin, async (req, res) => {
  try {
    const song = await Song.findByIdAndDelete(req.params.id);
    // If deleted song was active, set another one active
    if (song && song.active) {
      const next = await Song.findOne();
      if (next) {
        next.active = true;
        await next.save();
      }
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== ADMIN: MESSAGE =====
app.put("/api/admin/message", requireAdmin, async (req, res) => {
  try {
    const msg = await Message.findOneAndUpdate(
      {},
      {
        content: req.body.content,
        signature: req.body.signature,
        updatedAt: new Date(),
      },
      { upsert: true, new: true },
    );
    res.json(msg);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== RECORDINGS (her voice notes) =====
// NOTE: not gated behind requireAdmin — she records on the public site and
// sends straight to you, same as how comments work. The /uploads route
// already serves these publicly, and they appear in /api/public above.
// Lightweight key check — not the admin session, just a shared key so the
// public recording form can't be spammed by random bots. Not meant to be
// strong security, just a basic gate.
const RECORDING_KEY = process.env.RECORDING_KEY || "our-love-2024";
const requireRecordingKey = (req, res, next) => {
  if (req.body.key === RECORDING_KEY) return next();
  res.status(401).json({ error: "Unauthorized" });
};

app.post(
  "/api/admin/recordings",
  upload.single("recording"),
  requireRecordingKey,
  async (req, res) => {
    try {
      const recording = await Recording.create({
        url: "/uploads/" + req.file.filename,
        duration: req.body.duration || 0,
      });
      res.json(recording);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },
);

app.delete("/api/admin/recordings/:id", requireAdmin, async (req, res) => {
  try {
    const recording = await Recording.findByIdAndDelete(req.params.id);
    if (recording) {
      const fp = "./public" + recording.url;
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Serve the main app
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () =>
  console.log(`💕 Love app running on http://localhost:${PORT}`),
);
