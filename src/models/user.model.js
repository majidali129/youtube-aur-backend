import { Schema, Model } from 'mongoose'
import { jwt } from 'jsonwebtoken'
import bcrypt from 'bcrypt'

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    watchHistory: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Video',
      },
    ],
    avatar: {
      type: String,
      required: true,
    },
    coverImage: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
    },
    refreshToken: {
      type: String,
      require: true,
    },
  },
  { timestamps: true }
)

// to avoid this middleware's execution on every operation, we'll run it only for first time or on password updates
userSchema.pre('save', function (next) {
  if (!this.isModified('password')) return next()
  this.password = bcrypt.hash(this.password, 10)
  next()
})
// we can add methods to schema/object as per need.
userSchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(password, this.password)
}

userSchema.methods.generateAccessToken = function() {
    return jwt.sign({
        _id: this._id,
        email: this.email,
        username: this.username,
        fullName: this.fullName
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
        expiresIn: process.env.ACCESS_TOKEN_EXPIRY
    }
    )
}
userSchema.methods.generateRefreshToken = function() {
    return jwt.sign({
        _id: this._id,
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
        expiresIn: process.env.REFRESH_TOKEN_EXPIRY
    }
    )
}

export const User = Model('User', userSchema)
