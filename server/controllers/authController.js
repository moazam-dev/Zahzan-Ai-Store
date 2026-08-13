import crypto from 'crypto';
import User from '../models/User.js';
import RefreshToken from '../models/RefreshToken.js';
import PasswordResetToken from '../models/PasswordResetToken.js';
import { generateToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { sendPasswordResetEmail } from '../services/emailService.js';

/**
 * @desc    Register a new customer account (Immediate Access — No Mandatory Email Verification)
 * @route   POST /api/auth/register
 * @access  Public
 */
export const registerUser = async (req, res, next) => {
  try {
    const { firstName, lastName, name, email, password, confirmPassword, phone } = req.body;

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

    // Create User with isEmailVerified: true (IMMEDIATE ACCESS)
    const user = await User.create({
      firstName: fName.trim(),
      lastName: lName.trim(),
      email: normalizedEmail,
      password,
      phone: phone ? phone.trim() : '',
      authProvider: 'local',
      role: 'customer',
      isEmailVerified: true,
      isActive: true
    });

    // Create JWT Tokens & Session for immediate login
    const token = generateToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    await RefreshToken.create({
      userId: user._id,
      token: refreshToken,
      deviceInfo: req.headers['user-agent'] || '',
      ipAddress: req.ip || '',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });

    return res.status(201).json({
      success: true,
      message: 'Account created successfully. Welcome to ZAHZAN!',
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
        authProvider: user.authProvider,
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
        authProvider: user.authProvider || 'local',
        isEmailVerified: user.isEmailVerified
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Google Social Login
 * @route   POST /api/auth/google
 * @access  Public
 */
export const googleAuth = async (req, res, next) => {
  try {
    const { googleId, email, name, firstName, lastName, picture } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required for Google authentication.'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    let user = await User.findOne({
      $or: [{ googleId: googleId || 'nonexistent' }, { email: normalizedEmail }]
    });

    if (user) {
      // Safely link Google ID to existing account if not set
      if (!user.googleId && googleId) {
        user.googleId = googleId;
        if (user.authProvider === 'local') {
          user.authProvider = 'google';
        }
        await user.save();
      }
    } else {
      // Create new user for Google social login
      let fName = firstName;
      let lName = lastName;
      if (!fName && name) {
        const parts = name.trim().split(' ');
        fName = parts[0];
        lName = parts.slice(1).join(' ') || parts[0];
      }

      user = await User.create({
        firstName: (fName || 'Valued').trim(),
        lastName: (lName || 'Client').trim(),
        email: normalizedEmail,
        authProvider: 'google',
        googleId: googleId || `google_${Date.now()}`,
        isEmailVerified: true,
        isActive: true
      });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated.' });
    }

    const token = generateToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    await RefreshToken.create({
      userId: user._id,
      token: refreshToken,
      deviceInfo: req.headers['user-agent'] || '',
      ipAddress: req.ip || '',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });

    return res.status(200).json({
      success: true,
      message: 'Google authentication successful.',
      token,
      refreshToken,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        phone: user.phone || '',
        role: user.role,
        authProvider: user.authProvider,
        isEmailVerified: true
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Facebook Social Login
 * @route   POST /api/auth/facebook
 * @access  Public
 */
export const facebookAuth = async (req, res, next) => {
  try {
    const { facebookId, email, name, firstName, lastName } = req.body;

    const targetEmail = email
      ? email.toLowerCase().trim()
      : `facebook_${facebookId || Date.now()}@zahzan.com`;

    let user = await User.findOne({
      $or: [{ facebookId: facebookId || 'nonexistent' }, { email: targetEmail }]
    });

    if (user) {
      if (!user.facebookId && facebookId) {
        user.facebookId = facebookId;
        await user.save();
      }
    } else {
      let fName = firstName;
      let lName = lastName;
      if (!fName && name) {
        const parts = name.trim().split(' ');
        fName = parts[0];
        lName = parts.slice(1).join(' ') || parts[0];
      }

      user = await User.create({
        firstName: (fName || 'Valued').trim(),
        lastName: (lName || 'Client').trim(),
        email: targetEmail,
        authProvider: 'facebook',
        facebookId: facebookId || `fb_${Date.now()}`,
        isEmailVerified: true,
        isActive: true
      });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated.' });
    }

    const token = generateToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    await RefreshToken.create({
      userId: user._id,
      token: refreshToken,
      deviceInfo: req.headers['user-agent'] || '',
      ipAddress: req.ip || '',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });

    return res.status(200).json({
      success: true,
      message: 'Facebook authentication successful.',
      token,
      refreshToken,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        phone: user.phone || '',
        role: user.role,
        authProvider: user.authProvider,
        isEmailVerified: true
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
 * @desc    Forgot password — Generate reset token & send email
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

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

    await PasswordResetToken.deleteMany({ userId: user._id });

    const rawResetToken = crypto.randomBytes(32).toString('hex');
    await PasswordResetToken.create({
      userId: user._id,
      token: rawResetToken,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });

    // Send email asynchronously
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

    user.password = newPassword;
    await user.save();

    resetDoc.isUsed = true;
    await resetDoc.save();

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
      authProvider: user.authProvider || 'local',
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt
    }
  });
};
