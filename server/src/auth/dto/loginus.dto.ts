import { IsNotEmpty, IsString } from 'class-validator';

export class LoginusDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  redirect_uri!: string;
}
