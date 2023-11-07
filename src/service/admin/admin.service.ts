import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { IAdmin } from "src/interface/admins.interface";
import { Model } from "mongoose";
import { MailerService } from "@nestjs-modules/mailer";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel("admin") private adminModel: Model<IAdmin>,
    private readonly mailerService: MailerService,
    private configService: ConfigService
  ) {}
  async adminLogin(userName: string, password: string): Promise<any> {
    const user = await this.adminModel.findOne({
      username: userName,
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
        otp: otp,
        // appurl: appurl,
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
