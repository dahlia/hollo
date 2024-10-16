import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import ffmpeg from "fluent-ffmpeg";
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

export async function makeVideoScreenshot(
  fileBuffer: ArrayBuffer,
): Promise<ArrayBuffer> {
  const tmpDir = await mkdtemp(join(tmpdir(), "hollo-"));
  const inFile = join(tmpDir, "video");
  await Bun.write(inFile, fileBuffer);
  await new Promise((resolve) =>
    ffmpeg(inFile)
      .on("end", resolve)
      .screenshots({
        timestamps: [0],
        filename: "screenshot.png",
        folder: tmpDir,
      }),
  );
  const screenshot = Bun.file(join(tmpDir, "screenshot.png"));
  return await screenshot.arrayBuffer();
}
