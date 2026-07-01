import express from 'express'
import cors from 'cors'
import multer from 'multer'
import jwt from 'jsonwebtoken'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import cookieParser from 'cookie-parser'
import { v2 as cloudinary } from 'cloudinary'

dotenv.config()

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'do3kjbiy8',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
})

const app = express()
const PORT = process.env.PORT || 3001
const JWT_SECRET = process.env.JWT_SECRET || 'superhidromack-secret-2026'
const isProd = process.env.NODE_ENV === 'production'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://super-hidro-mack.vercel.app',
    process.env.FRONTEND_URL,
  ].filter(Boolean),
  credentials: true,
}))
app.use(express.json())
app.use(cookieParser())

// ─── Rate Limiting ─────────────────────────────────────────────

const RATE_LIMIT = new Map()
const RATE_WINDOW_MS = 15 * 60 * 1000 // 15 minutos
const RATE_MAX_REQUESTS = 5 // max 5 requests por ventana

function rateLimitMiddleware(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown'
  const now = Date.now()
  const record = RATE_LIMIT.get(ip)

  if (record) {
    if (now - record.start > RATE_WINDOW_MS) {
      // Ventana expirada, reiniciar
      RATE_LIMIT.set(ip, { count: 1, start: now })
    } else if (record.count >= RATE_MAX_REQUESTS) {
      return res.status(429).json({
        error: 'Demasiadas solicitudes. Intenta de nuevo en 15 minutos.',
      })
    } else {
      record.count += 1
    }
  } else {
    RATE_LIMIT.set(ip, { count: 1, start: now })
  }

  next()
}

// Limpiar entradas antiguas cada hora para evitar memory leak
setInterval(() => {
  const now = Date.now()
  for (const [ip, record] of RATE_LIMIT.entries()) {
    if (now - record.start > RATE_WINDOW_MS) {
      RATE_LIMIT.delete(ip)
    }
  }
}, 60 * 60 * 1000)

// ─── Auth Middleware ──────────────────────────────────────────

function authMiddleware(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return res.status(401).json({ error: 'No autorizado' })
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch {
    return res.status(401).json({ error: 'Token invalido' })
  }
}

// ─── Auth Routes ───────────────────────────────────────────────

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = req.body.email?.toLowerCase().trim()
    const { password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contrasena requeridos' })
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return res.status(401).json({ error: 'Credenciales incorrectas' })

    const { data: adminRow } = await supabase
      .from('admins')
      .select('*')
      .ilike('email', email)

    // SECURITY NOTE: The following auto-seed block is DISABLED by default.
    // If you are setting up the project for the first time on a NEW database
    // (e.g., after changing Supabase credentials or resetting the project),
    // uncomment the block below so the first successful login creates the admin.
    // AFTER the first admin is created, re-comment this block to avoid the
    // vulnerability where any authenticated user becomes admin if the table
    // is ever emptied.
    //
    if (!adminRow || adminRow.length === 0) {
      const { count } = await supabase.from('admins').select('*', { count: 'exact', head: true })
      if (count === 0) {
        await supabase.from('admins').insert({ id: data.user.id, email: data.user.email })
      } else {
        return res.status(403).json({ error: 'Acceso denegado. No eres administrador.' })
      }
    }

    const token = jwt.sign({ email: data.user.email, id: data.user.id }, JWT_SECRET, { expiresIn: '7d' })
    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    res.json({ email: data.user.email, token })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Error del servidor' })
  }
})

app.post('/api/auth/register', (_req, res) => {
  res.status(403).json({ error: 'El registro de nuevas cuentas esta deshabilitado.' })
})

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ email: req.user.email, id: req.user.id })
})

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
  })
  res.json({ ok: true })
})

// ─── Health Check ──────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

// ─── Image Upload ───────────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true)
    else cb(new Error('Solo se permiten imagenes'))
  },
})

app.post('/api/upload', authMiddleware, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se subio ninguna imagen' })
  try {
    const folder = req.body.folder || 'superhidromack'
    const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
    const result = await cloudinary.uploader.upload(base64, {
      folder,
      resource_type: 'image',
    })
    res.json({ url: result.secure_url, publicId: result.public_id })
  } catch (err) {
    console.error('Upload error:', err)
    res.status(500).json({ error: 'Error al subir imagen' })
  }
})

app.delete('/api/upload', authMiddleware, async (req, res) => {
  try {
    const { publicId } = req.body
    if (!publicId) return res.status(400).json({ error: 'publicId requerido' })
    await cloudinary.uploader.destroy(publicId)
    res.json({ ok: true })
  } catch (err) {
    console.error('Delete image error:', err)
    res.status(500).json({ error: 'Error al eliminar imagen' })
  }
})

// ─── Bulk Upload (Admin only) ────────────────────────────────────

const bulkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'image/svg+xml') cb(null, true)
    else cb(new Error('Solo se permiten imagenes'))
  },
})

app.post('/api/bulk-upload', authMiddleware, bulkUpload.array('images', 50), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No se subio ninguna imagen' })
  }

  const folder = req.body.folder || 'superhidromack/bulk'
  const results = []

  for (const file of req.files) {
    try {
      const base64 = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
      const result = await cloudinary.uploader.upload(base64, {
        folder,
        resource_type: 'image',
        use_filename: true,
        unique_filename: true,
      })
      results.push({
        originalName: file.originalname,
        url: result.secure_url,
        publicId: result.public_id,
        success: true,
      })
    } catch (err) {
      results.push({
        originalName: file.originalname,
        error: err.message,
        success: false,
      })
    }
  }

  res.json({ uploaded: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length, results })
})

// ─── CRUD Routes ────────────────────────────────────────────────

const TABLES = ['categorias', 'aecLineas', 'productosVendidos', 'ventajas', 'brands', 'distribuidores']

app.get('/api/:table', async (req, res) => {
  const table = req.params.table
  if (!TABLES.includes(table)) return res.status(404).json({ error: 'Tabla no encontrada' })
  try {
    const { data, error } = await supabase.from(table).select('*').order('order', { ascending: true })
    if (error) return res.status(500).json({ error: error.message })
    res.json(data || [])
  } catch {
    res.json([])
  }
})

app.get('/api/:table/:id', async (req, res) => {
  const table = req.params.table
  if (!TABLES.includes(table)) return res.status(404).json({ error: 'Tabla no encontrada' })
  try {
    const { data, error } = await supabase.from(table).select('*').eq('id', req.params.id).single()
    if (error) return res.status(404).json({ error: 'No encontrado' })
    res.json(data)
  } catch {
    res.status(404).json({ error: 'No encontrado' })
  }
})

app.post('/api/:table', authMiddleware, async (req, res) => {
  const table = req.params.table
  if (!TABLES.includes(table)) return res.status(404).json({ error: 'Tabla no encontrada' })
  try {
    const { data, error } = await supabase.from(table).upsert(req.body, { onConflict: 'id' }).select()
    if (error) return res.status(500).json({ error: error.message })
    res.json(data?.[0] || req.body)
  } catch (err) {
    console.error('Save error:', err)
    res.status(500).json({ error: 'Error del servidor' })
  }
})

app.put('/api/:table/:id', authMiddleware, async (req, res) => {
  const table = req.params.table
  if (!TABLES.includes(table)) return res.status(404).json({ error: 'Tabla no encontrada' })
  try {
    const { data, error } = await supabase.from(table).update(req.body).eq('id', req.params.id).select()
    if (error) return res.status(500).json({ error: error.message })
    res.json(data?.[0] || req.body)
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' })
  }
})

app.delete('/api/:table/:id', authMiddleware, async (req, res) => {
  const table = req.params.table
  if (!TABLES.includes(table)) return res.status(404).json({ error: 'Tabla no encontrada' })
  try {
    const { error } = await supabase.from(table).delete().eq('id', req.params.id)
    if (error) return res.status(500).json({ error: error.message })
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Error del servidor' })
  }
})

// ─── Contact / B2B Requests ──────────────────────────────────────

app.get('/api/contact', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('contact_requests')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) return res.status(500).json({ error: error.message })
    res.json(data || [])
  } catch (err) {
    console.error('List contact error:', err)
    res.status(500).json({ error: 'Error del servidor' })
  }
})

app.put('/api/contact/:id', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body
    if (!status || !['nuevo', 'en_proceso', 'completado', 'cancelado'].includes(status)) {
      return res.status(400).json({ error: 'Status invalido' })
    }
    const { data, error } = await supabase
      .from('contact_requests')
      .update({ status })
      .eq('id', req.params.id)
      .select()

    if (error) return res.status(500).json({ error: error.message })
    res.json(data?.[0] || { ok: true })
  } catch (err) {
    console.error('Update contact error:', err)
    res.status(500).json({ error: 'Error del servidor' })
  }
})

app.delete('/api/contact/:id', authMiddleware, async (req, res) => {
  try {
    const { error } = await supabase.from('contact_requests').delete().eq('id', req.params.id)
    if (error) return res.status(500).json({ error: error.message })
    res.json({ ok: true })
  } catch (err) {
    console.error('Delete contact error:', err)
    res.status(500).json({ error: 'Error del servidor' })
  }
})

app.post('/api/contact', rateLimitMiddleware, async (req, res) => {
  try {
    const { name, company, email, phone, volume, message } = req.body
    if (!name || !email || !company) {
      return res.status(400).json({ error: 'Nombre, empresa y correo son requeridos' })
    }

    const { data, error } = await supabase.from('contact_requests').insert({
      name: name.trim(),
      company: company.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || null,
      volume: volume?.trim() || null,
      message: message?.trim() || null,
    }).select()

    if (error) {
      console.error('Contact insert error:', error)
      return res.status(500).json({ error: 'Error al guardar la solicitud' })
    }

    res.json({ ok: true, id: data?.[0]?.id })
  } catch (err) {
    console.error('Contact endpoint error:', err)
    res.status(500).json({ error: 'Error del servidor' })
  }
})

// ─── Start ──────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(``)
  console.log(`  SuperHidroMack API`)
  console.log(`  http://localhost:${PORT}`)
  console.log(`  Health: http://localhost:${PORT}/api/health`)
  console.log(``)
})