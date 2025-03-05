import { Injectable , NotFoundException} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { IAdmin } from "src/interface/admins.interface";
import { Model } from "mongoose";
import { MailerService } from "@nestjs-modules/mailer";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from 'bcrypt';
import { CreateAdminDto } from "src/dto/create-admin.dto";
import { UpdateAdminDto } from "src/dto/update-admin.dto";

@Injectable()
export class AdminService {
  constructor(
    @InjectModel("admin") private adminModel: Model<IAdmin>,
    private readonly mailerService: MailerService,
    private configService: ConfigService
  ) {}

  async getAllSubmins(
    page?: number,
    pageSize?: number,
    querySearch?: any
  ): Promise<any> {
    let adminsQuery = this.adminModel.find({ role_id: 3 }).select("-password -role_id -role_name");
    if (querySearch !== "null" && querySearch !== null) {
      querySearch = querySearch.trim();

      if(querySearch !== "" && querySearch !== null)
      {
        const regexQuery = new RegExp(querySearch);
        adminsQuery = adminsQuery.where({
          $or: [
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
                  input: { $toString: "$username" },
                  regex: regexQuery,
                  options: "i",
                },
              },
            },
            {
              $expr: {
                $regexMatch: {
                  input: { $toString: "$ipAddress" },
                  regex: regexQuery,
                  options: "i",
                },
              },
            }
          ],
        });
      }
    }
    
    if (page && pageSize) {
      const skipCount = (page - 1) * pageSize;
      adminsQuery = adminsQuery.skip(skipCount).limit(pageSize);
    }

    const admins = await adminsQuery
    .sort({ createdAt: "desc" })
    .exec();

    if (!admins) {
      throw new NotFoundException(`Admins not found`);
    }

    return admins;
  }

  async getAllSubminsCount(
    searchQuery: any
  ) {
    let adminsQuery = this.adminModel.find({ role_id: 3 }).select("-password -role_id -role_name");

    if (searchQuery !== "null" && searchQuery !== null ) {
      searchQuery = searchQuery.trim();
      if(searchQuery !== "" && searchQuery !== null)
      {
        const regexQuery = new RegExp(searchQuery);
        adminsQuery = adminsQuery.where({
          $or: [
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
                  input: { $toString: "$username" },
                  regex: regexQuery,
                  options: "i",
                },
              },
            },
            {
              $expr: {
                $regexMatch: {
                  input: { $toString: "$ipAddress" },
                  regex: regexQuery,
                  options: "i",
                },
              },
            }
          ]
        });
      }
    }
  
    const count = await adminsQuery.countDocuments();
    return count;
  }

  async createUser(CreateAdminDto: CreateAdminDto): Promise<IAdmin> {
    const newUser = await new this.adminModel(CreateAdminDto);
    return newUser.save();
  }

  async updateSubAdmin(
    userId: string,
    body: UpdateAdminDto
  ): Promise<IAdmin> {
    const existingUser = await this.adminModel.findByIdAndUpdate(userId, {
      ...body,
    });
    if (!existingUser) {
      throw new NotFoundException(`User #${userId} not found`);
    }
    return existingUser;
  }
  
  async adminLogin(userName: string, password: string): Promise<any> {
    const user = await this.adminModel.findOne({
      username: userName
    });
    if(!user)
    {
      return false;
    }
    let passwordResult = await this.comparePasswords(password,user.password);
    if(!passwordResult)
    {
      return false;
    }
    return user;
  }

  async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  async comparePasswords(
    password: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  async forgotPassword(email: string) {
    const otp = Math.floor(100000 + Math.random() * 900000);
    const updatedUser = await this.adminModel.findOneAndUpdate(
      { username: email },
      { $set: { otp: otp } },
      { new: true }
    );
    const appurl = this.configService.get("app_url");
    await this.mailerService.sendMail({
      to: email,
      subject: "Middn :: Forgot Password",
      template: "forgot-password",
      context: {
        title: "Forgot Password",
        message: "message",
        otp: otp
      },
    });
    return updatedUser;
  }

  async fetchAdmin(email: string) {
    return await this.adminModel.findOne({
      username: email
    });
  }
}
