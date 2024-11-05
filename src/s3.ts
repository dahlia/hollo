import { fromEnv } from "@aws-sdk/credential-providers";
import { Disk } from "flydrive";
import { FSDriver } from "flydrive/drivers/fs";
import { S3Driver } from "flydrive/drivers/s3";
import type { DriverContract } from "flydrive/types";

// biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
export const assetPath = process.env["FS_ASSET_PATH"];

// biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
const region = process.env["S3_REGION"];

// biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
const bucket = process.env["S3_BUCKET"];

// biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
export const assetUrlBase = process.env["ASSET_URL_BASE"];
if (assetUrlBase == null) throw new Error("ASSET_URL_BASE is required");
export const S3_URL_BASE = assetUrlBase;

// biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
const endpointUrl = process.env["S3_ENDPOINT_URL"];

// biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
const accessKeyId = process.env["AWS_ACCESS_KEY_ID"];

// biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
const secretAccessKey = process.env["AWS_SECRET_ACCESS_KEY"];

// biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
if (process.env["DRIVE_DISK"] == null) {
  getLogger(["hollo", "assets"]).warn(
    "DRIVE_DISK is not configured; defaults to 's3'.  " +
    "The DRIVE_DISK environment variable will be mandatory in the future versions."
  );
}
// biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
export const driveDisk = process.env["DRIVE_DISK"] ?? "s3";
if (driveDisk == null) throw new Error("DRIVE_DISK is required");
export const DRIVE_DISK = driveDisk;

let driver: DriverContract;
switch (DRIVE_DISK) {
  case "fs":
    if (assetPath == null) throw new Error("FS_ASSET_PATH is required");

    driver = new FSDriver({
      location: new URL(assetPath, import.meta.url),
      visibility: "public",
    });
    break;
  case "s3":
    if (bucket == null) throw new Error("S3_BUCKET is required");
    if (accessKeyId == null) throw new Error("AWS_ACCESS_KEY_ID is required");
    if (secretAccessKey == null)
      throw new Error("AWS_SECRET_ACCESS_KEY is required");

    driver = new S3Driver({
      credentials: fromEnv(),
      region: region == null || region === "" ? "auto" : region,
      endpoint: endpointUrl,
      bucket: bucket,
      // biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
      forcePathStyle: process.env["S3_FORCE_PATH_STYLE"] === "true",
      visibility: "public",
    });
    break;
  default:
    throw new Error(`Unknown DRIVE_DISK value: '${DRIVE_DISK}'`);
}

export const disk = new Disk(driver);
