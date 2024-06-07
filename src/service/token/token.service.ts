import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from "mongoose";
import { IToken } from 'src/interface/tokens.interface';
import { CreateTokenDto } from 'src/dto/create-token.dto';

@Injectable()
export class TokenService {
	constructor(
		@InjectModel('token') private tokenModel: Model<IToken>
	) { }

	async createToken(CreateTokenDtoValues: CreateTokenDto): Promise<IToken> {
		const newToken = await new this.tokenModel(CreateTokenDtoValues);
		return newToken.save();
	}

	async getToken(token: string, roleId : number): Promise<any> {
		const existingToken = await this.tokenModel.findOne({token: token, roleId: roleId}).exec();
		if (!existingToken) {
			return false;
		}
		return true;
	}
	
	async deleteToken(token: string) {
		const deletedToken = await this.tokenModel.deleteOne({ token: token });
		if (!deletedToken) {
			return false;
		}
		return true;
	}	
}