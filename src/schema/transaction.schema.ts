import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
@Schema()
export class Transaction {
  @Prop()
  tran_id: number;

  @Prop()
  status: string;

  @Prop()
  title: string;

  @Prop()
  do_not_convert: boolean;

  @Prop()
  orderable_type: string;

  @Prop()
  orderable_id: number;

  @Prop()
  price_currency: string;

  @Prop()
  price_amount: string;

  @Prop()
  lightning_network: boolean;

  @Prop()
  receive_currency: string;

  @Prop()
  receive_amount: string;

  @Prop()
  created_at: string;

  @Prop()
  order_id: string;

  @Prop()
  payment_url: string;

  @Prop()
  underpaid_amount: number;

  @Prop()
  overpaid_amount: string;

  @Prop()
  is_refundable: boolean;

  @Prop()
  refunds: string[];

  @Prop()
  voids: string[];

  @Prop()
  fees: string[];

  @Prop()
  token: string;

  @Prop({ default: "Pending" })
  transaction_status: string;

  @Prop()
  wallet_address: string;

  @Prop()
  token_cryptoAmount: string;

  @Prop()
  source: string;

  @Prop()
  paid_at: string;
}
export const TransactionSchema = SchemaFactory.createForClass(Transaction);
