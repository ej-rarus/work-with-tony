import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_LIMIT = 128 * 1024;
const ASSET_LIMIT = 15 * 1024 * 1024;

export class InputError extends Error {
  constructor(message, code = "INVALID_INPUT") {
    super(message);
    this.name = "InputError";
    this.code = code;
  }
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readRegularFile(filePath, byteLimit, label, limitLabel = `${byteLimit} bytes`) {
  if (typeof filePath !== "string" || filePath.length === 0) {
    throw new InputError(`${label} path must be a non-empty string.`);
  }

  let stat;
  try {
    stat = await lstat(filePath);
  } catch (error) {
    throw new InputError(`${label} file could not be read: ${filePath}`, "FILE_NOT_FOUND");
  }
  if (stat.isSymbolicLink()) {
    throw new InputError(`${label} file cannot be a final-component symlink.`);
  }
  if (!stat.isFile()) {
    throw new InputError(`${label} path must point to a regular file.`);
  }
  if (stat.size > byteLimit) {
    throw new InputError(`${label} file exceeds ${limitLabel}.`);
  }

  const bytes = await readFile(filePath);
  if (bytes.length > byteLimit) {
    throw new InputError(`${label} file exceeds ${limitLabel}.`);
  }
  return bytes;
}

function decodeUtf8(bytes, label) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new InputError(`${label} must be valid UTF-8.`);
  }
}

export async function inspectSource(filePath) {
  const extension = path.extname(filePath);
  if (!new Set([".md", ".txt"]).has(extension)) {
    throw new InputError("Source must use a lowercase .md or .txt extension.");
  }
  const bytes = await readRegularFile(filePath, SOURCE_LIMIT, "Source");
  return {
    name: path.basename(filePath),
    bytes: bytes.length,
    sha256: digest(bytes),
    text: decodeUtf8(bytes, "Source")
  };
}

export async function readJsonFile(filePath, byteLimit = 256 * 1024) {
  if (path.extname(filePath) !== ".json") throw new InputError("JSON input must use a lowercase .json extension.");
  const bytes = await readRegularFile(filePath, byteLimit, "JSON");
  const text = decodeUtf8(bytes, "JSON");
  try {
    return JSON.parse(text);
  } catch {
    throw new InputError("JSON input is not valid JSON.", "INVALID_JSON");
  }
}

function imageType(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return null;
}

const EXTENSIONS = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"]
]);

export async function readAsset(asset) {
  if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
    throw new InputError("Asset must be an object.");
  }
  const extension = path.extname(asset.path || "").toLowerCase();
  const expectedType = EXTENSIONS.get(extension);
  if (!expectedType) {
    throw new InputError("Asset must be a PNG, JPEG, or WebP file.");
  }
  const bytes = await readRegularFile(asset.path, ASSET_LIMIT, "Asset", "15 MiB");
  const detectedType = imageType(bytes);
  if (detectedType !== expectedType) {
    throw new InputError(`Asset signature does not match its ${extension} extension.`);
  }
  return {
    id: asset.id,
    sourcePath: path.resolve(asset.path),
    originalName: path.basename(asset.path),
    mediaType: detectedType,
    sha256: digest(bytes),
    alt: asset.alt,
    fit: asset.fit ?? "cover",
    position: asset.position ?? "center",
    bytes
  };
}

export const inputLimits = Object.freeze({ sourceBytes: SOURCE_LIMIT, assetBytes: ASSET_LIMIT });
