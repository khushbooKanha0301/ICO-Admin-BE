import { IsOptional, IsString, IsNumber } from 'class-validator';
import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PermissionDto {
  @IsNumber()
  permission_id: number;

  @IsString()
  permission_name: string;
}

export class CreateAdminDto {
  @IsOptional()
  @IsString()
  fname: string;

  @IsOptional()
  @IsString()
  lname: string;

  @IsOptional()
  @IsString()
  username: string;

  @IsOptional()
  @IsString()
  password: string;

  @IsOptional()
  @IsString()
  otp: number;

  @IsOptional()
  @IsString()
  access: string;

  @IsOptional()
  @IsString()
  role_id: number;

  @IsOptional()
  @IsString()
  role_name: string;

  @IsOptional()
  @IsString()
  ipAddress: string;

  @IsOptional()
  @IsString()
  createdAt: string;

  @IsOptional()
  @IsString()
  updatedAt: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionDto)
  permissions: PermissionDto[];
}
