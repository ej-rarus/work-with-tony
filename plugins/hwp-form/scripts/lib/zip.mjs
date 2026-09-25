import { deflateRawSync, inflateRawSync } from "node:zlib";

// Minimal ZIP reader/writer for HWPX packages (no zip64, no encryption).
// HWPX requires `mimetype` to be the first entry and stored uncompressed, so
// entries keep their order and their stored/deflated method on write.

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;
const FLAG_ENCRYPTED = 0x0001;
const FLAG_UTF8 = 0x0800;
const DOS_DATE_1980_01_01 = 0x0021;
const MAX_COMMENT = 0xffff;

export class ZipError extends Error {
  constructor(message) {
    super(message);
    this.name = "ZipError";
    this.code = "BAD_ZIP";
    this.hint = "The file is not a valid HWPX package. Save it again from Hancom Office as HWPX.";
  }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function findEnd(buf) {
  const floor = Math.max(0, buf.length - 22 - MAX_COMMENT);
  for (let i = buf.length - 22; i >= floor; i -= 1) {
    if (buf.readUInt32LE(i) === SIG_END) return i;
  }
  throw new ZipError("Not a zip archive (end of central directory not found).");
}

function readEntry(buf, p) {
  if (buf.readUInt32LE(p) !== SIG_CENTRAL) throw new ZipError("Corrupt zip central directory.");
  const flags = buf.readUInt16LE(p + 8);
  const method = buf.readUInt16LE(p + 10);
  const crc = buf.readUInt32LE(p + 16);
  const compSize = buf.readUInt32LE(p + 20);
  const size = buf.readUInt32LE(p + 24);
  const nameLen = buf.readUInt16LE(p + 28);
  const extraLen = buf.readUInt16LE(p + 30);
  const commentLen = buf.readUInt16LE(p + 32);
  const localOffset = buf.readUInt32LE(p + 42);
  const rawName = Buffer.from(buf.subarray(p + 46, p + 46 + nameLen));
  const name = rawName.toString("utf8");
  if (flags & FLAG_ENCRYPTED) throw new ZipError(`${name} is encrypted.`);
  if (buf.readUInt32LE(localOffset) !== SIG_LOCAL) throw new ZipError(`Corrupt local header for ${name}.`);
  const dataStart = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
  const raw = buf.subarray(dataStart, dataStart + compSize);
  if (method !== METHOD_STORED && method !== METHOD_DEFLATE) throw new ZipError(`Unsupported compression for ${name}.`);
  const data = method === METHOD_STORED ? Buffer.from(raw) : inflateRawSync(raw);
  if (data.length !== size || crc32(data) !== crc) throw new ZipError(`${name} is corrupted (size or CRC mismatch).`);
  // Keep the name's original bytes and UTF-8 flag so a non-UTF-8 name is written back unchanged.
  const entry = { name, rawName, utf8: Boolean(flags & FLAG_UTF8), data, stored: method === METHOD_STORED };
  return { entry, next: p + 46 + nameLen + extraLen + commentLen };
}

export function readZip(buf) {
  if (buf.length < 22) throw new ZipError("File is too small to be a zip archive.");
  const end = findEnd(buf);
  const count = buf.readUInt16LE(end + 10);
  const entries = [];
  let p = buf.readUInt32LE(end + 16);
  for (let i = 0; i < count; i += 1) {
    const { entry, next } = readEntry(buf, p);
    entries.push(entry);
    p = next;
  }
  return entries;
}

function header(size) {
  return Buffer.alloc(size);
}

export function writeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, rawName, utf8, data, stored } of entries) {
    const nameBuf = rawName ?? Buffer.from(name, "utf8");
    const body = stored ? data : deflateRawSync(data);
    const isUtf8 = utf8 ?? !/^[\x20-\x7e]*$/.test(name);
    const flags = isUtf8 ? FLAG_UTF8 : 0;
    const method = stored ? METHOD_STORED : METHOD_DEFLATE;
    const crc = crc32(data);

    const local = header(30);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(DOS_DATE_1980_01_01, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, body);

    const central = header(46);
    central.writeUInt32LE(SIG_CENTRAL, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(DOS_DATE_1980_01_01, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += 30 + nameBuf.length + body.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = header(22);
  end.writeUInt32LE(SIG_END, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}
