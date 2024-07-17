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
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AdminService } from "src/service/admin/admin.service";
import { UserService } from "src/service/user/users.service";
import { TokenService } from "src/service/token/token.service";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { IAdmin } from "src/interface/admins.interface";
import { IPermission } from "src/interface/permissions.interface";
import { TransactionsService } from "src/service/transaction/transactions.service";
import { SkipThrottle } from "@nestjs/throttler";
import { CreateAdminDto } from "src/dto/create-admin.dto";
import { UpdateAdminDto } from "src/dto/update-admin.dto";
import * as bcrypt from "bcrypt";

let jwt = require("jsonwebtoken");
const moment = require("moment");

const getSignMessage = (address, nonce) => {
  return `Please sign this message for address ${address}:\n\n${nonce}`;
};

// const Web3 = require("web3");
const jwtSecret = "eplba";
// const web3 = new Web3("https://cloudflare-eth.com/");

@SkipThrottle()
@Controller("auth")
export class AuthController {
  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly adminService: AdminService,
    private readonly tokenService: TokenService,
    @InjectModel("admin") private adminModel: Model<IAdmin>,
    @InjectModel("permission") private permissionModel: Model<IPermission>,
    private readonly transactionService: TransactionsService
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
          .json({ message: "Invalid username or password" });
      }
      const payload = {
        username: req.body.userName,
        userId: result._id,
        access: result.role_name,
      };
      const token = await jwt.sign(payload, jwtSecret, { expiresIn: "24h" });
      const roleId = result.role_id;
      await this.tokenService.createToken({ token, roleId });
      const ipAddress = req.headers['ipaddress'];
      if(result.ipAddress !== ipAddress && roleId === 3 )
      { 
        return response
        .status(HttpStatus.BAD_REQUEST)
        .json({ message: "You are not authorized to view this page"});
        
      } else {
        return response.json({
          token: token,
          userId: result._id,
          roleId: result.role_id,
          //ipAddress: result.ipAddress,
          //permissions: result.permissions,
          message: "Admin logged in successfully",
        });
      }

    } catch (err) {
      if (err.response) {
        return response.status(HttpStatus.BAD_REQUEST).json(err.response);
      } else {
        return response
          .status(HttpStatus.INTERNAL_SERVER_ERROR)
          .json({ message: "An error occurred while processing your request" });
      }
    }
  }

  /**
   * This Api endpoint is used to create sub-admins
   * @param response
   * @param req
   * @param createAdminDto
   * @returns
   */
  @SkipThrottle(false)
  @Post("/createSubAdmins")
  async createSubAdmins(
    @Res() response,
    @Req() req: any,
    @Body() createAdminDto: CreateAdminDto
  ) {
    try {
      let reqError = null;
      let bcryptPassword = null;
      const pattern = /^[a-zA-Z0-9]*$/;
      const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

      // Check required fields
      if (!createAdminDto.fname) {
        reqError = "First name is missing";
      } else if (!createAdminDto.lname) {
        reqError = "Last name is missing";
      } else if (!createAdminDto.username) {
        reqError = "Username is missing";
      } else if (!createAdminDto.password) {
        reqError = "Password is missing";
      } else if (!createAdminDto.ipAddress) {
        reqError = "IP Address is missing";
      }

      // Validate name patterns and length
      if (
        !createAdminDto.fname.match(pattern) ||
        createAdminDto.fname.length > 20 ||
        !createAdminDto.lname.match(pattern) ||
        createAdminDto.lname.length > 20
      ) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "Please enter valid name.",
        });
      }

      // Validate username pattern and length
      if (
        !createAdminDto.username.match(emailPattern) ||
        createAdminDto.username.length > 20
      ) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "Please enter valid username.",
        });
      }

      // Check if username already exists
      const user = await this.adminModel.findOne({
        username: req?.body?.username,
      });
      if (user) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "Username already exists",
        });
      }

      // Validate and hash password
      if (req?.body?.password) {
        const saltRounds = 10;
        bcryptPassword = await bcrypt.hash(req?.body?.password, saltRounds);
      }
      createAdminDto.password = bcryptPassword;

      // Check permissions
      if (
        !createAdminDto.permissions ||
        createAdminDto.permissions.length === 0
      ) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "Permissions are missing.",
        });
      }

      for (const permission of createAdminDto.permissions) {
        if (!permission.permission_id || !permission.permission_name) {
          return response.status(HttpStatus.BAD_REQUEST).json({
            message: "Invalid permission data.",
          });
        }
      }

      // Set timestamps
      createAdminDto.createdAt = moment.utc().format();
      createAdminDto.updatedAt = moment.utc().format();
      // Create user
      await this.adminService.createUser(createAdminDto);
      return response.status(HttpStatus.CREATED).json({
        message: "User has been created successfully",
      });
    } catch (err) {
      return response.status(err.status).json(err.response);
    }
  }

  /**
   *
   * @param response
   * @param req
   * @param updateAdminDto
   * @returns
   */
  @Put("/updateSubAdmins/:id")
  async updateSubAdmins(
    @Res() response,
    @Req() req: any,
    @Body() updateAdminDto: UpdateAdminDto,
    @Param("id") id: string
  ) {
    try {
      const pattern = /^[a-zA-Z0-9]*$/;
      const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

      // Find the user by id
      const userDetails = await this.adminModel.findOne({ _id: id });
      if (!userDetails) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "User not found.",
        });
      }

      // Validate required fields
      if (!updateAdminDto.fname) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "First name is missing",
        });
      } else if (!updateAdminDto.lname) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "Last name is missing",
        });
      } else if (!updateAdminDto.username) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "Username is missing",
        });
      } else if (!updateAdminDto.ipAddress) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "IP Address is missing",
        });
      }

      // Validate name patterns and length
      if (
        !updateAdminDto.fname.match(pattern) ||
        updateAdminDto.fname.length > 20 ||
        !updateAdminDto.lname.match(pattern) ||
        updateAdminDto.lname.length > 20
      ) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "Please enter valid name.",
        });
      }

      // Validate username pattern and length
      if (
        !updateAdminDto.username.match(emailPattern) ||
        updateAdminDto.username.length > 20
      ) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "Please enter valid username.",
        });
      }

      // Check if username already exists for another user
      const user = await this.adminModel.findOne({
        _id: { $ne: id },
        username: updateAdminDto?.username,
      });
      if (user) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "Username already exists",
        });
      }

      // Validate and hash password if provided
      let bcryptPassword = userDetails?.password;
      if (req?.body?.password) {
        const saltRounds = 10;
        bcryptPassword = await bcrypt.hash(req?.body?.password, saltRounds);
      }

      // Update fields in updateAdminDto
      updateAdminDto.password = bcryptPassword;
      updateAdminDto.updatedAt = moment.utc().format();

      // Update permissions (assuming permissions are updated in updateAdminDto)
      // Example handling permissions update:
      if (updateAdminDto.permissions) {
        // Validate permissions format and content if necessary
        for (const permission of updateAdminDto.permissions) {
          if (
            typeof permission.permission_id !== "number" ||
            typeof permission.permission_name !== "string"
          ) {
            return response.status(HttpStatus.BAD_REQUEST).json({
              message: "Invalid permission data.",
            });
          }
        }
      }

      // Update the user in the database
      await this.adminService.updateSubAdmin(id, updateAdminDto);

      return response.status(HttpStatus.OK).json({
        message: "User updated successfully",
      });
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json(err.response);
    }
  }

  /**
   *
   * @param response
   * @param id
   * @returns
   */
  @Get("/getSubAdminById/:id")
  async getSubAdminById(@Res() response, @Param("id") id: string) {
    try {
      const fetchUser = await this.adminModel
        .findOne({ _id: id })
        .select("-password -role_id -role_name");
      if (fetchUser) {
        return response.status(HttpStatus.CREATED).json({
          message: "Get Sub Admin By Id successfully",
          fetchUser: fetchUser,
        });
      } else {
        return response.status(HttpStatus.OK).json({
          message: "Something went wrong",
        });
      }
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json(err.response);
    }
  }

  @Get("/getSubAdminPermission/:id")
  async getSubAdminPermission(@Res() response, @Param("id") id: string) {
    try {
      const fetchUser = await this.adminModel
        .findOne({ _id: id })
        .select("id permissions ");
      if (fetchUser) {
        return response.status(HttpStatus.CREATED).json({
          message: "Get Sub Admin By Id successfully",
          fetchUser: fetchUser,
        });
      } else {
        return response.status(HttpStatus.OK).json({
          message: "Something went wrong",
        });
      }
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json(err.response);
    }
  }

  /**
   *
   * @param response
   * @param req
   * @returns
   */
  @Get("/getAllSubAdmins")
  async getAllSubAdmins(@Res() response, @Req() req: any) {
    try {
      const page = req.query.page ? req.query.page : 1;
      const pageSize = req.query.pageSize ? req.query.pageSize : 10;
      const searchQuery =
        req.query.query !== undefined ? req.query.query : null;
      const fetchAllUser = await this.adminService.getAllSubmins(
        page,
        pageSize,
        searchQuery
      );

      const adminsCount = await this.adminService.getAllSubminsCount(
        searchQuery
      );

      if (fetchAllUser) {
        return response.status(HttpStatus.CREATED).json({
          message: "Get All Sub Admins Successfully",
          fetchAllUser: fetchAllUser,
          adminsCount: adminsCount,
        });
      } else {
        return response.status(HttpStatus.OK).json({
          message: "Something went wrong",
        });
      }
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json(err.response);
    }
  }

  /**
   *
   * @param req
   * @param response
   * @param param
   * @returns
   */
  @SkipThrottle(false)
  @Get("/deleteSubAdmin/:id")
  async deleteSubAdmin(
    @Req() req: any,
    @Res() response,
    @Param() param: { id: string }
  ) {
    try {
      const userData = await this.adminModel.findById(param.id);
      if (!userData) {
        throw new NotFoundException(`User already Deleted`);
      }

      await this.adminModel.findByIdAndDelete(param.id).exec();

      return response.status(HttpStatus.OK).json({
        message: "User deleted successfully...",
      });
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json(err.response);
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
      if (req?.body?.email && !req?.body?.email.match(validRegex)) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "Invalid E-mail address.",
        });
      }

      const admin = await this.adminService.fetchAdmin(req?.body?.email);
      if (!admin) {
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
      if (!user) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "User not found.",
        });
      }
      if (!user.otp) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "Token Expired.",
        });
      }

      let password = await this.adminService.hashPassword(
        req.body?.confirmPassword
      );

      const changePassword = await this.adminModel
        .updateOne(
          { email: req.body?.email },
          { password: password, otp: null }
        )
        .exec();
      if (changePassword) {
        return response.status(HttpStatus.OK).json({
          message: "Your Password Changed successfully",
        });
      }
    } catch (err) {
      return response
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json(err.response);
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
      const sinceLastWeekSale =
        await this.transactionService.getTransactionCountBasedDate(
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

  @Get("/getAllPermissions")
  async getAllPermissions(@Res() response, @Req() req: any) {
    try {
      const fetchAllPermissions = await this.permissionModel.find();
      if (fetchAllPermissions) {
        return response.status(HttpStatus.CREATED).json({
          message: "Get All Permissions Successfully",
          fetchAllpermissions: fetchAllPermissions,
        });
      } else {
        return response.status(HttpStatus.OK).json({
          message: "Something went wrong",
        });
      }
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json(err.response);
    }
  }
}
