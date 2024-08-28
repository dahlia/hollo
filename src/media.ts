import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { Sharp } from "sharp";
import { S3_BUCKET, S3_URL_BASE, s3 } from "./s3";

const DEFAULT_THUMBNAIL_AREA = 230_400;

export interface Thumbnail {
  thumbnailUrl: string;
  thumbnailType: string;
  thumbnailWidth: number;
  thumbnailHeight: number;
}

export async function uploadThumbnail(
  id: string,
  original: Sharp,
  thumbnailArea = DEFAULT_THUMBNAIL_AREA,
): Promise<Thumbnail> {
  const originalMetadata = await original.metadata();
  const thumbnailSize = calculateThumbnailSize(
    originalMetadata.width!,
    originalMetadata.height!,
    thumbnailArea,
  );
  const thumbnail = await original.resize(thumbnailSize).webp().toBuffer();
  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: `media/${id}/thumbnail`,
      Body: thumbnail.subarray(),
      ContentType: "image/webp",
      ACL: "public-read",
    }),
  );
  return {
    thumbnailUrl: new URL(`media/${id}/thumbnail`, S3_URL_BASE).href,
    thumbnailType: "image/webp",
    thumbnailWidth: thumbnailSize.width,
    thumbnailHeight: thumbnailSize.height,
  };
}

export function calculateThumbnailSize(
  width: number,
  height: number,
  maxArea: number,
): { width: number; height: number } {
  const ratio = width / height;
  if (width * height <= maxArea) return { width, height };
  const newHeight = Math.sqrt(maxArea / ratio);
  const newWidth = ratio * newHeight;
  return { width: Math.round(newWidth), height: Math.round(newHeight) };
}
