import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

@Schema()
export class Token {
	@Prop()
	token: string;

	@Prop()
	roleId: number;
}	
export const TokenSchema = SchemaFactory.createForClass(Token);