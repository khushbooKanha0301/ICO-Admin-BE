import {
  Controller,
  Get,
  HttpStatus,
  Res,
  Req,
  NotFoundException,
  Param,
  Post,
  Put,
  Body,
  BadRequestException,
} from "@nestjs/common";
import { UserService } from "src/service/user/users.service";
import { TransactionsService } from "src/service/transaction/transactions.service";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { IUser } from "src/interface/users.interface";
import { IAdmin } from "src/interface/admins.interface";
import { ITransaction } from "src/interface/transactions.interface";
import { UpdateAccountSettingsDto } from "src/dto/update-account-settings.dto";
import { SkipThrottle } from "@nestjs/throttler";
import { ISales } from "src/interface/sales.interface";
import { EmailService } from "src/service/email/email.service";
const moment = require("moment");
const rp = require("request-promise-native");

@SkipThrottle()
@Controller("users")
export class UsersController {
  constructor(
    private readonly userService: UserService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    private readonly transactionService: TransactionsService,
    @InjectModel("user") private userModel: Model<IUser>,
    @InjectModel("sales") private salesModel: Model<ISales>,
    @InjectModel("admin") private adminModel: Model<IAdmin>,
    @InjectModel("transaction") private transactionModel: Model<ITransaction>
  ) {}

  /**
   * This API endpoint is used to retrives all the user list
   * @param req
   * @param response
   * @returns
   */
  @Get("/userList")
  async userList(@Req() req: any, @Res() response) {
    try {
      const page = req.query.page ? req.query.page : 1;
      const pageSize = req.query.pageSize ? req.query.pageSize : 10;
      const searchQuery =
        req.query.query !== undefined ? req.query.query : null;
      const statusFilter = req.query.statusFilter
        ? req.query.statusFilter
        : null;
      const getusers = await this.userService.getUsers(
        page,
        pageSize,
        searchQuery,
        statusFilter
      );

      const midCountResult = await this.transactionModel
        .aggregate([
          {
            $match: {
              status: {
                $in: ["paid"],
              },
            },
          },
          {
            $group: {
              _id: "$wallet_address",
              total: {
                $sum: { $toDouble: "$token_cryptoAmount" },
              },
            },
          },
          {
            $addFields: {
              wallet_address: "$_id",
            },
          },
          {
            $project: {
              _id: 0,
              wallet_address: 1,
              totalAmount: { $round: ["$total", 2] },
            },
          },
        ])
        .exec();
      let tokenCount = midCountResult.map((mid) => {
        let wallet_address = mid.wallet_address;
        return { [wallet_address]: mid.totalAmount };
      });

      tokenCount = Object.assign({}, ...tokenCount);
      const usersData = [];
      if (getusers.length > 0) {
        await Promise.all(
          getusers.map(async (user: any) => {
            usersData.push({
              ...user._doc,
              totalAmount: tokenCount[user?.wallet_address]
                ? tokenCount[user?.wallet_address]
                : 0,
            });
          })
        );
      }
      const usersCount = await this.userService.getUserCount(
        searchQuery,
        statusFilter
      );
      if (!usersData) {
        throw new NotFoundException(`Users not found`);
      }
      return response.status(HttpStatus.OK).json({
        message: "User found successfully",
        users: usersData,
        totalUsersCount: usersCount,
      });
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json(err.response);
    }
  }

  /**
   * This API endpoint is used to retrives all the KYC user list
   * @param req
   * @param response
   * @returns
   */
  @Get("/kycUserList")
  async kycUserList(@Req() req: any, @Res() response) {
    try {
      const page = req.query.page ? req.query.page : 1;
      const pageSize = req.query.pageSize ? req.query.pageSize : 10;
      const searchQuery =
        req.query.query !== undefined ? req.query.query : null;
      const statusFilter = req.query.statusFilter
        ? req.query.statusFilter
        : null;
      const usersData = await this.userService.getKycUsers(
        page,
        pageSize,
        searchQuery,
        statusFilter
      );

      const usersCount = await this.userService.getKycUserCount(
        searchQuery,
        statusFilter
      );
      if (!usersData) {
        throw new NotFoundException(`Users not found`);
      }
      return response.status(HttpStatus.OK).json({
        message: "User found successfully",
        users: usersData,
        totalUsersCount: usersCount,
      });
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json(err.response);
    }
  }

  /**
   * This API endpoint is used to accept the kyc
   * @param req
   * @param response
   * @param param
   * @returns
   */
  @SkipThrottle(false)
  @Get("/acceptKyc/:id")
  async acceptKyc(@Res() response, @Param("id") id: string) {
    try {
      const currentDate = moment.utc().format();
      // Fetch user data
      const userData = await this.userModel.findById(id);
      if (!userData) throw new NotFoundException("User not found");
      if (userData.is_kyc_deleted)
        throw new BadRequestException("KYC not found");
      if (userData.is_verified === 1)
        throw new BadRequestException("User KYC already approved");
      if (userData.is_verified === 2)
        throw new BadRequestException("User KYC already rejected");

      // Update KYC status
      await this.userModel.updateOne(
        { _id: id },
        { is_verified: 1, admin_checked_at: currentDate }
      );

      // Check and send verification email
      if (
        userData.email &&
        userData.email_verified &&
        userData.is_verified == 1
      ) {
        const globalContext = {
          formattedDate: moment().format("dddd, MMMM D, YYYY"),
          greeting: `Dear ${
            userData.fname ? userData.fname + " " + userData.lname : "John Doe"
          },`,
          heading: "KYC Approved Email",
          para1: "Thank you for submitting your verification request.",
          para2:
            "We are pleased to let you know that your identity (KYC) has been verified and you are granted to participate in our token sale.",
          para3:
            "We invite you to get back to contributor account and purchase token before sales end.",
          title: "KYC Approved Email",
        };
        const mailSubject = "Middn :: KYC Verified : Contribute";
        await this.emailService.sendVerificationEmail(
          userData,
          globalContext,
          mailSubject
        );
      }

      // Update transaction and sales data
      if (userData.kyc_completed && userData.is_verified === 1) {
        const midCountResult =
          await this.transactionService.getTotalMidByAddress(
            userData.wallet_address
          );
        if (midCountResult) {
          const currentSales = await this.transactionService.getCurrentSales();
          const userPurchaseMid = parseFloat(
            (midCountResult + (currentSales?.user_purchase_token || 0)).toFixed(
              2
            )
          );
          const remainingMid = parseFloat(
            (currentSales?.total_token || 0 - userPurchaseMid).toFixed(2)
          );
          await this.salesModel.updateOne(
            { _id: currentSales?._id },
            {
              $set: {
                user_purchase_token: userPurchaseMid,
                remaining_token: remainingMid,
              },
            }
          );

          await this.transactionModel.updateOne(
            { user_wallet_address: userData.wallet_address },
            { is_process: true }
          );
        }
      }

      return response.status(HttpStatus.OK).json({
        message: "KYC approved successfully",
      });
    } catch (error) {
      return response.status(HttpStatus.BAD_REQUEST).json({
        message: error.message || "Failed to approve KYC",
      });
    }
  }

  /**
   *  This API endpoint is used to reject kyc
   * @param req
   * @param response
   * @param param
   * @returns
   */
  @SkipThrottle(false)
  @Post("/rejectKyc/:id")
  async rejectKyc(@Req() req: any, @Res() response, @Param("id") id: string) {
    try {
      const currentDate = moment.utc().format();
      // Fetch user data
      const user = await this.userModel.findById(id).exec();
      if (!user) throw new NotFoundException("user not found");
      if (user.is_kyc_deleted) throw new BadRequestException("KYC not found");
      if (user.is_verified === 1)
        throw new BadRequestException("User KYC already approved");
      if (user.is_verified === 2)
        throw new BadRequestException("User KYC already rejected");

      // Update KYC status to "rejected"
      await this.userModel.updateOne(
        { _id: id },
        { is_verified: 2, admin_checked_at: currentDate }
      );

      const updateData = await this.userModel.findById(id);
      if (!updateData) {
        throw new NotFoundException(`Users not found`);
      }

      // Send rejection email if email is verified
      if (
        updateData.email &&
        updateData.email_verified &&
        updateData.is_verified === 2
      ) {
        const globalContext = {
          formattedDate: moment().format("dddd, MMMM D, YYYY"),
          greeting: `Dear ${
            user.fname ? `${user.fname} ${user.lname}` : "John Doe"
          },`,
          rejectionMessage: req.body.message || "Reason not added",
          para1:
            "Thank you for submitting your verification request. We're having difficulties verifying your identity.",
          para2:
            "The information you had submitted was unfortunately rejected for following reason:",
          para3:
            "Don't be upset! Still you want to verity your identity, please get back to your account and fill form with proper information and upload correct documents to complete your identity verification process.",
          title: "KYC Rejected Email",
        };
        const mailSubject = "Middn :: KYC Application Rejected";
        await this.emailService.sendVerificationEmail(
          updateData,
          globalContext,
          mailSubject
        );
      }

      return response.status(HttpStatus.OK).json({
        message: "KYC rejection processed successfully",
      });
    } catch (error) {
      return response.status(HttpStatus.BAD_REQUEST).json({
        message: error.message || "Failed to reject KYC",
      });
    }
  }

  /**
   *  This API endpoint is used to Suspend user
   * @param req
   * @param response
   * @param param
   * @returns
   */
  @SkipThrottle(false)
  @Post("/suspendUser/:id")
  async suspendUser(
    @Req() req: any,
    @Res() response,
    @Param() param: { id: string }
  ) {
    try {
      const userId = req.headers["userid"];
      const fetchUser = await this.adminModel
        .findOne({ _id: userId })
        .select("id permissions role_id");

      if (fetchUser?.role_id === 3) {
        const hasPermission = fetchUser?.permissions?.some(
          (permission) => permission.permission_id === 1
        );

        if (!hasPermission) {
          return response.status(HttpStatus.BAD_REQUEST).json({
            message: "You don't have permission to Suspend User",
          });
        }
      }

      const user = await this.userModel.findById(param.id).exec();
      if (!user) {
        throw new NotFoundException(`User not found`);
      }
      if (user.status === "Suspend") {
        throw new BadRequestException("User already suspended");
      }
      const users = await this.userModel
        .updateOne({ _id: param.id }, { status: "Suspend" })
        .exec();
      return response.status(HttpStatus.OK).json({
        message: "User Status Suspended successfully",
        users: users,
      });
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json(err.response);
    }
  }

  /**
   * This API endpoint is used to twoFA user disable
   * @param req
   * @param response
   * @param param
   * @returns
   */
  @SkipThrottle(false)
  @Post("/twoFADisableUser/:id")
  async twoFADisableUser(
    @Req() req: any,
    @Res() response,
    @Param() param: { id: string }
  ) {
    try {
      const user = await this.userModel.findById(param.id).exec();
      if (!user) {
        throw new NotFoundException(`User not found`);
      }
      if (user.is_2FA_enabled === false) {
        return response
          .status(HttpStatus.BAD_REQUEST)
          .json({ message: "This user's 2FA already disabled" });
      }
      user.is_2FA_enabled = false;
      user.is_2FA_login_verified = true;
      user.google_auth_secret = "";
      await user.save();
      return response.status(HttpStatus.OK).json({
        message: "User's Google 2FA Disabled successfully",
        users: user,
      });
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json(err.response);
    }
  }

  /**
   * This Api endpoint is used to active user
   * @param req
   * @param response
   * @param param
   * @returns
   */
  @SkipThrottle(false)
  @Post("/activeUser/:id")
  async activeUser(
    @Req() req: any,
    @Res() response,
    @Param() param: { id: string }
  ) {
    try {
      const user = await this.userModel.findById(param.id).exec();
      if (!user) {
        throw new NotFoundException(`User not found`);
      }
      if (user?.status === "Active") {
        throw new BadRequestException(`User status already active`);
      }
      const users = await this.userModel
        .updateOne({ _id: param.id }, { status: "Active" })
        .exec();

      return response.status(HttpStatus.OK).json({
        message: "User Status Activated successfully",
        users: users,
      });
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json(err.response);
    }
  }

  /**
   * This Api endpoint is used to delete user
   * @param req
   * @param response
   * @param param
   * @returns
   */
  @SkipThrottle(false)
  @Get("/deleteUser/:id")
  async deleteUser(
    @Req() req: any,
    @Res() response,
    @Param() param: { id: string }
  ) {
    try {
      const userId = req.headers["userid"];
      const fetchUser = await this.adminModel
        .findOne({ _id: userId })
        .select("id permissions role_id");

      if (fetchUser?.role_id === 3) {
        const hasPermission = fetchUser?.permissions?.some(
          (permission) => permission.permission_id === 2
        );

        if (!hasPermission) {
          return response.status(HttpStatus.BAD_REQUEST).json({
            message: "You don't have permission to Delete User",
          });
        }
      }

      const userData = await this.userModel.findById(param.id);
      if (!userData) {
        throw new NotFoundException(`User already Deleted`);
      }
      await this.transactionModel
        .deleteMany({ wallet_address: userData?.wallet_address })
        .exec();
      await this.userModel.findByIdAndDelete(param.id).exec();

      return response.status(HttpStatus.OK).json({
        message: "User deleted successfully...",
      });
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json(err.response);
    }
  }

  /**
   * This Api endpoint is used to delete KYC.
   * @param req
   * @param response
   * @param param
   * @returns
   */
  @SkipThrottle(false)
  @Get("/deleteKyc/:id")
  async deleteKyc(
    @Req() req: any,
    @Res() response,
    @Param() param: { id: string }
  ) {
    try {
      const userId = req.headers["userid"];
      const fetchUser = await this.adminModel
        .findOne({ _id: userId })
        .select("id permissions role_id");

      if (fetchUser?.role_id === 3) {
        const hasPermission = fetchUser?.permissions?.some(
          (permission) => permission.permission_id === 3
        );

        if (!hasPermission) {
          return response.status(HttpStatus.BAD_REQUEST).json({
            message: "You don't have permission to Delete User KYC",
          });
        }
      }

      const userData = await this.userModel.findById(param.id);
      if (!userData) {
        throw new NotFoundException(`KYC Not Found`);
      }

      if (userData?.is_kyc_deleted === true) {
        throw new BadRequestException(`User's KYC already deleted`);
      }

      const user = await this.userModel
        .findByIdAndUpdate(
          param.id,
          {
            $set: {
              mname: "",
              res_address: "",
              postal_code: "",
              city: "",
              country_of_issue: "",
              verified_with: "",
              passport_url: "",
              user_photo_url: "",
              is_kyc_deleted: true,
              kyc_completed: false,
              is_verified: 0,
            },
          },
          { new: true }
        )
        .exec();
      if (!user) {
        throw new NotFoundException(`User #${param.id} not found`);
      }

      return response.status(HttpStatus.OK).json({
        message: "User KYC deleted successfully...",
      });
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json(err.response);
    }
  }

  /**
   * This Api endpoint is used to view users
   * @param req
   * @param response
   * @param param
   * @returns
   */
  @Get("/viewUser/:id")
  async viewUser(
    @Req() req: any,
    @Res() response,
    @Param() param: { id: string }
  ) {
    try {
      const user = await this.userModel
        .findById(param.id)
        .select(
          "-referred_by -wallet_type -nonce -is_2FA_login_verified -__v -google_auth_secret"
        )
        .exec();

      if (!user) {
        throw new NotFoundException(`User not found`);
      }
      let passport_url = "";
      let user_photo_url = "";
      if (user.passport_url) {
        const s3 = this.configService.get("s3");
        const bucketName = this.configService.get("aws_s3_bucket_name");
        passport_url = await s3.getSignedUrl("getObject", {
          Bucket: bucketName,
          Key: user.passport_url ? user.passport_url : "",
          Expires: 604800,
        });
      }
      if (user.user_photo_url) {
        const s3 = this.configService.get("s3");
        const bucketName = this.configService.get("aws_s3_bucket_name");
        user_photo_url = await s3.getSignedUrl("getObject", {
          Bucket: bucketName,
          Key: user.user_photo_url ? user.user_photo_url : "",
          Expires: 604800,
        });
      }

      return response.status(HttpStatus.OK).json({
        message: "User found successfully",
        user: user,
        passport_url: passport_url,
        user_photo_url: user_photo_url,
      });
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json(err.response);
    }
  }

  /**
   * This Api endpoint is used to view KYC by id
   * @param req
   * @param response
   * @param param
   * @returns
   */
  @Get("/viewKyc/:id")
  async viewKyc(
    @Req() req: any,
    @Res() response,
    @Param() param: { id: string }
  ) {
    try {
      const user = await this.userModel
        .findById(param.id)
        .select(
          "-referred_by -wallet_type -nonce -is_2FA_login_verified -__v -google_auth_secret"
        )
        .exec();
      if (!user) {
        throw new NotFoundException(`KYC not found`);
      }
      if (user?.is_kyc_deleted) {
        throw new NotFoundException(`KYC not found`);
      }
      let passport_url = "";
      let user_photo_url = "";
      if (user.passport_url) {
        const s3 = this.configService.get("s3");
        const bucketName = this.configService.get("aws_s3_bucket_name");
        passport_url = await s3.getSignedUrl("getObject", {
          Bucket: bucketName,
          Key: user.passport_url ? user.passport_url : "",
          Expires: 604800,
        });
      }
      if (user.user_photo_url) {
        const s3 = this.configService.get("s3");
        const bucketName = this.configService.get("aws_s3_bucket_name");
        user_photo_url = await s3.getSignedUrl("getObject", {
          Bucket: bucketName,
          Key: user.user_photo_url ? user.user_photo_url : "",
          Expires: 604800,
        });
      }

      return response.status(HttpStatus.OK).json({
        message: "User found successfully",
        user: user,
        passport_url: passport_url,
        user_photo_url: user_photo_url,
      });
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json(err.response);
    }
  }

  /**
   * This Api endpoint is used to reset password
   * @param response
   * @param req
   * @returns
   */
  @Post("/changePassword")
  async resetPassword(@Res() response, @Req() req: any) {
    try {
      const user = await this.adminModel.findById(req.body?.id);
      if (user?.password != req?.body?.oldPassword) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "Please Enter Correct Old Password",
        });
      } else {
        const changePassword = await this.adminModel
          .updateOne(
            { _id: user?._id },
            { password: req.body?.confirmPassword }
          )
          .exec();
        if (changePassword) {
          return response.status(HttpStatus.OK).json({
            message: "Your Password Changed successfully",
          });
        }
      }
    } catch (err) {
      return response.status(err.status).json(err.response);
    }
  }

  /**
   * This Api endpoint is used to get users count
   * @param response
   * @param req
   * @returns
   */
  @Get("/getUsersCount")
  async getUsersCount(@Res() response, @Req() req: any) {
    try {
      const totalUser = await this.userModel.countDocuments().exec();
      const totalKYCUser = await this.userModel
        .countDocuments({ kyc_completed: true })
        .exec();
      const today = moment.utc().format();
      const lastWeekStartDate = moment
        .utc()
        .subtract(1, "weeks")
        .startOf("week")
        .format();

      const sinceLastWeekUserCount =
        await this.userService.sinceLastWeekUserCount(lastWeekStartDate, today);
      const sinceLastWeekKYCUserCount =
        await this.userService.sinceLastWeekUserCount(
          lastWeekStartDate,
          today,
          true
        );
      return response.status(HttpStatus.OK).json({
        message: "Get Users successfully",
        totalUser: totalUser,
        totalKYCUser: totalKYCUser,
        sinceLastWeekUserCount: sinceLastWeekUserCount,
        sinceLastWeekKYCUserCount: sinceLastWeekKYCUserCount,
      });
    } catch (err) {
      return response.status(err.status).json(err.response);
    }
  }

  /**
   * This Api endpoint is used to update account settings
   * @param req
   * @param response
   * @param updateAccountSettingDto
   * @param address
   * @returns
   */
  @SkipThrottle(false)
  @Put("/updateAccountSettings/:address")
  async updateAccountSettings(
    @Req() req: any,
    @Res() response,
    @Body() updateAccountSettingDto: UpdateAccountSettingsDto,
    @Param("address") address: string
  ) {
    try {
      const userDetails = await this.userService.getFindbyAddress(address);
      if (!userDetails) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "User not found.",
        });
      }

      const userId = userDetails._id.toString();

      // Trim all input fields
      Object.keys(updateAccountSettingDto).forEach((key) => {
        if (typeof updateAccountSettingDto[key] === "string") {
          updateAccountSettingDto[key] = updateAccountSettingDto[key].trim();
        }
      });

      // Validate phone number
      if (
        updateAccountSettingDto.phone &&
        !/^[0-9]{5,10}$/.test(updateAccountSettingDto.phone)
      ) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "Invalid Phone.",
        });
      }

      // Validate country
      const countries = [
        "AF",
        "AL",
        "DZ",
        "AS",
        "AD",
        "AO",
        "AI",
        "AQ",
        "AG",
        "AR",
        "AM",
        "AW",
        "AU",
        "AT",
        "AZ",
        "BS",
        "BH",
        "BD",
        "BB",
        "BY",
        "BE",
        "BZ",
        "BJ",
        "BM",
        "BT",
        "BO",
        "BA",
        "BW",
        "BR",
        "IO",
        "VG",
        "BN",
        "BG",
        "BF",
        "BI",
        "KH",
        "CM",
        "CA",
        "CV",
        "KY",
        "CF",
        "TD",
        "CL",
        "CN",
        "CX",
        "CC",
        "CO",
        "KM",
        "CK",
        "CR",
        "HR",
        "CU",
        "CW",
        "CY",
        "CZ",
        "CD",
        "DK",
        "DJ",
        "DM",
        "DO",
        "TL",
        "EC",
        "EG",
        "SV",
        "GQ",
        "ER",
        "EE",
        "ET",
        "FK",
        "FO",
        "FJ",
        "FI",
        "FR",
        "PF",
        "GA",
        "GM",
        "GE",
        "DE",
        "GH",
        "GI",
        "GR",
        "GL",
        "GD",
        "GU",
        "GT",
        "GG",
        "GN",
        "GW",
        "GY",
        "HT",
        "HN",
        "HK",
        "HU",
        "IS",
        "IN",
        "ID",
        "IR",
        "IQ",
        "IE",
        "IM",
        "IL",
        "IT",
        "CI",
        "JM",
        "JP",
        "JE",
        "JO",
        "KZ",
        "KE",
        "KI",
        "XK",
        "KW",
        "KG",
        "LA",
        "LV",
        "LB",
        "LS",
        "LR",
        "LY",
        "LI",
        "LT",
        "LU",
        "MO",
        "MK",
        "MG",
        "MW",
        "MY",
        "MV",
        "ML",
        "MT",
        "MH",
        "MR",
        "MU",
        "YT",
        "MX",
        "FM",
        "MD",
        "MC",
        "MN",
        "ME",
        "MS",
        "MA",
        "MZ",
        "MM",
        "NA",
        "NR",
        "NP",
        "NL",
        "AN",
        "NC",
        "NZ",
        "NI",
        "NE",
        "NG",
        "NU",
        "KP",
        "MP",
        "NO",
        "OM",
        "PK",
        "PW",
        "PS",
        "PA",
        "PG",
        "PY",
        "PE",
        "PH",
        "PN",
        "PL",
        "PT",
        "PR",
        "QA",
        "CG",
        "RE",
        "RO",
        "RU",
        "RW",
        "BL",
        "SH",
        "KN",
        "LC",
        "MF",
        "PM",
        "VC",
        "WS",
        "SM",
        "ST",
        "SA",
        "SN",
        "RS",
        "SC",
        "SL",
        "SG",
        "SX",
        "SK",
        "SI",
        "SB",
        "SO",
        "ZA",
        "KR",
        "SS",
        "ES",
        "LK",
        "SD",
        "SR",
        "SJ",
        "SZ",
        "SE",
        "CH",
        "SY",
        "TW",
        "TJ",
        "TZ",
        "TH",
        "TG",
        "TK",
        "TO",
        "TT",
        "TN",
        "TR",
        "TM",
        "TC",
        "TV",
        "VI",
        "UG",
        "UA",
        "AE",
        "GB",
        "US",
        "UY",
        "UZ",
        "VU",
        "VA",
        "VE",
        "VN",
        "WF",
        "EH",
        "YE",
        "ZM",
        "ZW",
      ];
      if (
        updateAccountSettingDto.location &&
        !countries.includes(updateAccountSettingDto.location)
      ) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "Invalid country name.",
        });
      }

      // Validate email
      if (updateAccountSettingDto.email) {
        const emailRegex =
          /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
        if (!emailRegex.test(updateAccountSettingDto.email)) {
          return response.status(HttpStatus.BAD_REQUEST).json({
            message: "Invalid E-mail address.",
          });
        }

        // Check email existence
        const existingUser = await this.userService.getFindbyEmail(
          updateAccountSettingDto.email
        );
        if (
          existingUser &&
          existingUser._id &&
          existingUser._id.toString() !== userId
        ) {
          return response.status(HttpStatus.BAD_REQUEST).json({
            message: "Email already exists.",
          });
        }

        // Check if the email is being updated and is verified
        const userEmailCheck = await this.userService.getFindbyId(userId);
        // If the email is verified and the user is trying to change it
        if (
          userEmailCheck &&
          userEmailCheck.email_verified &&
          userEmailCheck.email !== updateAccountSettingDto.email
        ) {
          return response.status(HttpStatus.BAD_REQUEST).json({
            message:
              "Your email address is already verified and cannot be changed.",
          });
        }
      }

      // Validate phone country code
      const countryCodes = [
        "+93",
        "+355",
        "+213",
        "+1-684",
        "+376",
        "+244",
        "+1-264",
        "+672",
        "+1-268",
        "+54",
        "+374",
        "+297",
        "+61",
        "+43",
        "+994",
        "+1-242",
        "+973",
        "+880",
        "+1-246",
        "+375",
        "+32",
        "+501",
        "+229",
        "+1-441",
        "+975",
        "+591",
        "+387",
        "+267",
        "+55",
        "+246",
        "+1-284",
        "+673",
        "+359",
        "+226",
        "+257",
        "+855",
        "+237",
        "+1",
        "+238",
        "+1-345",
        "+236",
        "+235",
        "+56",
        "+86",
        "+61",
        "+61",
        "+57",
        "+269",
        "+682",
        "+506",
        "+385",
        "+53",
        "+599",
        "+357",
        "+420",
        "+243",
        "+45",
        "+253",
        "+1-767",
        "+1-809, 1-829, 1-849",
        "+670",
        "+593",
        "+20",
        "+503",
        "+240",
        "+291",
        "+372",
        "+251",
        "+500",
        "+298",
        "+679",
        "+358",
        "+33",
        "+689",
        "+241",
        "+220",
        "+995",
        "+49",
        "+233",
        "+350",
        "+30",
        "+299",
        "+1-473",
        "+1-671",
        "+502",
        "+44-1481",
        "+224",
        "+245",
        "+592",
        "+509",
        "+504",
        "+852",
        "+36",
        "+354",
        "+91",
        "+62",
        "+98",
        "+964",
        "+353",
        "+44-1624",
        "+972",
        "+39",
        "+225",
        "+1-876",
        "+81",
        "+44-1534",
        "+962",
        "+7",
        "+254",
        "+686",
        "+383",
        "+965",
        "+996",
        "+856",
        "+371",
        "+961",
        "+266",
        "+231",
        "+218",
        "+423",
        "+370",
        "+352",
        "+853",
        "+389",
        "+261",
        "+265",
        "+60",
        "+960",
        "+223",
        "+356",
        "+692",
        "+222",
        "+230",
        "+262",
        "+52",
        "+691",
        "+373",
        "+377",
        "+976",
        "+382",
        "+1-664",
        "+212",
        "+258",
        "+95",
        "+264",
        "+674",
        "+977",
        "+31",
        "+599",
        "+687",
        "+64",
        "+505",
        "+227",
        "+234",
        "+683",
        "+850",
        "+1-670",
        "+47",
        "+968",
        "+92",
        "+680",
        "+970",
        "+507",
        "+675",
        "+595",
        "+51",
        "+63",
        "+64",
        "+48",
        "+351",
        "+1-787, 1-939",
        "+974",
        "+242",
        "+262",
        "+40",
        "+7",
        "+250",
        "+590",
        "+290",
        "+1-869",
        "+1-758",
        "+590",
        "+508",
        "+1-784",
        "+685",
        "+378",
        "+239",
        "+966",
        "+221",
        "+381",
        "+248",
        "+232",
        "+65",
        "+1-721",
        "+421",
        "+386",
        "+677",
        "+252",
        "+27",
        "+82",
        "+211",
        "+34",
        "+94",
        "+249",
        "+597",
        "+47",
        "+268",
        "+46",
        "+41",
        "+963",
        "+886",
        "+992",
        "+255",
        "+66",
        "+228",
        "+690",
        "+676",
        "+1-868",
        "+216",
        "+90",
        "+993",
        "+1-649",
        "+688",
        "+1-340",
        "+256",
        "+380",
        "+971",
        "+44",
        " +1",
        "+598",
        "+998",
        "+678",
        "+379",
        "+58",
        "+84",
        "+681",
        "+212",
        "+967",
        "+260",
        "+263",
      ];
      if (
        updateAccountSettingDto.phoneCountry &&
        !countryCodes.includes(updateAccountSettingDto.phoneCountry)
      ) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "Invalid country code.",
        });
      }

      // Validate date of birth
      if (updateAccountSettingDto.dob) {
        const dob = moment(updateAccountSettingDto.dob, "DD/MM/YYYY", true);
        if (!dob.isValid() || dob.isAfter(moment())) {
          return response.status(HttpStatus.BAD_REQUEST).json({
            message: "Invalid Date Of Birth.",
          });
        }
      }

      // Update user account settings
      await this.userService.updateAccountSettings(
        userId,
        updateAccountSettingDto
      );

      return response.status(HttpStatus.OK).json({
        message: "User has been successfully updated.",
      });
    } catch (err) {
      console.error("Error updating account settings: ", err);
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: "An error occurred while updating account settings.",
      });
    }
  }
  /**
   * Disables Two-Factor Authentication (2FA) for a user by their ID.
   * @param req 
   * @param response 
   * @param param 
   * @returns 
   */
  @SkipThrottle(false)
  @Post("/twoFASMSDisableUser/:id")
  async twoFASMSDisableUser(
    @Req() req: any,
    @Res() response,
    @Param() param: { id: string }
  ) {
    try {
      const user = await this.userModel.findById(param.id).exec();
      if (!user) {
        throw new NotFoundException(`User #${param.id} not found`);
      }
      if (user.is_2FA_SMS_enabled === false) {
        return response
          .status(HttpStatus.BAD_REQUEST)
          .json({message:"This user's SMS 2FA already disabled"});
      }
      user.is_2FA_SMS_enabled = false;
      user.is_2FA_twilio_login_verified = true;
      user.twilioOTP = null;
      user.otpCreatedAt = null;
      user.otpExpiresAt = null;
      await user.save();
      const userObj = await this.userService.getUser(param.id);
      return response.status(HttpStatus.OK).json({
        message: "User's SMS 2FA Disabled successfully",
        User: userObj,
      });
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json(err.response);
    }
  }
}
