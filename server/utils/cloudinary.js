import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';

/**
 * Dynamically configures Cloudinary from process.env at runtime
 */
const getCloudinaryConfig = () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const cloudinaryUrl = process.env.CLOUDINARY_URL;

  if (cloudinaryUrl) {
    cloudinary.config({ cloudinary_url: cloudinaryUrl });
    return true;
  } else if (cloudName && apiKey && apiSecret) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true
    });
    return true;
  }
  return false;
};

/**
 * Uploads a payment proof file (image or PDF) to Cloudinary in folder `zahzan/payment-proofs`
 * cleans up temporary local file, and returns { secure_url, public_id }.
 */
export const uploadPaymentProofToCloudinary = async (filePath, orderId = 'general') => {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error('Local file not found for upload.');
    }

    const isCloudinaryConfigured = getCloudinaryConfig();

    if (isCloudinaryConfigured) {
      const publicId = `payment_${orderId}_${Date.now()}`;
      
      const result = await cloudinary.uploader.upload(filePath, {
        folder: 'zahzan/payment-proofs',
        public_id: publicId,
        resource_type: 'auto'
      });

      // Cleanup local file after successful upload to Cloudinary
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (unlinkErr) {
        console.warn('Warning: Could not delete temporary local upload file:', unlinkErr.message);
      }

      console.log(`[Cloudinary Success] Payment proof uploaded to Cloudinary: ${result.secure_url}`);

      return {
        secure_url: result.secure_url,
        public_id: result.public_id
      };
    } else {
      // Fallback mode if Cloudinary credentials are not configured in .env
      console.warn('Cloudinary credentials not set in .env. Serving local file upload.');
      const fileName = path.basename(filePath);
      const targetDir = path.join(process.cwd(), 'uploads/payments');
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      const targetPath = path.join(targetDir, fileName);

      if (path.resolve(filePath) !== path.resolve(targetPath)) {
        fs.copyFileSync(filePath, targetPath);
        try { fs.unlinkSync(filePath); } catch (e) {}
      }

      const relativeUrl = `/uploads/payments/${fileName}`;
      return {
        secure_url: relativeUrl,
        public_id: `local_${Date.now()}`
      };
    }
  } catch (error) {
    console.error('Cloudinary Upload Error:', error);
    throw new Error(`Failed to upload payment proof to Cloudinary: ${error.message}`);
  }
};

/**
 * Deletes an asset from Cloudinary if database operation fails or payment record is deleted
 */
export const deletePaymentProofFromCloudinary = async (publicId) => {
  try {
    if (!publicId || publicId.startsWith('local_')) return;
    const isCloudinaryConfigured = getCloudinaryConfig();
    if (isCloudinaryConfigured) {
      await cloudinary.uploader.destroy(publicId);
    }
  } catch (error) {
    console.warn('Warning: Failed to delete Cloudinary asset:', error.message);
  }
};

export default cloudinary;
