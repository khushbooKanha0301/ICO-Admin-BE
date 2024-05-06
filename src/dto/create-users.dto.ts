import { IsOptional, IsString } from "class-validator";
export class CreateUserDto {
  @IsOptional()
  @IsString()
  fname: string;

  @IsOptional()
  @IsString()
  lname: string;

  @IsOptional()
  @IsString()
  dob: string;

  @IsOptional()
  @IsString()
  fullname: string;

  @IsOptional()
  @IsString()
  phone: string;

  @IsOptional()
  @IsString()
  phoneCountry: string;

  @IsOptional()
  @IsString()
  currentpre: string;

  @IsOptional()
  @IsString()
  city: string;

  @IsOptional()
  @IsString()
  location: string;

  @IsOptional()
  @IsString()
  wallet_address: string;

  @IsOptional()
  @IsString()
  wallet_type: string;

  @IsOptional()
  @IsString()
  email: string;

  @IsOptional()
  @IsString()
  nonce: string;

  @IsOptional()
  @IsString()
  createdAt: string;

  @IsOptional()
  @IsString()
  updatedAt: string;

  @IsOptional()
  @IsString()
  bio: string;

  @IsOptional()
  profile: Express.Multer.File;

  @IsOptional()
  is_2FA_login_verified: boolean;

  @IsOptional()
  is_2FA_enabled: boolean;
}
