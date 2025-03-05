import { NestMiddleware, Injectable, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { TokenService } from "src/service/token/token.service";
import { IAdmin } from "src/interface/admins.interface";
import { Model } from "mongoose";
import { InjectModel } from "@nestjs/mongoose";
const jwtSecret = 'eplba'
const jwt = require('jsonwebtoken');

@Injectable()
export class AuthenticateMiddleware implements NestMiddleware {
	constructor(
		private readonly tokenService: TokenService,
		@InjectModel("admin") private adminModel: Model<IAdmin>,
	){}

	async use(req: Request, res: Response, next: NextFunction) {
		try {
			const authHeader = req.headers['authorization']
            const roleId = req.headers['roleid'];
			const userId = req.headers['userid'];
			const ipAddress = req.headers['ipaddress'];

			if (!ipAddress && Number(roleId) !== 3) {
				throw new HttpException('Access denied: Unauthorized role and IP address combination.', HttpStatus.UNAUTHORIZED);
			}

			if (!authHeader || !roleId) {
				throw new HttpException('Authorization Token or Role ID not found', HttpStatus.UNAUTHORIZED);
			}

			const token = authHeader && authHeader.split(' ')[1]
			if (token == null) {
				throw new HttpException('Authorization Token not found', HttpStatus.UNAUTHORIZED);
			}
			
			const isExistingToken = await this.tokenService.getToken(token, Number(roleId));
			if (!isExistingToken && req.method !== "POST" && req.originalUrl !== "/login") {
				return res.status(HttpStatus.UNAUTHORIZED).json({ message: "Authorization Token not valid."});
			}
            if(Number(roleId)===3){
			    const adminData = await this.adminModel.findOne({
					_id: userId, role_id: roleId, ipAddress: ipAddress
				});
				if (!adminData && req.method !== "POST" && req.originalUrl !== "/login") {
					return res.status(HttpStatus.UNAUTHORIZED).json({ message: "Authorization Token not valid."});
				}
			}
			

			jwt.verify(token, jwtSecret, (err, authData) => {
				if (err) {
					return res.status(HttpStatus.UNAUTHORIZED).json({ message: "Authorization Token not valid."});
				}
				req.headers.address = authData.userId
				req.headers.authData = authData
				req.body.authData=authData
				if (next) {
					next();
				}
			})
		} catch (error) {
			let errorMgs='Internal server error'
			if(error=='NotProvideToken'){
				errorMgs='Authorization Token not found'
			}
			throw new HttpException(errorMgs, error);
		}
	}
}