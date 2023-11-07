import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { integer } from "aws-sdk/clients/cloudfront";
@Schema()
export class User {
  @Prop()
  fname: string;
  @Prop()
  mname: string;
  @Prop()
  lname: string;
  @Prop()
  dob: string;
  @Prop()
  fullname: string;
  @Prop()
  phone: string;
  @Prop()
  phoneCountry: string;
  @Prop()
  email: string;
  @Prop()
  currentpre: string;
  @Prop()
  city: string;
  @Prop()
  location: string;
  @Prop()
  wallet_address: string;
  @Prop()
  wallet_type: string;
  @Prop()
  nonce: string;
  @Prop()
  bio: string;
  @Prop()
  profile: string;
  @Prop()
  created_at: string;
  @Prop()
  updated_at: string;
  @Prop()
  nationality: string;
  @Prop()
  res_address: string;
  @Prop()
  postal_code: string;
  @Prop()
  country_of_issue: string;
  @Prop()
  verified_with: string;
  @Prop()
  passport_url: string;
  @Prop()
  user_photo_url: string;
  @Prop({ default: 0 })
  is_verified: number;
  @Prop({ default: false })
  kyc_completed: boolean;
  @Prop({ default: "Active" })
  status: string;
  @Prop({ default: false })
  is_kyc_deleted: boolean;
  @Prop()
  admin_checked_at: string;
  @Prop()
  is_2FA_enabled: boolean;
  @Prop()
  is_2FA_login_verified: boolean;
  @Prop()
  google_auth_secret: string;
}
export const UserSchema = SchemaFactory.createForClass(User);
