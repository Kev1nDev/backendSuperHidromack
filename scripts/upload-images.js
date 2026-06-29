import dotenv from 'dotenv'
import { v2 as cloudinary } from 'cloudinary'
import fs from 'fs/promises'
import path from 'path'

dotenv.config()

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
})

async function uploadImage(filePath, folder) {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: `superhidromack/${folder}`,
      resource_type: 'image',
      use_filename: true,
      unique_filename: true,
      overwrite: false,
    })
    return { success: true, url: result.secure_url, publicId: result.public_id, file: path.basename(filePath) }
  } catch (err) {
    return { success: false, error: err.message, file: path.basename(filePath) }
  }
}

async function processDirectory(dirPath, folderName) {
  const files = await fs.readdir(dirPath, { withFileTypes: true })
  const results = []

  for (const file of files) {
    const fullPath = path.join(dirPath, file.name)
    if (file.isDirectory()) {
      const subResults = await processDirectory(fullPath, `${folderName}/${file.name}`)
      results.push(...subResults)
    } else if (/\.(png|jpe?g|webp|svg)$/i.test(file.name)) {
      console.log(`Subiendo: ${file.name}...`)
      const result = await uploadImage(fullPath, folderName)
      results.push(result)
      if (result.success) {
        console.log(`  ✅ ${result.url}`)
      } else {
        console.log(`  ❌ ${result.error}`)
      }
    }
  }

  return results
}

async function main() {
  const targetPath = process.argv[2] || '../SuperHidroMack/src/assets'
  const absolutePath = path.resolve(targetPath)

  console.log(`Escaneando: ${absolutePath}\n`)

  const results = await processDirectory(absolutePath, 'assets')

  const successful = results.filter((r) => r.success)
  const failed = results.filter((r) => !r.success)

  console.log(`\n========================================`)
  console.log(`Total: ${results.length}`)
  console.log(`Exitosas: ${successful.length}`)
  console.log(`Fallidas: ${failed.length}`)
  console.log(`========================================\n`)

  // Generar mapping JSON
  const mapping = {}
  for (const r of successful) {
    mapping[r.file] = { url: r.url, publicId: r.publicId }
  }

  const outputPath = path.resolve('image-mapping.json')
  await fs.writeFile(outputPath, JSON.stringify(mapping, null, 2))
  console.log(`Mapping guardado en: ${outputPath}`)

  if (failed.length > 0) {
    console.log('\nArchivos fallidos:')
    for (const f of failed) {
      console.log(`  - ${f.file}: ${f.error}`)
    }
  }
}

main().catch((err) => {
  console.error('Error fatal:', err)
  process.exit(1)
})
