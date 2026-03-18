import {
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @ValidateIf((_, v) => v != null && v !== '')
  @Matches(/^[a-zA-Z0-9_]{5,32}$/, {
    message: 'handle must be 5-32 chars, only letters, digits, underscore',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  handle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => value?.trim())
  display_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @ValidateIf((_, v) => v !== undefined && v !== null && v !== '')
  @Matches(/^(https:\/\/|http:\/\/|\/uploads\/)/, {
    message: 'avatar_url must be a valid https, http, or /uploads/ URL',
  })
  avatar_url?: string;
}
