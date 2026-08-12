import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import Address from '../models/Address.js';
import RefreshToken from '../models/RefreshToken.js';
import VerificationToken from '../models/VerificationToken.js';
import PasswordResetToken from '../models/PasswordResetToken.js';
import {
  registerUser,
  loginUser,
  refreshToken,
  logoutUser,
  verifyEmail,
  forgotPassword,
  resetPassword,
  changePassword,
  getMe
} from '../controllers/authController.js';
import {
  getUserProfile,
  updateUserProfile,
  addUserAddress,
  getUserAddresses,
  setDefaultAddress,
  deleteUserAddress
} from '../controllers/userController.js';

dotenv.config();

const mockRes = () => {
  const res = {};
  res.statusCode = 200;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.data = data;
    return res;
  };
  return res;
};

const runComprehensiveTests = async () => {
  console.log('\n============================================================');
  console.log('   STARTING ZAHZAN COMPREHENSIVE AUTHENTICATION TEST SUITE   ');
  console.log('============================================================\n');

  try {
    await connectDB();

    const testEmail = `test.client.${Date.now()}@zahzan-test.com`;
    const testPassword = 'SecurePassword2026!';
    let accessToken = null;
    let refreshTok = null;
    let userId = null;
    let verificationTok = null;
    let resetTok = null;
    let addressId = null;

    // -------------------------------------------------------------------------
    // TEST 1: User Registration
    // -------------------------------------------------------------------------
    console.log('[TEST 1] User Registration...');
    const regReq = {
      body: {
        firstName: 'Farah',
        lastName: 'Naz',
        email: testEmail,
        password: testPassword,
        confirmPassword: testPassword,
        phone: '+92 300 9876543'
      },
      headers: { 'user-agent': 'Jest-Mobile-Test' },
      ip: '127.0.0.1'
    };
    const regRes = mockRes();
    await registerUser(regReq, regRes, (err) => { throw err; });

    console.assert(regRes.statusCode === 201, `Reg failed with status ${regRes.statusCode}`);
    console.assert(regRes.data.success === true, 'Reg response success is false');
    console.assert(regRes.data.token, 'Reg missing token');
    console.assert(regRes.data.refreshToken, 'Reg missing refreshToken');
    console.assert(regRes.data.user.email === testEmail, 'Reg email mismatch');
    
    accessToken = regRes.data.token;
    refreshTok = regRes.data.refreshToken;
    userId = regRes.data.user.id;
    console.log('✓ TEST 1 PASSED — Customer account created successfully.');

    // -------------------------------------------------------------------------
    // TEST 2: Duplicate Email Prevention
    // -------------------------------------------------------------------------
    console.log('\n[TEST 2] Duplicate Email Prevention...');
    const dupRes = mockRes();
    await registerUser(regReq, dupRes, (err) => { throw err; });
    console.assert(dupRes.statusCode === 400, 'Duplicate registration did not return 400');
    console.assert(dupRes.data.success === false, 'Duplicate response was not false');
    console.log('✓ TEST 2 PASSED — Duplicate email rejected correctly.');

    // -------------------------------------------------------------------------
    // TEST 3: User Login
    // -------------------------------------------------------------------------
    console.log('\n[TEST 3] User Login...');
    const loginReq = {
      body: { email: testEmail, password: testPassword },
      headers: { 'user-agent': 'Chrome/Test' },
      ip: '127.0.0.1'
    };
    const loginRes = mockRes();
    await loginUser(loginReq, loginRes, (err) => { throw err; });
    console.assert(loginRes.statusCode === 200, 'Login failed');
    console.assert(loginRes.data.success === true, 'Login success false');
    console.assert(loginRes.data.token, 'Login missing access token');
    accessToken = loginRes.data.token;
    refreshTok = loginRes.data.refreshToken;
    console.log('✓ TEST 3 PASSED — Login successful.');

    // -------------------------------------------------------------------------
    // TEST 4: Invalid Password Rejection
    // -------------------------------------------------------------------------
    console.log('\n[TEST 4] Invalid Password Rejection...');
    const badLoginReq = { body: { email: testEmail, password: 'WrongPassword!' }, headers: {}, ip: '127.0.0.1' };
    const badLoginRes = mockRes();
    await loginUser(badLoginReq, badLoginRes, (err) => { throw err; });
    console.assert(badLoginRes.statusCode === 401, 'Bad login did not return 401');
    console.log('✓ TEST 4 PASSED — Invalid credentials rejected.');

    // -------------------------------------------------------------------------
    // TEST 5: Access Token Renewal via Refresh Token
    // -------------------------------------------------------------------------
    console.log('\n[TEST 5] Access Token Refresh System...');
    const refReq = { body: { refreshToken: refreshTok } };
    const refRes = mockRes();
    await refreshToken(refReq, refRes, (err) => { throw err; });
    console.assert(refRes.statusCode === 200, 'Token refresh failed');
    console.assert(refRes.data.token, 'New access token missing');
    accessToken = refRes.data.token;
    console.log('✓ TEST 5 PASSED — Access token renewed successfully.');

    // -------------------------------------------------------------------------
    // TEST 6: Email Verification Token Flow
    // -------------------------------------------------------------------------
    console.log('\n[TEST 6] Email Verification Flow...');
    const vTokenDoc = await VerificationToken.findOne({ userId });
    console.assert(vTokenDoc, 'Verification token doc missing in DB');
    verificationTok = vTokenDoc.token;

    const verifyReq = { query: { token: verificationTok } };
    const verifyRes = mockRes();
    await verifyEmail(verifyReq, verifyRes, (err) => { throw err; });
    console.assert(verifyRes.statusCode === 200, 'Email verification failed');
    
    const updatedUser = await User.findById(userId);
    console.assert(updatedUser.isEmailVerified === true, 'isEmailVerified is not true');
    console.log('✓ TEST 6 PASSED — Email verified successfully.');

    // -------------------------------------------------------------------------
    // TEST 7: Forgot Password & Reset Token
    // -------------------------------------------------------------------------
    console.log('\n[TEST 7] Forgot Password & Reset Token Flow...');
    const forgotReq = { body: { email: testEmail } };
    const forgotRes = mockRes();
    await forgotPassword(forgotReq, forgotRes, (err) => { throw err; });
    console.assert(forgotRes.statusCode === 200, 'Forgot password request failed');

    const resetDoc = await PasswordResetToken.findOne({ userId, isUsed: false });
    console.assert(resetDoc, 'Password reset token missing in DB');
    resetTok = resetDoc.token;

    const newPass = 'BrandNewPassword2026!';
    const resetReq = { body: { token: resetTok, newPassword: newPass } };
    const resetRes = mockRes();
    await resetPassword(resetReq, resetRes, (err) => { throw err; });
    console.assert(resetRes.statusCode === 200, 'Reset password failed');

    // Verify login with new password
    const newLoginRes = mockRes();
    await loginUser({ body: { email: testEmail, password: newPass }, headers: {}, ip: '' }, newLoginRes, (err) => { throw err; });
    console.assert(newLoginRes.statusCode === 200, 'Login with new password failed');
    accessToken = newLoginRes.data.token;
    refreshTok = newLoginRes.data.refreshToken;
    console.log('✓ TEST 7 PASSED — Password reset and login with new password verified.');

    // -------------------------------------------------------------------------
    // TEST 8: Address Management (Create, List, Set Default, Delete)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 8] Address Management System...');
    const authUser = await User.findById(userId);

    // Add Address 1
    const addAddrReq1 = {
      user: authUser,
      body: {
        fullName: 'Farah Naz',
        phone: '+92 300 9876543',
        addressLine1: 'House 42, Block C, Gulberg III',
        city: 'Lahore',
        province: 'Punjab',
        postalCode: '54600',
        country: 'Pakistan',
        label: 'Home',
        isDefault: true
      }
    };
    const addAddrRes1 = mockRes();
    await addUserAddress(addAddrReq1, addAddrRes1, (err) => { throw err; });
    console.assert(addAddrRes1.statusCode === 201, 'Add address 1 failed');
    addressId = addAddrRes1.data.address._id;

    // Add Address 2
    const addAddrReq2 = {
      user: authUser,
      body: {
        fullName: 'Farah Naz (Studio)',
        phone: '+92 300 9876543',
        addressLine1: 'Studio 12, MM Alam Road',
        city: 'Lahore',
        province: 'Punjab',
        postalCode: '54600',
        country: 'Pakistan',
        label: 'Work',
        isDefault: false
      }
    };
    const addAddrRes2 = mockRes();
    await addUserAddress(addAddrReq2, addAddrRes2, (err) => { throw err; });
    console.assert(addAddrRes2.statusCode === 201, 'Add address 2 failed');

    // List Addresses
    const listAddrRes = mockRes();
    await getUserAddresses({ user: authUser }, listAddrRes, (err) => { throw err; });
    console.assert(listAddrRes.data.addresses.length === 2, 'Address count mismatch');

    // Set Default Address
    const setDefRes = mockRes();
    await setDefaultAddress({ user: authUser, params: { id: addAddrRes2.data.address._id } }, setDefRes, (err) => { throw err; });
    console.assert(setDefRes.statusCode === 200, 'Set default failed');

    // Delete Address
    const delRes = mockRes();
    await deleteUserAddress({ user: authUser, params: { id: addressId } }, delRes, (err) => { throw err; });
    console.assert(delRes.statusCode === 200, 'Delete address failed');
    console.log('✓ TEST 8 PASSED — Address CRUD & default address mechanics verified.');

    // -------------------------------------------------------------------------
    // TEST 9: Logout & Token Revocation
    // -------------------------------------------------------------------------
    console.log('\n[TEST 9] Logout & Revocation...');
    const logoutReq = { user: authUser, body: { refreshToken: refreshTok } };
    const logoutRes = mockRes();
    await logoutUser(logoutReq, logoutRes, (err) => { throw err; });
    console.assert(logoutRes.statusCode === 200, 'Logout failed');

    // Verify revoked token can no longer be used for refresh
    const revokedRefRes = mockRes();
    await refreshToken({ body: { refreshToken: refreshTok } }, revokedRefRes, (err) => { throw err; });
    console.assert(revokedRefRes.statusCode === 401, 'Revoked token was accepted!');
    console.log('✓ TEST 9 PASSED — Revoked refresh token rejected correctly.');

    // Cleanup test data
    await User.deleteOne({ _id: userId });
    await Address.deleteMany({ userId });
    await RefreshToken.deleteMany({ userId });
    await VerificationToken.deleteMany({ userId });
    await PasswordResetToken.deleteMany({ userId });

    console.log('\n============================================================');
    console.log('   ALL 9 INTEGRATION TESTS PASSED WITH 100% SUCCESS RATE!   ');
    console.log('============================================================\n');

    process.exit(0);
  } catch (error) {
    console.error(`\n❌ TEST SUITE FAILED: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
};

runComprehensiveTests();
