import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { CreateUserDto } from "src/dto/create-users.dto";
import { IUser } from "src/interface/users.interface";
import { Model } from "mongoose";
import { UpdateUserProfileDto } from "src/dto/update-users-profile.dto";
import { ConfigService } from "@nestjs/config";
import { UpdateAccountSettingsDto } from "src/dto/update-account-settings.dto";
import { UpdateKycDataDto } from "src/dto/update-kyc.dto";

@Injectable()
export class UserService {
  
  constructor(
    @InjectModel("user") private userModel: Model<IUser>,
    private configService: ConfigService
  ) {}

  async createUser(CreateUserDto: CreateUserDto): Promise<IUser> {
    const newUser = await new this.userModel(CreateUserDto);
    return newUser.save();
  }

  async updateUser(
    userId: string,
    body: UpdateUserProfileDto,
    file: Express.Multer.File = null,
    bucketName: string = null
  ): Promise<IUser> {
    let key = null;
    if (!!file) {
      const s3 = this.configService.get("s3");
      const bucketName = this.configService.get("aws_s3_bucket_name");
      key = new Date().valueOf() + "_" + file.originalname;

      const params = {
        Bucket: bucketName,
        Key: key,
        Body: file.buffer,
      };

      await new Promise(async (resolve, reject) => {
        await s3.upload(params, async function (err, data) {
          if (!err) {
            return resolve(true);
          } else {
            return reject(false);
          }
        });
      });
    }

    const existingUser = await this.userModel.findByIdAndUpdate(
      userId,
      file ? { ...body, profile: key } : { ...body }
    );
    if (!existingUser) {
      throw new NotFoundException(`User #${userId} not found`);
    }
    return existingUser;
  }

  async updateAccountSettings(
    userId: string,
    body: UpdateAccountSettingsDto
  ): Promise<IUser> {
    const existingUser = await this.userModel.findByIdAndUpdate(userId, {
      ...body,
    });
    if (!existingUser) {
      throw new NotFoundException(`User #${userId} not found`);
    }
    return existingUser;
  }

  async updateKyc(
    userId: string,
    UpdateKycDto: UpdateKycDataDto,
    passport_url: any = null,
    user_photo_url: any = null
  ): Promise<any> {
    let passport_url_key = null;
    if (!!passport_url && !!passport_url.buffer) {
      const s3 = this.configService.get("s3");
      const bucketName = this.configService.get("aws_s3_bucket_name");
      passport_url_key = new Date().valueOf() + "_" + passport_url.originalname;

      const params = {
        Bucket: bucketName,
        Key: passport_url_key,
        Body: passport_url.buffer,
      };

      await new Promise(async (resolve, reject) => {
        await s3.upload(params, async function (err, data) {
          if (!err) {
            return resolve(true);
          } else {
            return reject(false);
          }
        });
      });
    }
    let user_photo_url_key = null;
    if (!!user_photo_url && !!user_photo_url.buffer) {
      const s3 = this.configService.get("s3");
      const bucketName = this.configService.get("aws_s3_bucket_name");
      user_photo_url_key =
        new Date().valueOf() + "_" + user_photo_url.originalname;

      const params = {
        Bucket: bucketName,
        Key: user_photo_url_key,
        Body: user_photo_url.buffer,
      };

      await new Promise(async (resolve, reject) => {
        await s3.upload(params, async function (err, data) {
          if (!err) {
            return resolve(true);
          } else {
            return reject(false);
          }
        });
      });
    }
    const updateObject = { ...UpdateKycDto };
    if (!updateObject.hasOwnProperty("kyc_completed")) {
      updateObject.kyc_completed = true;
    }
    const existingUser = await this.userModel.findByIdAndUpdate(
      userId,
      {
        passport_url: passport_url_key,
        user_photo_url: user_photo_url_key,
        kyc_completed: true,
        updateObject,
      },
      { new: true }
    );
    if (!existingUser) {
      throw new NotFoundException(`User #${userId} not found`);
    }
    return existingUser;
  }

  async getUser(userId: string): Promise<any> {
    const existingUser = await this.userModel
      .findById(userId)
      .select("-_id -__v -nonce")
      .exec();
    if (!existingUser) {
      throw new NotFoundException(`User #${userId} not found`);
    }
    return existingUser;
  }

  async getFindbyAddress(address: string): Promise<any> {
    const caseInsensitiveAddress = new RegExp(`^${address}$`, 'i');
    const existingUser = await this.userModel
      .findOne({ wallet_address: caseInsensitiveAddress })
      .exec();
    return existingUser;
  }

  async deleteUser(userId: string): Promise<IUser> {
    const deletedUser = await this.userModel.findByIdAndDelete(userId);
    if (!deletedUser) {
      throw new NotFoundException(`User #${userId} not found`);
    }
    return deletedUser;
  }

  async getAllUsersExceptAuth(userId: string): Promise<any> {
    const allUsers = await this.userModel.find();
    const existingUser = allUsers.filter((user) => user.id !== userId);
    return existingUser;
  }

  async getUserDetailByAddress(address: string): Promise<any> {
    const caseInsensitiveAddress = new RegExp(`^${address}$`, 'i');
    const existingUser = await this.userModel
      .findOne({ wallet_address: caseInsensitiveAddress })
      .exec();
    if (!existingUser) {
      throw new NotFoundException(`Address #${address} not found`);
    }
    return existingUser;
  }

  async getOnlyUserBioByAddress(address: string): Promise<any> {
    const caseInsensitiveAddress = new RegExp(`^${address}$`, 'i');
    const existingUser = await this.userModel
      .findOne({ wallet_address: caseInsensitiveAddress })
      .select("-_id -nonce -__v")
      .exec();
    if (!existingUser) {
      throw new NotFoundException(`Address #${address} not found`);
    }
    return existingUser;
  }

  async getUserCount(searchQuery: any, statusFilter: any) {
    let userQuery = this.userModel.find();

    if (searchQuery !== "null" && searchQuery !== null) {
      searchQuery = searchQuery.trim();
      const regexQuery = new RegExp(searchQuery);
      userQuery = userQuery.where({
        $or: [
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$wallet_address" },
                regex: regexQuery,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$fname" },
                regex: regexQuery,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$lname" },
                regex: regexQuery,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $concat: ["$fname", " ", "$lname"] },
                regex: regexQuery,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$email" },
                regex: regexQuery,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$phone" },
                regex: regexQuery,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$city" },
                regex: regexQuery,
                options: "i",
              },
            },
          },
        ],
      });
    }

    if (statusFilter !== "All") {
      userQuery = userQuery.where({ status: statusFilter });
    }
    const count = await userQuery.countDocuments();
    return count;
  }

  async getUsers(
    page?: number,
    pageSize?: number,
    querySearch?: any,
    statusFilter?: any
  ): Promise<any> {
    let usersQuery = this.userModel.find();

    if (querySearch !== "null" && querySearch !== null) {
      querySearch = querySearch.trim();
      const regexQuery = new RegExp(querySearch);
      usersQuery = usersQuery.where({
        $or: [
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$wallet_address" },
                regex: regexQuery,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$fname" },
                regex: regexQuery,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$lname" },
                regex: regexQuery,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $concat: ["$fname", " ", "$lname"] },
                regex: regexQuery,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$email" },
                regex: regexQuery,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$phone" },
                regex: regexQuery,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$city" },
                regex: regexQuery,
                options: "i",
              },
            },
          },
        ],
      });
    }
    if (statusFilter !== "All" && statusFilter !== null) {
      usersQuery = usersQuery.where({ status: statusFilter });
    }

    if (page && pageSize) {
      const skipCount = (page - 1) * pageSize;
      usersQuery = usersQuery.skip(skipCount).limit(pageSize);
    }
    usersQuery = usersQuery.select("-google_auth_secret -nonce -wallet_type -__v -is_2FA_login_verified -is_kyc_deleted -referred_by");
    const users = await usersQuery.exec();

    if (!users) {
      throw new NotFoundException(`Users not found`);
    }
    return users;
  }

  async getKycUserCount(searchQuery: any, statusFilter: any) {
    let userQuery = this.userModel.find();

    if (searchQuery !== "null" &&  searchQuery !== null) {
      searchQuery = searchQuery.trim();
      const regexQuery = new RegExp(searchQuery);
      userQuery = userQuery.where({
        $or: [
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$wallet_address" },
                regex: regexQuery,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$fname" },
                regex: regexQuery,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$lname" },
                regex: regexQuery,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $concat: ["$fname", " ", "$lname"] },
                regex: regexQuery,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$email" },
                regex: regexQuery,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$phone" },
                regex: regexQuery,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$city" },
                regex: regexQuery,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$verified_with" },
                regex: regexQuery,
                options: "i",
              },
            },
          },
        ],
      });
    }

    if (statusFilter !== "All") {
      if (statusFilter === "Pending") {
        userQuery = userQuery.where({ is_verified: 0 });
      } else if (statusFilter === "Approved") {
        userQuery = userQuery.where({ is_verified: 1 });
      } else if (statusFilter === "Rejected") {
        userQuery = userQuery.where({ is_verified: 2 });
      }
    }
    const count = await userQuery.countDocuments({ kyc_completed: true });
    return count;
  }

  async getKycUsers(
    page?: number,
    pageSize?: number,
    querySearch?: any,
    statusFilter?: any
  ): Promise<any> {
    let usersQuery = this.userModel.find({
      kyc_completed: true,
    });

    if (querySearch !== "null" && querySearch !== null) {
      querySearch = querySearch.trim();
      const regexQuery = new RegExp(querySearch);
      usersQuery = usersQuery.where({
        $or: [
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$wallet_address" },
                regex: regexQuery,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$fname" },
                regex: regexQuery,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$lname" },
                regex: regexQuery,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $concat: ["$fname", " ", "$lname"] },
                regex: regexQuery,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$email" },
                regex: regexQuery,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$phone" },
                regex: regexQuery,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$city" },
                regex: regexQuery,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$verified_with" },
                regex: regexQuery,
                options: "i",
              },
            },
          },
        ],
      });
    }
    if (statusFilter !== "All" && statusFilter !== null) {
      if (statusFilter === "Pending") {
        usersQuery = usersQuery.where({ is_verified: 0 });
      } else if (statusFilter === "Approved") {
        usersQuery = usersQuery.where({ is_verified: 1 });
      } else if (statusFilter === "Rejected") {
        usersQuery = usersQuery.where({ is_verified: 2 });
      }
    }

    if (page && pageSize) {
      // Calculate the number of documents to skip
      const skipCount = (page - 1) * pageSize;
      usersQuery = usersQuery.skip(skipCount).limit(pageSize);
    }
    usersQuery = usersQuery.select("-google_auth_secret -nonce -wallet_type -__v -is_2FA_login_verified -is_kyc_deleted -referred_by");
    const users = await usersQuery.exec();

    if (!users) {
      throw new NotFoundException(`Users not found`);
    }
    return users;
  }

  async sinceLastWeekUserCount(
    startDate: string,
    endDate: string,
    submittedKyc?: boolean
  ) {
    let usercount;
    if (submittedKyc) {
      usercount = this.userModel.countDocuments({
        kyc_submitted_date: {
          $gte: startDate,
          $lt: endDate,
        },
        kyc_completed: true,
      });
    } else {
      usercount = this.userModel.countDocuments({
        created_at: {
          $gte: startDate,
          $lt: endDate,
        },
      });
    }
    return usercount ? usercount : 0;
  }

  async getFindbyId(userId: string): Promise<any>{
    const existingUser = await this.userModel
    .findById(userId)
    .select("_id email email_verified")
    .exec();
    if(existingUser){
      return existingUser
    }
    return [];
  }

  async getFindbyEmail(email: string): Promise<any>{
    const existingUser = await this.userModel
    .findOne({email})
    .select("_id email email_verified")
    .exec();
    if(existingUser){
      return existingUser
    }
    return [];
  }
}
