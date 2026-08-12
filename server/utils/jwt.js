import jwt from 'jsonwebtoken';

/**
 * Generate short-lived Access Token
 */
export const generateToken = (userId, role = 'customer') => {
  return jwt.sign(
    { id: userId, role },
    process.env.JWT_SECRET || 'zahzan_jwt_secret_dev_key_2026_secure',
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );
};

/**
 * Generate long-lived Refresh Token
 */
export const generateRefreshToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_REFRESH_SECRET || 'zahzan_jwt_refresh_secret_dev_key_2026_secure',
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );
};

/**
 * Verify Access Token
 */
export const verifyToken = (token) => {
  return jwt.verify(
    token,
    process.env.JWT_SECRET || 'zahzan_jwt_secret_dev_key_2026_secure'
  );
};

/**
 * Verify Refresh Token
 */
export const verifyRefreshToken = (token) => {
  return jwt.verify(
    token,
    process.env.JWT_REFRESH_SECRET || 'zahzan_jwt_refresh_secret_dev_key_2026_secure'
  );
};
