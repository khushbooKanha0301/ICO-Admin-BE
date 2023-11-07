import { HttpStatus, Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response } from 'express';

@Injectable()
export class CustomThrottleMiddleware implements NestMiddleware {
    async use(req: Request, res: Response, next: () => void) {
        const userId = req.headers?.address?.toString();
        const now = Date.now();
        const requestCount = req.app.locals.throttleCounter || {};
        if(!requestCount[userId])
        {
            requestCount[userId] = {};
        }
        if(!requestCount[userId][req.originalUrl])
        {
            requestCount[userId][req.originalUrl] = {};
        }
        
        if(requestCount[userId][req.originalUrl]?.time)
        {
            let futureTime = requestCount[userId][req.originalUrl]["time"];
            futureTime = parseInt(futureTime);
            if(now <= futureTime)
            {
                return res
                    .status(HttpStatus.TOO_MANY_REQUESTS)
                    .json({statusCode:HttpStatus.TOO_MANY_REQUESTS,message:"Too Many Requests. Please Try after sometimes"});
            }else{
                delete requestCount[userId][req.originalUrl];
                req.app.locals.throttleCounter = requestCount;
            }
        }
        next(); 
    }
}