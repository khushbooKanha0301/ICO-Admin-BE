import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Post,
  Put,
  Res,
  Req,
  Query,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AdminService } from "src/service/admin/admin.service";
import { UserService } from "src/service/user/users.service";
import { TokenService } from "src/service/token/token.service";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { IAdmin } from "src/interface/admins.interface";
import { TransactionsService } from "src/service/transaction/transactions.service";
import { ITransaction } from "src/interface/transactions.interface";
import { SkipThrottle } from "@nestjs/throttler";

var jwt = require("jsonwebtoken");
const moment = require("moment");

const getSignMessage = (address, nonce) => {
  return `Please sign this message for address ${address}:\n\n${nonce}`;
};
const Web3 = require("web3");
const jwtSecret = "eplba";
const web3 = new Web3("https://cloudflare-eth.com/");

@SkipThrottle()
@Controller("auth")
export class AuthController {
  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly adminService: AdminService,
    private readonly tokenService: TokenService,
    @InjectModel("admin") private adminModel: Model<IAdmin>,
    private readonly transactionService: TransactionsService,
    @InjectModel("transaction") private transactionModel: Model<ITransaction>
  ) {}

/**
 * This API endpoint is used to generate a token along with a sign message based on the provided address 
 * @param response 
 * @param param 
 * @returns 
 */
  @Get("/nonce/:addressId")
  async generateToken(@Res() response, @Param() param: { addressId: string }) {
    try {
      const nonce = new Date().getTime();
      const address = param.addressId;
      const tempToken = jwt.sign({ nonce, address }, jwtSecret, {
        expiresIn: "24h",
      });
      const message = getSignMessage(address, nonce);
      return response.json({ tempToken, message });
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json(err.response);
    }
  }

  /**
   * This endpoint retrieves user details based on the provided address
   * @param response 
   * @param address 
   * @returns 
   */
  @Get("/getuser/:address")
  async getUserDetailByAddress(
    @Res() response,
    @Param("address") address: string
  ) {
    try {
      let user = await this.userService.getOnlyUserBioByAddress(address);

      let docUrl = "";
      if (user.profile) {
        const s3 = this.configService.get("s3");
        const bucketName = this.configService.get("aws_s3_bucket_name");
        docUrl = await s3.getSignedUrl("getObject", {
          Bucket: bucketName,
          Key: user.profile ? user.profile : "",
          Expires: 604800,
        });
      }

      user.fname_alias = user.fname_alias ? user.fname_alias : "John";
      user.lname_alias = user.lname_alias ? user.lname_alias : "Doe";
      return response.json({ docUrl: docUrl, user: user });
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json(err.response);
    }
  }

  /**
   * This Api endpoint is used for admin login 
   * @param response 
   * @param req 
   * @returns 
   */
  @SkipThrottle(false)
  @Post("/adminlogin")
  async adminlogin(@Res() response, @Req() req: any) {
    try {
      const result = await this.adminService.adminLogin(
        req.body.userName,
        req.body.password
      );
      if (!result) {
        return response
          .status(HttpStatus.BAD_REQUEST)
          .json({message:"Invalid username or password"});
      }
      const payload = { username: req.body.userName, userId: result._id, access: result.role_name };
      const token = await jwt.sign(payload, jwtSecret, { expiresIn: "24h" });
      const roleId = result.role_id;
      await this.tokenService.createToken({ token, roleId });
      return response.json({
        token: token,
        userId: result._id,
        roleId: result.role_id,
        message: "Admin logged in successfully",
      });

    } catch (err) {
      if (err.response) {
        return response.status(HttpStatus.BAD_REQUEST).json(err.response);
      } else {
        console.error(err);
        return response
          .status(HttpStatus.INTERNAL_SERVER_ERROR)
          .json({message:"An error occurred while processing your request"});
      }
    }
  }

  /**
   * This Api endpoint is used to logout
   * @param response 
   * @param req 
   * @returns 
   */
  @Post("/adminlogout")
  async adminLogout(@Res() response, @Req() req: any) {
    try {
      const authHeader = req.headers["authorization"];
      const token = authHeader && authHeader.split(" ")[1];
      const isTokenDeleted = await this.tokenService.deleteToken(token);
      if (isTokenDeleted) {
        return response.status(HttpStatus.OK).json({
          message: "Admin logged out successfully",
        });
      } else {
        return response.status(HttpStatus.OK).json({
          message: "Something went wrong",
        });
      }
    } catch (err) {
      return response.status(err.status).json(err.response);
    }
  }

  /**
   * This Api endpoint is used to forget password
   * @param response 
   * @param req 
   * @returns 
   */
  @SkipThrottle(false)
  @Post("/forgotpassword")
  async forgotPassword(@Res() response, @Req() req: any) {
    try {
      let validRegex =
        /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
      if (
        req?.body?.email &&
        !req?.body?.email.match(validRegex)
      ) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "Invalid E-mail address.",
        });
      }

      const admin = await this.adminService.fetchAdmin(req?.body?.email);
      if(!admin)
      {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "Email not exist",
        });
      }
      const user = await this.adminService.forgotPassword(req?.body?.email);
      if (user) {
        return response.status(HttpStatus.OK).json({
          message: "OTP Sent On your Email address",
        });
      } else {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "Something went wrong",
        });
      }
    } catch (err) {
      return response.status(err.status).json(err.response);
    }
  }

  /**
   * This Api endpoint is used to check OTP
   * @param response 
   * @param req 
   * @returns 
   */
  @SkipThrottle(false)
  @Post("/checkOTP")
  async checkOTP(@Res() response, @Req() req: any) {
    try {
      const user = await this.adminModel.findOne({ email: req?.body?.email });
      if (user?.otp == req?.body?.otp) {
        return response.status(HttpStatus.OK).json({
          message: "OTP Verified successfully",
        });
      } else {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "Something went wrong",
        });
      }
    } catch (err) {
      return response.status(err.status).json(err.response);
    }
  }
  
  /**
   * This api endpoint is used to rest password
   * @param response 
   * @param req 
   * @returns 
   */
  @SkipThrottle(false)
  @Post("/resetPassword")
  async resetPassword(@Res() response, @Req() req: any) {
    try {
      const user = await this.adminModel.findOne({ email: req?.body?.email });
      if(!user)
      {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "User not found.",
        });
      }
      if(!user.otp)
      {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "Token Expired.",
        });
      }
      
      let password = await this.adminService.hashPassword(req.body?.confirmPassword);

      const changePassword = await this.adminModel
        .updateOne(
          { email: req.body?.email },
          { password: password,otp:null }
        )
        .exec();
      if (changePassword) {
        return response.status(HttpStatus.OK).json({
          message: "Your Password Changed successfully",
        });
      }
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(err.response);
    }
  }

  /**
   * Retrieves sale graph values based on the provided options and date range.
   * @param req 
   * @param response 
   * @returns 
   */
  @Post("/getSaleGrapthValues")
  async getSaleGrapthValues(@Req() req: any, @Res() response) {
    try {
      const option = req.body.option;
      const from_date = req.body.from_date;
      const to_date = req.body.to_date;
      const transactionData = await this.transactionService.getSaleGraphValue(
        option,
        from_date,
        to_date
      );
      const totalToken = await this.transactionService.getSaleGraphTotalToken(
        from_date,
        to_date
      );
      if (transactionData) {
        return response.status(HttpStatus.OK).json({
          message: "get TotalAmount Amount Successfully",
          transactionData: transactionData,
          totalToken: totalToken,
        });
      } else {
        return response.status(HttpStatus.OK).json({
          message: "Something went wrong",
        });
      }
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json({
        message: "Something went wrong",
      });
    }
  }

  /**
   * Retrieves line graph values based on the provided options and date range.
   * @param req 
   * @param response 
   * @returns 
   */
  @Post("/getLineGrapthValues")
  async getLineGrapthValues(@Req() req: any, @Res() response) {
    try {
      const option = req.body.option;
      const from_date = req.body.from_date;
      const to_date = req.body.to_date;
      const transactionData = await this.transactionService.getLineGraphValue(
        option,
        from_date,
        to_date
      );
      const totalToken = await this.transactionService.getLineGraphTotalToken(
        from_date,
        to_date
      );
      if (transactionData) {
        return response.status(HttpStatus.OK).json({
          message: "get TotalAmount Amount Successfully",
          transactionData: transactionData,
          totalToken: totalToken,
        });
      } else {
        return response.status(HttpStatus.OK).json({
          message: "Something went wrong",
        });
      }
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json({
        message: "Something went wrong",
      });
    }
  }

  /**
   * Retrieves the total count of MID (Merchant ID) records.
   * @param req 
   * @param response 
   * @returns 
   */
  @Get("/getTotalMid")
  async getTotalMid(@Req() req: any, @Res() response) {
    try {
      const totalAmount = await this.transactionService.getTotalMid();
      const today = moment.utc().format();
      const lastWeekStartDate = moment
        .utc()
        .subtract(1, "weeks")
        .startOf("week")
        .format();
      const sinceLastWeekSale = await this.transactionService.getTransactionCountBasedDate(
          lastWeekStartDate,
          today
        );
        return response.status(HttpStatus.OK).json({
          message: "get TotalAmount Amount Successfully",
          totalAmount: totalAmount,
          sinceLastWeekSale: sinceLastWeekSale,
        });
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json({
        message: "Something went wrong",
      });
    }
  }
  
}
