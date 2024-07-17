import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

@Schema()
export class Permission {
	@Prop()
	permission_id: number;

	@Prop()
	permission_name: string;

	@Prop()
	createdAt: string;

	@Prop()
	updateAt: string;
}	
export const PermissionSchema = SchemaFactory.createForClass(Permission);