import { User } from '../models/user.model.js'
import { ApiError } from '../utils/ApiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import asyncHandler from '../utils/asyncHandler.js'
import { uploadOnCloudinary } from '../utils/cloudinary.js'

const registerUser = asyncHandler(async (req, res) => {
  // get user credentials from client
  const { username, email, fullName, password } = req.body

  // validate request
  if (
    [username, email, fullName, password].some((field) => field.trim() === '')
  )
    throw new ApiError(400, 'All fields required')

  // check if user already exists via username & email
  const existingUser = User.findOne({
    $or: [{ username }, { email }],
  })
  if (existingUser)
    throw new ApiError(409, 'User with credentials already exists')

  // get images, avatar required
  const avatarLocalPath = req.files?.avatar[0]?.path
  const coverImageLocalPath = req.files?.localImage[0]?.path

  // upload to cloudinary, avatar required, after that get their cloudinary referance url
  if (!avatarLocalPath) throw new ApiError(400, 'Avatar file is required')
  const avatar = await uploadOnCloudinary(avatarLocalPath)
  const coverImage = await uploadOnCloudinary(coverImageLocalPath)

  // create user object, make db entry
  const user = await User.create({
    username: username.toLowerCase(),
    avatar: avatar?.url,
    coverImage: coverImage?.url || '',
    email,
    fullName,
    password,
  })

  // remove password and refreshToken from res
  const createduser = User.findById(user._id).select('-password -refreshToken')

  // confirm user creation
  if (!createduser)
    throw new ApiError(500, 'Something went wrong while regestring user')

  // return response
  return res
    .status(201)
    .json(new ApiResponse(200, 'User registered successfully', createduser))
})

export { registerUser }
