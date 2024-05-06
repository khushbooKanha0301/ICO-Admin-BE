import { Document } from "mongoose";

export interface ITransaction extends Document {
  readonly tran_id: number;
  readonly status: string;
  readonly title: string;
  readonly do_not_convert: boolean;
  readonly orderable_type: string;
  readonly orderable_id: number;
  readonly price_currency: string;
  readonly price_amount: string;
  readonly lightning_network: boolean;
  readonly receive_currency: string;
  readonly receive_amount: string;
  readonly created_at: string;
  readonly order_id: string;
  readonly payment_url: string;
  readonly underpaid_amount: string;
  readonly overpaid_amount: string;
  readonly is_refundable: boolean;
  readonly refunds: string[];
  readonly voids: string[];
  readonly fees: string[];
  readonly token: string;
  readonly transaction_status: string;
  readonly wallet_address: string;
  readonly token_cryptoAmount: string;
  readonly source: string;
  readonly paid_at: string;
}
