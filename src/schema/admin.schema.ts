import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"

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
}	
export const AdminSchema = SchemaFactory.createForClass(Admin);