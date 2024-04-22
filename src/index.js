// require('dotenv').config({path: './env'})
import connectDB from './db/index.js'
import dotenv from 'dotenv'
import { app } from './app.js'

dotenv.config({
  path: './.env',
})

connectDB().then(() => {
  app.on('error',(error) => {
    console.log('ERROR::', error)
    throw error
  });
  app.listen(process.env.PORT || 8000, () => {
    console.log(`app is running 🚀🚀 at port: ${process.env.PORT}`);
  })
}).catch((error =>{
  console.log('MongoDB Connection Failed !!!', error);
}))











/*
const app = express()
;(async () => {
  try {
    await mongoose.connect(`${process.env.MONGODB_RUL}/${DB_NAME}`)
    app.on('error', (error) => {
      console.log('ERROR::', error)
      throw error
    })
    app.listen(process.env.PORT, () => {
      console.log(`App is running at ${process.env.PORT}`)
    })
  } catch (error) {
    console.log('ERROR::', error)
    throw error
  }
})()

*/
