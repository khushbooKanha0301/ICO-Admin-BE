import { IsOptional, IsNumber, IsString, MaxLength } from "class-validator";
export class UpdateUserProfileDto {
    @IsOptional()
	@IsString()
	fname_alias: string;
	
	@IsOptional()
	@IsString()
	lname_alias: string;

    @IsOptional()
    @IsString()
    updatedAt: string;

	@IsOptional()
	@IsString()
	bio: string;

	@IsOptional()
	profile: Express.Multer.File;
	
	@IsOptional()
	@IsString()
	nonce: string;
}