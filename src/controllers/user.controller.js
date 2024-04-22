import { User } from '../models/user.model.js'
import { ApiError } from '../utils/ApiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import asyncHandler from '../utils/asyncHandler.js'
import { uploadOnCloudinary } from '../utils/cloudinary.js'

const setAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId)
    const accessToken = user.generateAccessToken()
    const refreshToken = user.generateRefreshToken()
    user.refreshToken = refreshToken
    await user.save({ validateBeforeSave: false })

    return { accessToken, refreshToken }
  } catch (error) {
    throw new ApiError(
      500,
      'Something went wrong while generating access refresh token'
    )
  }
}

const registerUser = asyncHandler(async (req, res) => {
  // get user credentials from client
  const { username, email, fullName, password } = req.body

  // validate request
  if (
    [username, email, fullName, password].some((field) => field?.trim() === '')
  )
    throw new ApiError(400, 'All fields required')

  // check if user already exists via username & email
  const existingUser = await User.findOne({
    $or: [{ username }, { email }],
  })
  if (existingUser)
    throw new ApiError(409, 'User with credentials already exists')

  // get images, avatar required
  const avatarLocalPath = req.files?.avatar[0]?.path
  const coverImageLocalPath = req.files?.coverImage[0]?.path
  // let coverImageLocalPath;

  // if(req.files && Array.isArray(req.files?.localImage))

  // upload to cloudinary, avatar required, after that get their cloudinary referance url
  if (!avatarLocalPath) throw new ApiError(400, 'Avatar file is required')
  const avatar = await uploadOnCloudinary(avatarLocalPath)
  const coverImage = await uploadOnCloudinary(coverImageLocalPath)

  // create user object, make db entry
  const user = await User.create({
    username: username.toLowerCase(),
    email,
    fullName,
    password,
    avatar: avatar?.url,
    coverImage: coverImage?.url || '',
  })

  // remove password and refreshToken from res
  const createduser = await User.findById(user._id).select(
    '-password -refreshToken'
  )

  // confirm user creation
  if (!createduser)
    throw new ApiError(500, 'Something went wrong while regestring user')

  // return response
  return res
    .status(201)
    .json(new ApiResponse(200, 'User registered successfully', createduser))
})

const loginUser = asyncHandler(async (req, res) => {
  // get user credentials from frontend
  const { username, email, password } = req.body
  console.log(email, password);
  // validate request
  if (!(username || email))
    throw new ApiError(400, 'username or email is required')

  // make db call to check if user exists
  const user = await User.findOne({
    $or: [{ username }, { email }],
  })
  if (!user) throw new ApiError(404, 'User does not exist')
  // check for password
  const isPasswordCorrect = user.isPasswordValid(password)
  if (!isPasswordCorrect) throw new ApiError(401, 'Invalid User Credentials')

  // set tokens (access, refresh)
  const { accessToken, refreshToken } = await setAccessAndRefreshTokens(
    user._id
  )
  console.log(accessToken, refreshToken);
  // remove password & refreshToken from user
  const loggedInUser = await User.findById(user._id).select(
    '-password -refreshToken'
  )
  // send tokens to client in cookies
  const options = {
    httpOnly: true,
    secure: true,
  }

  return res
    .status(200)
    .cookie('accessToken', accessToken, options)
    .cookie('refreshToken', refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        'User logged In successfully'
      )
    )
})

const logoutUser = asyncHandler(async (req, res) => {
  // here i need to logout the user. mean need to perform db operation based upon some info about user. So, how i can access user it's a problem. because here req'll not give me user.
  // to address this issue, i can use my own middleware at this route.
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: {
        refreshToken: undefined,
      },
    },
    {
      new: true,
    }
  )

  const options = {
    httpOnly: true,
    secure: true,
  }

  res
    .status(200)
    .clearCookie('accessToken', options)
    .clearCookie('refreshToken', options)
    .json(new ApiResponse(200, {}, 'User logged Out'))
})

export { registerUser, loginUser, logoutUser }
