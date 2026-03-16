import { IsOptional, IsString } from 'class-validator';

export class LogoutDto {
  /** Loginus id_token for SLO (Single Logout). Optional. */
  @IsOptional()
  @IsString()
  id_token?: string;
}
