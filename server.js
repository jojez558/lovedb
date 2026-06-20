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
const cloudinary = require("cloudinary").v2;
const _msc = require("multer-storage-cloudinary");
const CloudinaryStorage = _msc.CloudinaryStorage || _msc;

const { Photo, Video, Comment, Song, Message, Recording } = require("./models");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "iloveher2024";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/loveapp";
console.log("🔧 MONGO_URI loaded:", MONGO_URI);

// ===== CLOUDINARY (persistent storage — survives redeploys/restarts) =====
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Photos & general images
const photoStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "love-app/photos",
    resource_type: "image",
    allowed_formats: ["jpg", "jpeg", "png", "webp", "gif"],
  },
});

// Videos
const videoStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "love-app/videos",
    resource_type: "video",
    allowed_formats: ["mp4", "mov", "webm", "avi", "mkv"],
  },
});

// Voice recordings (audio)
const recordingStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "love-app/recordings",
    resource_type: "video", // Cloudinary treats audio under the "video" resource type
    allowed_formats: ["webm", "mp3", "wav", "m4a", "ogg"],
  },
});

const uploadPhoto = multer({
  storage: photoStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
});
const uploadVideo = multer({
  storage: videoStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
});
const uploadRecording = multer({
  storage: recordingStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

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
    const [photos, videos, song, songs, message, recordings] =
      await Promise.all([
        Photo.find().sort({ order: 1, createdAt: 1 }),
        Video.find().sort({ createdAt: -1 }),
        Song.findOne({ active: true }),
        Song.find().sort({ createdAt: 1 }),
        Message.findOne(),
        Recording.find().sort({ createdAt: -1 }),
      ]);
    res.json({ photos, videos, song, songs, message, recordings });
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
  uploadPhoto.single("photo"),
  async (req, res) => {
    try {
      const photo = await Photo.create({
        url: req.file.path, // Cloudinary secure URL
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
    if (photo && photo.url) {
      try {
        const publicId = extractCloudinaryPublicId(photo.url);
        if (publicId)
          await cloudinary.uploader.destroy(publicId, {
            resource_type: "image",
          });
      } catch (cloudErr) {
        console.warn("Cloudinary delete failed (non-fatal):", cloudErr.message);
      }
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
  uploadVideo.single("video"),
  async (req, res) => {
    try {
      const video = await Video.create({
        url: req.file.path, // Cloudinary secure URL
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
    if (video && video.url) {
      try {
        const publicId = extractCloudinaryPublicId(video.url);
        if (publicId)
          await cloudinary.uploader.destroy(publicId, {
            resource_type: "video",
          });
      } catch (cloudErr) {
        console.warn("Cloudinary delete failed (non-fatal):", cloudErr.message);
      }
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
  uploadRecording.single("recording"),
  requireRecordingKey,
  async (req, res) => {
    try {
      const recording = await Recording.create({
        url: req.file.path, // Cloudinary secure URL
        duration: req.body.duration || 0,
      });
      res.json(recording);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },
);

app.delete("/api/admin/recordings/:id", async (req, res) => {
  // Public route — she taps delete on her phone with no admin session, so
  // we check the password directly in the request body instead of relying
  // on req.session.isAdmin.
  if (req.body.password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Wrong password" });
  }
  try {
    const recording = await Recording.findByIdAndDelete(req.params.id);
    if (recording && recording.url) {
      try {
        const publicId = extractCloudinaryPublicId(recording.url);
        if (publicId)
          await cloudinary.uploader.destroy(publicId, {
            resource_type: "video",
          });
      } catch (cloudErr) {
        console.warn("Cloudinary delete failed (non-fatal):", cloudErr.message);
      }
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Helper: pull the Cloudinary public_id (including folder) out of a secure_url
// so we can delete the asset later. Cloudinary URLs look like:
// https://res.cloudinary.com/<cloud>/image/upload/v123456/love-app/photos/abc123.jpg
function extractCloudinaryPublicId(url) {
  try {
    const afterUpload = url.split("/upload/")[1]; // "v123456/love-app/photos/abc123.jpg"
    if (!afterUpload) return null;
    const withoutVersion = afterUpload.replace(/^v\d+\//, ""); // "love-app/photos/abc123.jpg"
    const withoutExt = withoutVersion.replace(/\.[a-zA-Z0-9]+$/, ""); // "love-app/photos/abc123"
    return withoutExt;
  } catch (e) {
    return null;
  }
}

// Serve the main app
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () =>
  console.log(`💕 Love app running on http://localhost:${PORT}`),
);
