import {
  PipeTransform,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';

/** Parses string to integer and enforces min/max bounds. */
export class LimitPipe implements PipeTransform<string, number> {
  constructor(
    private readonly min: number,
    private readonly max: number,
    private readonly defaultValue?: number,
  ) {}

  transform(value: string | undefined, metadata: ArgumentMetadata): number {
    void metadata; // required by PipeTransform interface
    const raw = value ?? String(this.defaultValue ?? this.min);
    const num = parseInt(raw, 10);

    if (isNaN(num)) {
      throw new BadRequestException('limit must be a valid integer');
    }
    if (num < this.min) {
      throw new BadRequestException(`limit must be >= ${this.min}`);
    }
    if (num > this.max) {
      throw new BadRequestException(`limit must be <= ${this.max}`);
    }
    return num;
  }
}
