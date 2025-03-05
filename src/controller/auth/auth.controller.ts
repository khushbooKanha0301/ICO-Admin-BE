import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Put,
  Res,
  Req,
  NotFoundException,
  HttpException,
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
const jwt = require("jsonwebtoken");
const moment = require("moment");
const jwtSecret = "eplba";

const getSignMessage = (address, nonce) => {
  return `Please sign this message for address ${address}:\n\n${nonce}`;
};

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
  @Post('/createSubAdmins')
  async createSubAdmins(
    @Res() response,
    @Req() req: any,
    @Body() createAdminDto: CreateAdminDto) {
    try {
      // Check for missing fields
      const requiredFields = [
        { field: "fname", message: "First Name is missing." },
        { field: "lname", message: "Last Name is missing." },
        { field: "username", message: "Username is missing." },
        { field: "password", message: "Password is missing." },
        { field: "ipAddress", message: "ipAddress is missing." },
        { field: "permissions", message: "Permissions are missing"}
      ];
      for (const { field, message } of requiredFields) {
        if (!createAdminDto[field]) {
          return response.status(HttpStatus.BAD_REQUEST).json({ message });
        }
      }

      this.validateName(createAdminDto.fname, 'First name');
      this.validateName(createAdminDto.lname, 'Last name');
      this.validateUsername(createAdminDto.username);

      // Check if username already exists
      const existingUser = await this.adminModel.findOne({
        username: createAdminDto.username,
      });
      if (existingUser) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "Username already exists",
        });
      }

      // Hash password
      const saltRounds = 10;
      createAdminDto.password = await bcrypt.hash(
        createAdminDto.password,
        saltRounds,
      );

      // Validate permissions
      this.validatePermissions(createAdminDto.permissions);

      // Set timestamps
      const timestamp = moment.utc().format();
      createAdminDto.createdAt = timestamp;
      createAdminDto.updatedAt = timestamp;
 
      // Create user
      await this.adminService.createUser(createAdminDto);
      return response.status(HttpStatus.OK).json({
        message: 'User has been created successfully'
      });

    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to create user',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private validateName(name: string, fieldName: string) {
    const namePattern = /^[a-zA-Z0-9]*$/;
    if (!name.match(namePattern) || name.length > 20) {
      throw new HttpException(
        `Please enter a valid ${fieldName}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private validateUsername(username: string) {
    const emailPattern =
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!username.match(emailPattern) || username.length > 20) {
      throw new HttpException(
        'Please enter a valid username.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private validatePermissions(permissions?: any[]) {
    if (permissions) {
      for (const permission of permissions) {
        if (!permission.permission_id || !permission.permission_name) {
          throw new HttpException(
            'Invalid permission data.',
            HttpStatus.BAD_REQUEST,
          );
        }
      }
    }
  }

  /**
   *
   * @param response
   * @param req
   * @param updateAdminDto
   * @returns
   */
  @Put('/updateSubAdmins/:id')
  async updateSubAdmins(
    @Res() response,
    @Body() updateAdminDto: UpdateAdminDto,
    @Param('id') id: string,
  ) {
    try {
      // Check if user exists
      const userDetails = await this.adminModel.findById(id);
      if (!userDetails) {
        throw new HttpException('User not found.', HttpStatus.NOT_FOUND);
      }

      // Validate required fields
      this.validateRequiredFields(updateAdminDto);

      // Validate name fields
      this.validateName(updateAdminDto.fname, 'First name');
      this.validateName(updateAdminDto.lname, 'Last name');

      // Validate username
      this.validateUsername(updateAdminDto.username);

      // Check if username exists for another user
      const existingUser = await this.adminModel.findOne({
        _id: { $ne: id },
        username: updateAdminDto.username,
      });
      if (existingUser) {
        throw new HttpException('Username already exists.', HttpStatus.CONFLICT);
      }

      // Hash password if provided
      if (updateAdminDto.password) {
        const saltRounds = 10;
        updateAdminDto.password = await bcrypt.hash(
          updateAdminDto.password,
          saltRounds,
        );
      } else {
        updateAdminDto.password = userDetails.password; // Retain existing password
      }

      // Validate permissions
      this.validatePermissions(updateAdminDto.permissions);

      // Set updated timestamp
      updateAdminDto.updatedAt = moment.utc().format();

      // Update user in the database
      await this.adminService.updateSubAdmin(id, updateAdminDto);

      return response.status(HttpStatus.OK).json({
        message: 'User updated successfully',
      });
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to update user.',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private validateRequiredFields(dto: UpdateAdminDto) {
    const requiredFields = [
      { key: 'fname', label: 'First name' },
      { key: 'lname', label: 'Last name' },
      { key: 'username', label: 'Username' },
      { key: 'ipAddress', label: 'IP Address' },
    ];

    for (const field of requiredFields) {
      if (!dto[field.key]) {
        throw new HttpException(
          `${field.label} is missing`,
          HttpStatus.BAD_REQUEST,
        );
      }
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

  /**
   *
   * @param response
   * @param id
   * @returns
   */
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

  /**
   * 
   * @param response 
   * @param req 
   * @returns 
   */
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
