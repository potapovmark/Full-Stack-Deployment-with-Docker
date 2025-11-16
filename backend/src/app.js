import express from "express"
import cors from "cors"
import helmet from "helmet"
import rateLimit from "express-rate-limit"
import dotenv from "dotenv"
import mongoose from "mongoose"
import multer from "multer"
import { createClient } from "redis"
import path from "path"
import os from "os"
import fs from "fs"
import http from "http"
import { fileURLToPath } from "url"

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

const port = process.env.PORT || 3000
const nodeEnv = process.env.NODE_ENV || "development"
const corsOrigin = process.env.CORS_ORIGIN || "http://localhost"
const redisUrl = process.env.REDIS_URL || "redis://redis:6379"
const mongoUri = process.env.MONGODB_URI || "mongodb://mongo:27017/todoapp"
const maxFileSize = parseInt(process.env.MAX_FILE_SIZE || "5242880", 10)
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads")
const enableAnalytics = process.env.ENABLE_ANALYTICS === "true"
const enableFileUpload = process.env.ENABLE_FILE_UPLOAD !== "false"

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

app.use(helmet())

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
})

app.use("/api", apiLimiter)

app.use(
  cors({
    origin: corsOrigin,
    credentials: true
  })
)

app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true, limit: "10mb" }))

app.use("/uploads", express.static(uploadDir))

const redisClient = createClient({
  url: redisUrl
})

let redisReady = false

redisClient.on("connect", () => {
  redisReady = true
})

redisClient.on("error", () => {
  redisReady = false
})

await redisClient.connect()

let mongoReady = false

mongoose.connection.on("connected", () => {
  mongoReady = true
})

mongoose.connection.on("error", () => {
  mongoReady = false
})

await mongoose.connect(mongoUri)

const attachmentSchema = new mongoose.Schema(
  {
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    uploadDate: Date
  },
  { _id: false }
)

const todoSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String },
    completed: { type: Boolean, default: false },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium"
    },
    dueDate: { type: Date },
    attachments: [attachmentSchema]
  },
  {
    timestamps: true
  }
)

const Todo = mongoose.model("Todo", todoSchema)

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, uploadDir)
  },
  filename(req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    const ext = path.extname(file.originalname)
    const base = path.basename(file.originalname, ext)
    cb(null, base + "-" + uniqueSuffix + ext)
  }
})

function fileFilter(req, file, cb) {
  const allowed = [
    "image/jpeg",
    "image/png",
    "application/pdf",
    "text/plain"
  ]
  if (allowed.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error("Invalid file type"))
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: maxFileSize
  }
})

const router = express.Router()

router.get("/health", async (req, res) => {
  const redisStatus = redisReady
  const mongoStatus = mongoReady
  const allOk = redisStatus && mongoStatus
  const statusCode = allOk ? 200 : 503
  const memoryUsage = process.memoryUsage()
  const containerId = os.hostname()
  res.status(statusCode).json({
    status: allOk ? "ok" : "degraded",
    mongo: mongoStatus ? "connected" : "disconnected",
    redis: redisStatus ? "connected" : "disconnected",
    env: nodeEnv,
    uptime: process.uptime(),
    memory: {
      rss: memoryUsage.rss,
      heapTotal: memoryUsage.heapTotal,
      heapUsed: memoryUsage.heapUsed,
      external: memoryUsage.external
    },
    containerId
  })
})

router.get("/todos", async (req, res) => {
  try {
    const status = req.query.status
    const priority = req.query.priority
    const page = parseInt(req.query.page || "1", 10)
    const limit = parseInt(req.query.limit || "10", 10)
    const skip = (page - 1) * limit

    const filter = {}
    if (status === "completed") {
      filter.completed = true
    } else if (status === "pending") {
      filter.completed = false
    }
    if (priority) {
      filter.priority = priority
    }

    const cacheKey = `todos:${JSON.stringify(filter)}:${page}:${limit}`

    if (redisReady) {
      const cached = await redisClient.get(cacheKey)
      if (cached) {
        const parsed = JSON.parse(cached)
        return res.json(parsed)
      }
    }

    const [items, total] = await Promise.all([
      Todo.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Todo.countDocuments(filter)
    ])

    const result = {
      items,
      total,
      page,
      limit
    }

    if (redisReady) {
      await redisClient.setEx(cacheKey, 300, JSON.stringify(result))
    }

    res.json(result)
  } catch (err) {
    res.status(500).json({ error: "Server error" })
  }
})

function clearTodosCache() {
  if (!redisReady) return
  const pattern = "todos:*"
  const scanAndDelete = async (cursor) => {
    const reply = await redisClient.scan(cursor, { MATCH: pattern, COUNT: 100 })
    const newCursor = reply.cursor
    const keys = reply.keys
    if (keys.length > 0) {
      await redisClient.del(keys)
    }
    if (newCursor !== "0") {
      await scanAndDelete(newCursor)
    }
  }
  scanAndDelete("0")
}

router.post("/todos", enableFileUpload ? upload.array("attachments") : (req, res, next) => next(), async (req, res) => {
  try {
    const { title, description, priority, dueDate } = req.body
    if (!title) {
      return res.status(400).json({ error: "Title is required" })
    }

    let attachments = []
    if (enableFileUpload && req.files && req.files.length > 0) {
      attachments = req.files.map((f) => ({
        filename: f.filename,
        originalName: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
        uploadDate: new Date()
      }))
    }

    const todo = await Todo.create({
      title,
      description,
      priority,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      attachments
    })

    clearTodosCache()

    res.status(201).json(todo)
  } catch (err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.message })
    }
    res.status(500).json({ error: "Server error" })
  }
})

router.put("/todos/:id", enableFileUpload ? upload.array("attachments") : (req, res, next) => next(), async (req, res) => {
  try {
    const id = req.params.id
    const updates = {}
    const allowed = ["title", "description", "completed", "priority", "dueDate"]
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) {
        if (field === "completed") {
          updates[field] = req.body[field] === "true" || req.body[field] === true
        } else if (field === "dueDate") {
          updates[field] = req.body[field] ? new Date(req.body[field]) : undefined
        } else {
          updates[field] = req.body[field]
        }
      }
    })

    if (enableFileUpload && req.files && req.files.length > 0) {
      updates.attachments = req.files.map((f) => ({
        filename: f.filename,
        originalName: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
        uploadDate: new Date()
      }))
    }

    const todo = await Todo.findByIdAndUpdate(id, updates, { new: true })
    if (!todo) {
      return res.status(404).json({ error: "Not found" })
    }

    clearTodosCache()

    res.json(todo)
  } catch (err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.message })
    }
    res.status(500).json({ error: "Server error" })
  }
})

router.delete("/todos/:id", async (req, res) => {
  try {
    const id = req.params.id
    const todo = await Todo.findByIdAndDelete(id)
    if (!todo) {
      return res.status(404).json({ error: "Not found" })
    }
    clearTodosCache()
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: "Server error" })
  }
})

router.get("/analytics", async (req, res) => {
  if (!enableAnalytics) {
    return res.status(404).json({ error: "Analytics disabled" })
  }
  try {
    const total = await Todo.countDocuments()
    const completed = await Todo.countDocuments({ completed: true })
    const pending = await Todo.countDocuments({ completed: false })
    const byPriority = await Todo.aggregate([
      {
        $group: {
          _id: "$priority",
          count: { $sum: 1 }
        }
      }
    ])
    res.json({
      total,
      completed,
      pending,
      byPriority
    })
  } catch (err) {
    res.status(500).json({ error: "Server error" })
  }
})

app.use("/api", router)

app.use((req, res) => {
  res.status(404).json({ error: "Not found" })
})

const server = http.createServer(app)

function shutdown() {
  server.close(() => {
    redisClient
      .quit()
      .catch(() => {})
      .finally(() => {
        mongoose
          .disconnect()
          .catch(() => {})
          .finally(() => {
            process.exit(0)
          })
      })
  })
}

process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)

server.listen(port, "0.0.0.0", () => {
  const message = `Server listening on ${port} in ${nodeEnv} mode`
  if (process.env.LOG_LEVEL !== "silent") {
    console.log(message)
  }
})


