import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Leer credenciales del .env
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL y SUPABASE_SERVICE_KEY deben estar configurados en las variables de entorno')
  console.error('Ejemplo:')
  console.error('  $env:SUPABASE_URL="https://tu-proyecto.supabase.co"')
  console.error('  $env:SUPABASE_SERVICE_KEY="tu_service_role_key"')
  console.error('  node scripts/seed-database.js')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Leer datos locales
const imageMapping = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'image-mapping.json'), 'utf8'))

async function seedDatabase() {
  console.log('🌱 Iniciando carga de datos en Supabase...\n')

  // ─── 1. Insertar aecLineas ─────────────────────────────────────
  const aecLineasData = [
    { id: 'AEC-P01', linea: 'Silicon', desc: 'Sellador multiuso para juntas y superficies, alto desempeño térmico.', featured: true, order: 1 },
    { id: 'AEC-P02', linea: 'Bomba de Gasolina', desc: 'Suministro estable para sistemas de alimentación, compatibilidad OEM.', order: 2 },
    { id: 'AEC-P03', linea: 'Limpia Carburador', desc: 'Limpieza efectiva de carburadores y cuerpos de admisión.', order: 3 },
  ]

  console.log('📦 Insertando aecLineas...')
  const { error: lineasError } = await supabase.from('aecLineas').upsert(aecLineasData, { onConflict: 'id' })
  if (lineasError) {
    console.error('❌ Error en aecLineas:', lineasError)
  } else {
    console.log('✅ aecLineas insertadas correctamente')
  }

  // ─── 2. Insertar productos desde image-mapping ──────────────────
  console.log('\n📦 Insertando productosVendidos...')
  const productos = []
  let order = 1

  for (const [filePath, data] of Object.entries(imageMapping)) {
    if (filePath.startsWith('Productos/')) {
      const name = path.basename(filePath, path.extname(filePath))
        .replace(/%20/g, ' ')
        .replace(/%28/g, '(')
        .replace(/%29/g, ')')
      
      // Determinar categoría basada en el nombre
      let category = 'General'
      if (name.toLowerCase().includes('bomba') || name.toLowerCase().includes('gasolina')) category = 'Bomba de Gasolina'
      else if (name.toLowerCase().includes('silicon')) category = 'Silicon'
      else if (name.toLowerCase().includes('carburador') || name.toLowerCase().includes('limpia')) category = 'Limpia Carburador'
      else if (name.toLowerCase().includes('filtro')) category = 'Filtros'
      else if (name.toLowerCase().includes('freno')) category = 'Frenos'
      else if (name.toLowerCase().includes('rodamiento')) category = 'Rodamientos'
      else if (name.toLowerCase().includes('contacto') || name.toLowerCase().includes('electronica')) category = 'Limpia Contactos'
      else if (name.toLowerCase().includes('color') || name.toLowerCase().includes('spray')) category = 'Pinturas'
      else if (name.toLowerCase().includes('modulo') || name.toLowerCase().includes('automatico') || name.toLowerCase().includes('bendix')) category = 'Arranque'
      else if (name.toLowerCase().includes('aceite') || name.toLowerCase().includes('lubricante')) category = 'Lubricantes'
      else if (name.toLowerCase().includes('selenoide') || name.toLowerCase().includes('solenoide')) category = 'Arranque'
      else if (name.toLowerCase().includes('alternador')) category = 'Electrico'
      else if (name.toLowerCase().includes('bujia')) category = 'Encendido'

      productos.push({
        id: name.replace(/\s+/g, '-').toLowerCase(),
        name: name,
        description: `Producto ${name} de alta calidad.`,
        image: data.url,
        category: category,
        order: order++,
      })
    }
  }

  if (productos.length > 0) {
    const { error: prodError } = await supabase.from('productosVendidos').upsert(productos, { onConflict: 'id' })
    if (prodError) {
      console.error('❌ Error en productosVendidos:', prodError)
    } else {
      console.log(`✅ ${productos.length} productos insertados correctamente`)
    }
  }

  // ─── 3. Insertar brands (logos/áreas) ──────────────────────────
  console.log('\n📦 Insertando brands...')
  const brands = []
  let brandOrder = 1
  
  for (const [filePath, data] of Object.entries(imageMapping)) {
    if (filePath.startsWith('logos/') || filePath.startsWith('Areas/')) {
      const name = path.basename(filePath, path.extname(filePath))
        .replace(/%20/g, ' ')
        .replace(/%28/g, '(')
        .replace(/%29/g, ')')
      
      brands.push({
        id: name.replace(/\s+/g, '-').toLowerCase(),
        name: name,
        logo: data.url,
        description: `Imagen de ${name}`,
        order: brandOrder++,
      })
    }
  }

  if (brands.length > 0) {
    const { error: brandError } = await supabase.from('brands').upsert(brands, { onConflict: 'id' })
    if (brandError) {
      console.error('❌ Error en brands:', brandError)
    } else {
      console.log(`✅ ${brands.length} brands insertados correctamente`)
    }
  }

  // ─── 4. Crear categorías basadas en productos ──────────────────
  console.log('\n📦 Insertando categorías...')
  const categoriasUnicas = [...new Set(productos.map(p => p.category))]
  const categorias = categoriasUnicas.map((cat, idx) => ({
    id: cat.toLowerCase().replace(/\s+/g, '-'),
    name: cat,
    description: `Categoría de productos: ${cat}`,
    order: idx + 1,
  }))

  if (categorias.length > 0) {
    const { error: catError } = await supabase.from('categorias').upsert(categorias, { onConflict: 'id' })
    if (catError) {
      console.error('❌ Error en categorias:', catError)
    } else {
      console.log(`✅ ${categorias.length} categorías insertadas correctamente`)
    }
  }

  console.log('\n🎉 ¡Carga de datos completada!')
  console.log(`\nResumen:
  - aecLineas: ${aecLineasData.length}
  - productosVendidos: ${productos.length}
  - brands: ${brands.length}
  - categorias: ${categorias.length}`)
}

seedDatabase().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
