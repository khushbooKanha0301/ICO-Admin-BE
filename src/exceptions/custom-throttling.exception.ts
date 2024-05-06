import { Catch, ArgumentsHost, HttpStatus } from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";

//Checked throttle functionality for whole controller so user can not spam
@Catch(ThrottlerException)
export class CustomThrottlingExceptionFilter {
  catch(exception: ThrottlerException, host: ArgumentsHost) {

    // Retrieve the request object from the host
    const req = host.switchToHttp().getRequest();
    // Extract user ID from request headers
    const userId = req.headers?.address?.toString();
    // Define the window of time in seconds for throttling
    const windowSeconds = 55;
    // Get the current timestamp
    const now = Date.now();
    // Retrieve the request count object from app locals or initialize it if not present
    const requestCount = req.app.locals.throttleCounter || {};
    // Initialize request count for the current user if not present
    if(!requestCount[userId])
    {
        requestCount[userId] = {};
    }
    if(!requestCount[userId][req.originalUrl])
    {
        requestCount[userId][req.originalUrl] = {};
    }
     // Set the expiration time for the current request in the request count object
     requestCount[userId][req.originalUrl]["time"] = now + windowSeconds * 1000;
     // Update the request count object in app locals
     req.app.locals.throttleCounter = requestCount;
 
     // Retrieve the response object from the host
     const response = host.switchToHttp().getResponse();
     // Define the error message for too many requests
     const message = "Too Many Requests. Please Try after sometimes";
     // Send a response with status code 429 (Too Many Requests) and the error message
    response.status(HttpStatus.TOO_MANY_REQUESTS).json({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: message,
    });
  }
}
