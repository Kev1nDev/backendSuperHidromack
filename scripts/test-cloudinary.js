import dotenv from 'dotenv'
import { v2 as cloudinary } from 'cloudinary'

dotenv.config()

console.log('Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME)
console.log('API Key:', process.env.CLOUDINARY_API_KEY)
console.log('API Secret exists:', !!process.env.CLOUDINARY_API_SECRET)

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
})

// Ping test
cloudinary.api.ping()
  .then(() => console.log('✅ Cloudinary connection OK'))
  .catch((err) => console.log('❌ Cloudinary error:', err.message))
