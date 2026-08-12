import crypto from 'crypto';
import User from '../models/User.js';
import RefreshToken from '../models/RefreshToken.js';
import VerificationToken from '../models/VerificationToken.js';
import PasswordResetToken from '../models/PasswordResetToken.js';
import { generateToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/email.js';

/**
 * @desc    Register a new customer account
 * @route   POST /api/auth/register
 * @access  Public
 */
export const registerUser = async (req, res, next) => {
  try {
    const { firstName, lastName, name, email, password, confirmPassword, phone } = req.body;

    // Handle full name parsing if name is provided instead of firstName/lastName
    let fName = firstName;
    let lName = lastName;
    if (!fName && name) {
      const parts = name.trim().split(' ');
      fName = parts[0];
      lName = parts.slice(1).join(' ') || parts[0];
    }

    if (!fName || !lName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide full name, email, and password.'
      });
    }

    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email address already exists.'
      });
    }

    // Create User
    const user = await User.create({
      firstName: fName.trim(),
      lastName: lName.trim(),
      email: normalizedEmail,
      password,
      phone: phone ? phone.trim() : '',
      role: 'customer',
      isEmailVerified: false,
      isActive: true
    });

    // Create Verification Token
    const rawVerificationToken = crypto.randomBytes(32).toString('hex');
    await VerificationToken.create({
      userId: user._id,
      token: rawVerificationToken,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    });

    // Dispatch verification email in background
    sendVerificationEmail(user.email, rawVerificationToken, `${user.firstName} ${user.lastName}`);

    // Create JWT Tokens & Session
    const token = generateToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    await RefreshToken.create({
      userId: user._id,
      token: refreshToken,
      deviceInfo: req.headers['user-agent'] || '',
      ipAddress: req.ip || '',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    });

    return res.status(201).json({
      success: true,
      message: 'Account created successfully. Please check your email to verify your account.',
      token,
      refreshToken,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isEmailVerified: user.isEmailVerified
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Authenticate user & get tokens
 * @route   POST /api/auth/login
 * @access  Public
 */
export const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password.'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail }).select('+password');

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account has been deactivated. Please contact client support.'
      });
    }

    const token = generateToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    // Save refresh token session
    await RefreshToken.create({
      userId: user._id,
      token: refreshToken,
      deviceInfo: req.headers['user-agent'] || '',
      ipAddress: req.ip || '',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });

    return res.json({
      success: true,
      message: 'Login successful.',
      token,
      refreshToken,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isEmailVerified: user.isEmailVerified
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Refresh Access Token using valid Refresh Token
 * @route   POST /api/auth/refresh
 * @access  Public
 */
export const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: incomingToken } = req.body;

    if (!incomingToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required.'
      });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(incomingToken);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token.'
      });
    }

    // Check database record
    const storedToken = await RefreshToken.findOne({
      token: incomingToken,
      isRevoked: false
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token is revoked or expired.'
      });
    }

    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User no longer active or exists.'
      });
    }

    const newAccessToken = generateToken(user._id, user.role);

    return res.json({
      success: true,
      message: 'Access token renewed successfully.',
      token: newAccessToken
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Logout user & revoke refresh session
 * @route   POST /api/auth/logout
 * @access  Public / Protected
 */
export const logoutUser = async (req, res, next) => {
  try {
    const { refreshToken: incomingToken } = req.body;

    if (incomingToken) {
      await RefreshToken.updateOne(
        { token: incomingToken },
        { $set: { isRevoked: true } }
      );
    }

    if (req.user) {
      // Revoke latest token for current user
      await RefreshToken.updateMany(
        { userId: req.user._id, isRevoked: false },
        { $set: { isRevoked: true } }
      );
    }

    return res.json({
      success: true,
      message: 'Logged out successfully.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Verify email address using token
 * @route   GET /api/auth/verify-email
 * @access  Public
 */
export const verifyEmail = async (req, res, next) => {
  try {
    const token = req.query.token || req.body.token;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Verification token is required.'
      });
    }

    const tokenDoc = await VerificationToken.findOne({ token });

    if (!tokenDoc || tokenDoc.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token.'
      });
    }

    const user = await User.findById(tokenDoc.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found.'
      });
    }

    user.isEmailVerified = true;
    await user.save();

    await VerificationToken.deleteOne({ _id: tokenDoc._id });

    return res.json({
      success: true,
      message: 'Your email address has been verified successfully.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Resend email verification link
 * @route   POST /api/auth/resend-verification
 * @access  Public
 */
export const resendVerification = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required.'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email address.'
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Your email address is already verified.'
      });
    }

    // Delete existing verification tokens for this user
    await VerificationToken.deleteMany({ userId: user._id });

    // Create new token
    const rawVerificationToken = crypto.randomBytes(32).toString('hex');
    await VerificationToken.create({
      userId: user._id,
      token: rawVerificationToken,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    sendVerificationEmail(user.email, rawVerificationToken, `${user.firstName} ${user.lastName}`);

    return res.json({
      success: true,
      message: 'Verification email has been sent successfully.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Forgot password — Generate reset token & send email
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    // Always return generic response to prevent email enumeration
    const genericResponse = {
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent.'
    };

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required.'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.json(genericResponse);
    }

    // Delete any old unused reset tokens for this user
    await PasswordResetToken.deleteMany({ userId: user._id });

    // Create new password reset token
    const rawResetToken = crypto.randomBytes(32).toString('hex');
    await PasswordResetToken.create({
      userId: user._id,
      token: rawResetToken,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    });

    sendPasswordResetEmail(user.email, rawResetToken);

    return res.json(genericResponse);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reset password using reset token
 * @route   POST /api/auth/reset-password
 * @access  Public
 */
export const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Reset token and new password are required.'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.'
      });
    }

    const resetDoc = await PasswordResetToken.findOne({
      token,
      isUsed: false,
      expiresAt: { $gt: new Date() }
    });

    if (!resetDoc) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired password reset token.'
      });
    }

    const user = await User.findById(resetDoc.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Mark token as used
    resetDoc.isUsed = true;
    await resetDoc.save();

    // Revoke existing refresh sessions for security
    await RefreshToken.updateMany(
      { userId: user._id, isRevoked: false },
      { $set: { isRevoked: true } }
    );

    return res.json({
      success: true,
      message: 'Password reset successfully. You can now log in with your new password.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Change password for logged in user
 * @route   POST /api/auth/change-password
 * @access  Private
 */
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required.'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long.'
      });
    }

    const user = await User.findById(req.user._id).select('+password');

    if (!user || !(await user.matchPassword(currentPassword))) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect.'
      });
    }

    user.password = newPassword;
    await user.save();

    // Revoke existing refresh tokens
    await RefreshToken.updateMany(
      { userId: user._id, isRevoked: false },
      { $set: { isRevoked: true } }
    );

    return res.json({
      success: true,
      message: 'Password updated successfully.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get current user profile
 * @route   GET /api/auth/me
 * @access  Private
 */
export const getMe = async (req, res) => {
  const user = await User.findById(req.user._id);
  return res.json({
    success: true,
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt
    }
  });
};
