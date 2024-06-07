import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

@Schema()
export class Transaction {
  @Prop()
	transactionHash: string;

	@Prop()
	status: string;

	@Prop()
	user_wallet_address: string;

	@Prop()
	receiver_wallet_address: string;
	
	@Prop()
	price_currency: string;

	@Prop()
	receive_currency: string;

	@Prop()
	price_amount: string;

	@Prop()
	token_cryptoAmount: string;

	@Prop()
	gasUsed: string;

	@Prop()
	effectiveGasPrice: string;

	@Prop()
	cumulativeGasUsed: string;
	
	@Prop()
	blockNumber: string;

	@Prop()
	blockHash: string;

	@Prop()
	created_at: string;
	
	@Prop()
	paid_at: string;

	@Prop()
	source: string;

	@Prop()
	usd_amount: string;
}
export const TransactionSchema = SchemaFactory.createForClass(Transaction);
