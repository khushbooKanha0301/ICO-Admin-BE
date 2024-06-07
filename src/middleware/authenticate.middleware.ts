import { NestMiddleware, Injectable, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { TokenService } from "src/service/token/token.service";
const jwtSecret = 'eplba'
const jwt = require('jsonwebtoken');

@Injectable()
export class AuthenticateMiddleware implements NestMiddleware {
	constructor(
		private readonly tokenService: TokenService
	){}

	async use(req: Request, res: Response, next: NextFunction) {
		try {
			const authHeader = req.headers['authorization']
            const roleId = req.headers['roleid'];
           
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
			jwt.verify(token, jwtSecret, (err, authData) => {
				if (err) {
					console.log(err);
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