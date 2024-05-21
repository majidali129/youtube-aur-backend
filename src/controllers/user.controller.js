import { Schema } from 'mongoose'
import { User } from '../models/user.model.js'
import { ApiError } from '../utils/ApiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import asyncHandler from '../utils/asyncHandler.js'
import { uploadOnCloudinary } from '../utils/cloudinary.js'
import jwt from 'jsonwebtoken'

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
  // console.log(email, password);
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
  // console.log(accessToken, refreshToken);
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
        refreshToken: 1, // this will remove field from document
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
// suppose user session got expired. Now he can go for two options.
// 1) he need to login again via credentials
// 2) he can hit some endpoint to restart his session again.
// 👇🏼 we'll go with 2nd option and create that endpoint so that  whenever user'll face unauthorized issue, hill hit this url;
const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken
  if (!incomingRefreshToken) throw new ApiError(401, 'Unauthorized request')
  try {
    const decodedToken = await jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    )
    const currentUser = await User.findById(decodedToken?._id)

    if (!currentUser) throw new ApiError(401, 'Invalid refresh token')
    if (incomingRefreshToken !== currentUser?.refreshToken) {
      throw new ApiError('Refresh token is expired or used', 401)
    }

    const options = {
      httpOnly: true,
      secure: true,
    }

    const { accessToken, refreshToken } = await setAccessAndRefreshTokens(
      currentUser._id
    )
    return res
      .status(200)
      .cookie('accessToken', accessToken, options)
      .cookie('refreshToken', refreshToken, options)
      .json(
        new ApiResponse(200, 'access token refreshed', {
          accessToken,
          refreshToken,
        })
      )
  } catch (error) {
    throw new ApiError(401, error?.message || 'Invalid refresh token')
  }
})

const updateCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body

  const user = await User.findById(req?._id)
  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

  if (!isPasswordCorrect) throw new ApiError(400, 'Invalid old password')

  user.password = newPassword
  await user.save({ validateBeforeSave: false })

  return res(200).json(
    new ApiResponse(200, {}, 'Password changed successfully')
  )
})

const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, 'User fetched successfully'))
})

const updateCurrentUser = asyncHandler(async (req, res) => {
  const { email, fullName } = req.body

  if (!(email || fullName)) {
    throw new ApiError(400, 'All fields are required')
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        fullName,
        email,
      },
    },
    { new: true }
  ).select('-password')

  return res
    .status(200)
    .json(new ApiResponse(200, user, 'Account details updated successfully'))
})

const updateUserAvatar = asyncHandler(async(req, res) => {
  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is missing");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar.url) {
    throw new ApiError(400, "Error while uploading on avatar");
  };

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
        $set:{
            avatar: avatar.url
        }
    },
    {new: true}
).select("-password")

return res
.status(200)
.json(
    new ApiResponse(200, user, "Avatar image updated successfully")
)

})

const updateUserCoverImage = asyncHandler(async(req, res) => {
  const coverImageLocalPath = req.file?.path

  if (!coverImageLocalPath) {
      throw new ApiError(400, "Cover image file is missing")
  }



  const coverImage = await uploadOnCloudinary(coverImageLocalPath)

  if (!coverImage.url) {
      throw new ApiError(400, "Error while uploading on avatar")

  }

  const user = await User.findByIdAndUpdate(
      req.user?._id,
      {
          $set:{
              coverImage: coverImage.url
          }
      },
      {new: true}
  ).select("-password")

  return res
  .status(200)
  .json(
      new ApiResponse(200, user, "Cover image updated successfully")
  )
})

const getUserChannelProfile = asyncHandler(async(req, res) => {
  const {username} = req.params;

  if(!username.trim()) {
    throw new ApiError(400, "username is missing")
  }

  const channel = await User.aggregate([
    {
      $match:{
        username:username?.toLowerCase()
      }
    },
    {
      $lookup: {
        from: 'subscriptions',
        localField: '_id',
        foreignField: 'channel',
        as: 'subscribers'
      }
    },
    {
      $lookup: {
        from: 'subscriptions',
        localField: '_id',
        foreignField: 'subscribers',
        as:'subscribedTo'
      }
    },
    {
      $addFields: {
        subscribersCount: {
          $size: '$subscribers'
        },
        channersSubscribedToCount:{
          $size: '$subscribedTo'
        },
        isSubscribed:{
          $cond: {
            $if: {$in: [req.user?._id, 'subscribers.subscriber']},
            $then: true,
            $else: false
          }
        }
      }
    },
    {
      $project: {
        fullName: 1,
        username: 1,
        subscribersCount: 1,
        channersSubscribedToCount: 1,
        isSubscribed: 1,
        avatar: 1,
        converImage: 1,
        email: 1
      }
    }
  ])

  if (!channel?.length) {
    throw new ApiError(404, "channel does not exists")
}

return res
.status(200)
.json(
    new ApiResponse(200, channel[0], "User channel fetched successfully")
)
})


const getWatchHistory = asyncHandler(async(req, res) => {
  const user = await User.aggregate([
    {
      $match: {
      _id: new Schema.Types.ObjectId(req.user?._id)
    }
  },
  {
    $lookup: {
      from: 'videos',
      localField: 'watchHistory',
      foreignField: '_id',
      as: 'watchHistory',
      pipeline: [
        {
          $lookup: {
            from: 'users',
            localField: 'owner',
            foreignField: '_id',
            as: 'owner',
            pipeline: [
              {
                $project: {
                  username: 1,
                  fullName: 1,
                  avatar: 1
                }
              }
            ]
          }
        },
        {
            $addFields: {
                owner: {
                    $first: '$owner'
                }
            }
        }
      ]
    }
  }
  ]);

  return res.status(200).json(new ApiResponse(200, user[0].watchHistory, 'watch history fetched successfully'))
})
export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  updateCurrentPassword,
  getCurrentUser,
  updateCurrentUser,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
  getWatchHistory
}
