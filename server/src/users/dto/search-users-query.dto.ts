import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class SearchUsersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) =>
    value === undefined || value === '' ? 20 : Number(value),
  )
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
