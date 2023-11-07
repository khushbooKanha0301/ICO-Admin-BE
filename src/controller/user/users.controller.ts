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
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { IUser } from "src/interface/users.interface";
import { MailerService } from "@nestjs-modules/mailer";
import { IAdmin } from "src/interface/admins.interface";
import { ITransaction } from "src/interface/transactions.interface";
import { UpdateAccountSettingsDto } from "src/dto/update-account-settings.dto";
import { SkipThrottle } from "@nestjs/throttler";
const moment = require("moment");
const rp = require("request-promise-native");
@SkipThrottle()
@Controller("users")
export class UsersController {
  constructor(
    private readonly userService: UserService,
    private readonly configService: ConfigService,
    @InjectModel("user") private userModel: Model<IUser>,
    private readonly mailerService: MailerService,
    @InjectModel("admin") private adminModel: Model<IAdmin>,
    @InjectModel("transaction") private transactionModel: Model<ITransaction>
  ) {}

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
  
  @SkipThrottle(false)
  @Get("/acceptKyc/:id")
  async acceptKyc(
    @Req() req: any,
    @Res() response,
    @Param() param: { id: string }
  ) {
    try {
      let currentDate = moment.utc().format();
      const userData = await this.userModel.findById(param.id);
      if (!userData) {
        throw new NotFoundException(`KYC not found`);
      }
      if(userData?.is_kyc_deleted)
      {
        throw new BadRequestException("KYC not found")
      }
      if(userData?.is_verified === 1)
      {
        throw new BadRequestException("User's KYC already Approved");
      }
      if (userData?.is_verified === 2) {
        throw new BadRequestException("User's KYC already Rejected");
      }
      const users = await this.userModel
        .updateOne(
          { _id: param.id },
          { is_verified: 1, admin_checked_at: currentDate }
        )
        .exec();
      if (!users) {
        throw new NotFoundException(`Users not found`);
      }
      return response.status(HttpStatus.OK).json({
        message: "User found successfully",
        users: users,
      });
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json(err.response);
    }
  }

  @SkipThrottle(false)
  @Post("/rejectKyc/:id")
  async rejectKyc(
    @Req() req: any,
    @Res() response,
    @Param() param: { id: string }
  ) {
    try {
      const user = await this.userModel.findById(param.id).exec();
      if (!user) {
        throw new NotFoundException(`KYC not found`);
      }
      if(user?.is_kyc_deleted)
      {
        throw new BadRequestException("KYC not found")
      }
      if(user?.is_verified === 1)
      {
        throw new BadRequestException("User's KYC already Approved");
      }
      if (user?.is_verified === 2) {
        throw new BadRequestException("User's KYC already Rejected");
      }
      let currentDate = moment.utc().format();
      const users = await this.userModel
        .updateOne(
          { _id: param.id },
          { is_verified: 2, admin_checked_at: currentDate }
        )
        .exec();
      if (user.email) {
        this.mailerService.sendMail({
          to: user?.email,
          subject: "Middn :: Your KYC has been rejected",
          template: "message",
          context: {
            title: "Sorry !!! Your KYC has been Rejected",
            message: req.body.message ? req.body.message : "Reason not added",
          },
        }).catch((error)=>{
          console.log(error);
        });
      }
      if (!users) {
        throw new NotFoundException(`Users not found`);
      }
      return response.status(HttpStatus.OK).json({
        message: "User found successfully",
        users: users,
      });
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json(err.response);
    }
  }

  @SkipThrottle(false)
  @Post("/suspendUser/:id")
  async suspendUser(
    @Req() req: any,
    @Res() response,
    @Param() param: { id: string }
  ) {
    try {
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
          .json({message:"This user's 2FA already disabled"});
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

  @SkipThrottle(false)
  @Get("/deleteUser/:id")
  async deleteUser(
    @Req() req: any,
    @Res() response,
    @Param() param: { id: string }
  ) {
    try {
      const userData = await this.userModel.findById(param.id);
      if (!userData) {
        throw new NotFoundException(`User already Deleted`);
      }
      const transaction = await this.transactionModel
        .deleteMany({ wallet_address: userData?.wallet_address })
        .exec();
      const user = await this.userModel.findByIdAndDelete(param.id).exec();

      return response.status(HttpStatus.OK).json({
        message: "User deleted successfully...",
      });
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json(err.response);
    }
  }

  @SkipThrottle(false)
  @Get("/deleteKyc/:id")
  async deleteKyc(
    @Req() req: any,
    @Res() response,
    @Param() param: { id: string }
  ) {
    try {
      const userData = await this.userModel.findById(param.id);
      if(!userData)
      {
        throw new NotFoundException(`KYC not found`);
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

  @Get("/viewUser/:id")
  async viewUser(
    @Req() req: any,
    @Res() response,
    @Param() param: { id: string }
  ) {
    try {
      const user = await this.userModel.findById(param.id).select("-referred_by -wallet_type -nonce -is_2FA_login_verified -__v -google_auth_secret").exec();
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

  @Get("/viewKyc/:id")
  async viewKyc(
    @Req() req: any,
    @Res() response,
    @Param() param: { id: string }
  ) {
    try {
      const user = await this.userModel.findById(param.id).select("-referred_by -wallet_type -nonce -is_2FA_login_verified -__v -google_auth_secret").exec();
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

  @Get("/getUsersCount")
  async getUsersCount(@Res() response, @Req() req: any) {
    try {
      const totalUser = await this.userModel.countDocuments().exec();
      const totalKYCUser = await this.userModel
        .countDocuments({ kyc_completed: true })
        .exec();
      var today = moment.utc().format();
      var lastWeekStartDate = moment
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
  @SkipThrottle(false)
  @Put("/updateAccountSettings/:address")
  async updateAccountSettings(
    @Req() req: any,
    @Res() response,
    @Body() updateAccountSettingDto: UpdateAccountSettingsDto,
    @Param("address") address: string
  ) {
    try {
      let userDetails = await this.userService.getFindbyAddress(address);
      if(!userDetails)
      {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "User not found.",
        });
      }
      updateAccountSettingDto.fname = updateAccountSettingDto.fname.trim();
      updateAccountSettingDto.lname = updateAccountSettingDto.lname.trim();
      updateAccountSettingDto.email = updateAccountSettingDto.email.trim();
      updateAccountSettingDto.phone = updateAccountSettingDto.phone.trim();
      updateAccountSettingDto.city = updateAccountSettingDto.city.trim();
      updateAccountSettingDto.res_address = updateAccountSettingDto.res_address.trim();

      const UserId = userDetails._id.toString();
      if (
        updateAccountSettingDto.phone &&
        !updateAccountSettingDto.phone.match("^[0-9]{5,10}$")
      ) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "Invalid Phone.",
        });
      }

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

      let validRegex =
        /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
      if (
        updateAccountSettingDto.email &&
        !updateAccountSettingDto.email.match(validRegex)
      ) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "Invalid E-mail address.",
        });
      }

      const countryCode = [
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
        !countryCode.includes(updateAccountSettingDto.phoneCountry)
      ) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "Invalid country code.",
        });
      }

      if (updateAccountSettingDto.dob) {
        if (
          !moment(updateAccountSettingDto.dob, "DD/MM/YYYY", true).isValid()
        ) {
          return response.status(HttpStatus.BAD_REQUEST).json({
            message: "Invalid Date Of Birth.",
          });
        }

        const currentDate = moment();
        const parsedGivenDate = moment(updateAccountSettingDto.dob, "DD/MM/YYYY");
        if (parsedGivenDate.isAfter(currentDate)) {
          return response.status(HttpStatus.BAD_REQUEST).json({
            message: "Invalid Date Of Birth.",
          });
        }
      }

      await this.userService.updateAccountSettings(
        UserId,
        updateAccountSettingDto
      );
      return response.status(HttpStatus.OK).json({
        message: "Users has been successfully updated.",
      });
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json(err.response);
    }
  }
}
