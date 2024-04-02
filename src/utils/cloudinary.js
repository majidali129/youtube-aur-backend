import { v2, cloudinary } from 'cloudinary'
import fs from 'fs'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const uploadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) return null
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: 'auto',
    })
    // file uploaded on cloudinary successfully,
    console.log(`File is uploaded on cloudinary: ${response.url}`)
    return response
  } catch (error) {
    fs.unlinkSync(localFilePath) // remove the temporary saved file from local server
    return null
  }
}

export { uploadOnCloudinary }
