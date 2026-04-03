import path from 'path';
import type { Request } from 'express';
import type { FileFilterCallback } from 'multer';
import { db } from '../db/database';

export const DEFAULT_ALLOWED_EXTENSIONS = 'jpg,jpeg,png,gif,webp,heic,pdf,doc,docx,xls,xlsx,txt,csv';

const BLOCKED_EXTENSIONS = new Set([
  '.svg',
  '.svgz',
  '.html',
  '.htm',
  '.xhtml',
  '.xml',
  '.mhtml',
  '.js',
  '.mjs',
  '.cjs',
  '.css',
  '.php',
  '.sh',
  '.bat',
  '.cmd',
  '.exe',
  '.msi',
  '.dll',
  '.com',
  '.vbs',
  '.ps1',
]);

const BLOCKED_MIME_PATTERNS = [
  /^image\/svg\+xml$/i,
  /^text\/html$/i,
  /^application\/xhtml\+xml$/i,
  /^application\/xml$/i,
  /^text\/xml$/i,
  /^text\/javascript$/i,
  /^application\/javascript$/i,
  /^application\/x-javascript$/i,
];

function getAllowedExtensions(): string {
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'allowed_file_types'").get() as { value: string } | undefined;
    return row?.value || DEFAULT_ALLOWED_EXTENSIONS;
  } catch {
    return DEFAULT_ALLOWED_EXTENSIONS;
  }
}

export function validateUploadedFile(file: { originalname?: string | null; mimetype?: string | null }): boolean {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = String(file.mimetype || '');

  if (BLOCKED_EXTENSIONS.has(ext)) return false;
  if (BLOCKED_MIME_PATTERNS.some((pattern) => pattern.test(mime))) return false;

  const allowed = getAllowedExtensions()
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const fileExt = ext.replace(/^\./, '');

  if (allowed.includes('*')) return true;
  return !!fileExt && allowed.includes(fileExt);
}

export function uploadedFileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  if (!validateUploadedFile(file)) {
    cb(new Error('File type not allowed'));
    return;
  }
  cb(null, true);
}
