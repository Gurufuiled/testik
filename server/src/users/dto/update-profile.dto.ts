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
