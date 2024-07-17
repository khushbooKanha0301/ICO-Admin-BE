import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

@Schema()
export class Admin {
	@Prop()
	fname: string;
	@Prop()
	lname: string;
	@Prop()
	username: string;
	@Prop()
	password: string;
	@Prop()
	otp: number;
	@Prop()
	access: string;
	@Prop({ default: 3 })
	role_id: number;
	@Prop({ default: "sub-admin"})
	role_name: string;

	@Prop({ type: [{ permission_id: Number, permission_name: String }] })
	permissions: { permission_id: number; permission_name: string }[];
	@Prop()
	ipAddress: string;
	@Prop()
    createdAt: string;
	@Prop()
	updatedAt: string;
}	
export const AdminSchema = SchemaFactory.createForClass(Admin);