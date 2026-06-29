import express from 'express'
import cors from 'cors'
import multer from 'multer'
import jwt from 'jsonwebtoken'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import cookieParser from 'cookie-parser'

dotenv.config()

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

// ─── Auth Middleware ──────────────────────────────────────────

function authMiddleware(req, res, next) {
  const token = req.cookies?.token
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

    console.log('DEBUG login - email recibido:', email)
    console.log('DEBUG login - email supabase auth:', data.user.email)

    const { data: allAdmins, error: allErr } = await supabase.from('admins').select('*')
    console.log('DEBUG login - total admins in table:', allAdmins?.length)
    console.log('DEBUG login - SUPABASE_URL:', process.env.SUPABASE_URL)

    const { data: adminRow, error: adminErr } = await supabase
      .from('admins')
      .select('*')
      .ilike('email', email)

    console.log('DEBUG login - filtered adminRow:', adminRow)
    console.log('DEBUG login - adminErr:', adminErr)

    if (!adminRow || adminRow.length === 0) {
      return res.status(403).json({ error: 'Acceso denegado. No eres administrador.' })
    }

    const token = jwt.sign({ email: data.user.email, id: data.user.id }, JWT_SECRET, { expiresIn: '7d' })
    res.cookie('token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    res.json({ email: data.user.email })
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
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
  })
  res.json({ ok: true })
})

// ─── Health Check ──────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

// ─── CRUD Routes ────────────────────────────────────────────────

const TABLES = ['categorias', 'aecLineas', 'productosVendidos', 'ventajas', 'brands']

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
    const ext = req.file.originalname.split('.').pop()
    const folder = req.body.folder || 'images'
    const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { data, error } = await supabase.storage
      .from('uploads')
      .upload(fileName, req.file.buffer, { contentType: req.file.mimetype, upsert: false })
    if (error) return res.status(500).json({ error: error.message })
    const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(data.path)
    res.json({ url: urlData.publicUrl, path: data.path })
  } catch (err) {
    console.error('Upload error:', err)
    res.status(500).json({ error: 'Error al subir imagen' })
  }
})

app.delete('/api/upload', authMiddleware, async (req, res) => {
  try {
    const { path: filePath } = req.body
    if (!filePath) return res.status(400).json({ error: 'Path requerido' })
    await supabase.storage.from('uploads').remove([filePath])
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Error al eliminar' })
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