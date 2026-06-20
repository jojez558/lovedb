const mongoose = require("mongoose");

const PhotoSchema = new mongoose.Schema({
  url: String,
  caption: String,
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

const VideoSchema = new mongoose.Schema({
  url: String,
  title: String,
  thumbnail: String,
  createdAt: { type: Date, default: Date.now },
});

const CommentSchema = new mongoose.Schema({
  videoId: { type: mongoose.Schema.Types.ObjectId, ref: "Video" },
  text: String,
  author: { type: String, default: "My Love 💕" },
  createdAt: { type: Date, default: Date.now },
});

const SongSchema = new mongoose.Schema({
  youtubeId: String,
  title: String,
  artist: String,
  active: { type: Boolean, default: false },
});

const MessageSchema = new mongoose.Schema({
  content: String,
  signature: String,
  updatedAt: { type: Date, default: Date.now },
});

const RecordingSchema = new mongoose.Schema({
  url: String,
  duration: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

module.exports = {
  Photo: mongoose.model("Photo", PhotoSchema),
  Video: mongoose.model("Video", VideoSchema),
  Comment: mongoose.model("Comment", CommentSchema),
  Song: mongoose.model("Song", SongSchema),
  Message: mongoose.model("Message", MessageSchema),
  Recording: mongoose.model("Recording", RecordingSchema),
};
