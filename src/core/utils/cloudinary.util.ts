import configs from '../../configs';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: configs.cloudinary.cloudName,
  api_key: configs.cloudinary.apiKey,
  api_secret: configs.cloudinary.apiSecret,
  // secure: true,
});

interface UploadResult {
  public_id: string;
  secure_url: string;
  url: string;
  resource_type: string;
}

/**
 * Uploads an image or file to Cloudinary.
 * @param filePath Local path or remote URL.
 * @param folder Optional folder in Cloudinary.
 * @param options Additional Cloudinary options.
 */
export async function uploadToCloudinaryAsync(
  filePath: string,
  folder?: string,
  options: object = {}
): Promise<UploadResult> {
  const uploadOptions = {
    folder,
    ...options,
  };

  return await cloudinary.uploader.upload(filePath, uploadOptions);
}

/**
 * Deletes a resource (image or video) from Cloudinary.
 * @param publicId The public ID of the resource.
 * @param resourceType image, video, or raw.
 */
export async function deleteFromCloudinaryAsync(
  publicId: string,
  resourceType: 'image' | 'video' | 'raw' = 'image'
): Promise<any> {
  return await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}

/**
 * Generates a secure URL with transformation (e.g., resizing, cropping).
 * @param publicId The public ID of the asset.
 * @param options Cloudinary transformation options.
 */
export function getCloudinaryUrl(
  publicId: string,
  options: Object = {}
): string {
  return cloudinary.url(publicId, options);
}

/**
 * Upload base64 image to Cloudinary.
 * @param base64Data Base64 string, e.g., "data:image/png;base64,..."
 * @param folder Optional folder name.
 */
export async function uploadBase64ToCloudinaryAsync(
  base64Data: string,
  folder?: string
): Promise<UploadResult> {
  return await cloudinary.uploader.upload(base64Data, {
    folder,
  });
}

/**
 * Rename an existing Cloudinary resource.
 * @param fromPublicId The current public ID.
 * @param toPublicId The new public ID.
 */
export async function renameCloudinaryAssetAsync(
  fromPublicId: string,
  toPublicId: string
): Promise<any> {
  return await cloudinary.uploader.rename(fromPublicId, toPublicId);
}
