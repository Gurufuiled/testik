import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { MAX_FILE_SIZE } from './upload.constants';

const UPLOAD_DIR = 'uploads';
const ALLOWED_MIME_REGEX = /^(image\/(?!svg)|audio\/|video\/|application\/pdf)/;

@Injectable()
export class UploadService {
  private readonly uploadPath: string;

  constructor() {
    this.uploadPath = join(process.cwd(), UPLOAD_DIR);
    if (!existsSync(this.uploadPath)) {
      mkdirSync(this.uploadPath, { recursive: true });
    }
  }

  async saveFile(file: { originalname: string; mimetype: string; size: number; path?: string; buffer?: Buffer }): Promise<{ url: string }> {
    if (!file || !file.originalname) {
      throw new BadRequestException('No file provided');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
      );
    }
    if (file.mimetype === 'image/svg+xml') {
      throw new BadRequestException('SVG uploads are not allowed');
    }
    if (!ALLOWED_MIME_REGEX.test(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Allowed: images, audio, video, PDF',
      );
    }

    const extMatch = file.originalname.match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch ? '.' + extMatch[1].toLowerCase() : '';
    const filename = `${randomUUID()}${ext}`;
    const filepath = join(this.uploadPath, filename);

    const fs = await import('fs/promises');
    const buf = file.buffer;
    if (!buf) throw new BadRequestException('File buffer is empty');
    try {
      await fs.writeFile(filepath, buf);
    } catch {
      throw new InternalServerErrorException('Failed to save file');
    }

    return { url: `/uploads/${filename}` };
  }
}
