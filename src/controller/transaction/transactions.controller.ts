import {
  Controller,
  Post,
  HttpStatus,
  Res,
  Req,
  Get,
  Param,
} from "@nestjs/common";
import { TransactionsService } from "src/service/transaction/transactions.service";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { ITransaction } from "src/interface/transactions.interface";
import { IUser } from "src/interface/users.interface";
import { SkipThrottle } from "@nestjs/throttler";

const moment = require("moment");
@SkipThrottle()
@Controller("transactions")
export class TransactionsController {
  constructor(
    private readonly transactionService: TransactionsService,
    @InjectModel("transaction") private transactionModel: Model<ITransaction>,
    @InjectModel("user") private userModel: Model<IUser>
  ) {}

  @Post("/getTransactions")
  async getTransactions(@Req() req, @Res() response) {
    const page = req.query.page ? req.query.page : 1;
    const pageSize = req.query.pageSize ? req.query.pageSize : 10;
    const searchQuery = req.query.query !== undefined ? req.query.query : null;
    const statusFilter = req.query.statusFilter ? req.query.statusFilter : null;
    const types = req.body.types ? req.body.types : null;
    const status = req.body.status ? req.body.status : null;
    const transactions = await this.transactionService.getTransaction(
      page,
      pageSize,
      searchQuery,
      statusFilter,
      types,
      status
    );

    const transactionsCount = await this.transactionService.getTransactionCount(
      searchQuery,
      statusFilter,
      types,
      status
    );
    if (transactions) {
      return response.status(HttpStatus.OK).json({
        message: "Transactions get successfully",
        transactions: transactions,
        totalTransactionsCount: transactionsCount,
      });
    } else {
      return response.status(HttpStatus.BAD_REQUEST).json({
        message: "Something went wrong",
      });
    }
  }

  @Post("/getSaleGrapthValues")
  async getSaleGrapthValues(@Req() req: any, @Res() response) {
    try {
      const option = req.body.option;
      const from_date = req.body.from_date;
      const to_date = req.body.to_date;
      const transactionData = await this.transactionService.getSaleGraphValue(
        req.headers.authData.verifiedAddress,
        option,
        from_date,
        to_date
      );
      const totalToken = await this.transactionService.getSaleGraphTotalToken(
        req.headers.authData.verifiedAddress,
        from_date,
        to_date
      );
      if (transactionData) {
        return response.status(HttpStatus.OK).json({
          message: "get TotalAmount Amount Successfully",
          transactionData: transactionData,
          totalToken: totalToken,
        });
      } else {
        return response.status(HttpStatus.OK).json({
          message: "Something went wrong",
        });
      }
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json({
        message: "Something went wrong",
      });
    }
  }

  @Post("/getLineGrapthValues")
  async getLineGrapthValues(@Req() req: any, @Res() response) {
    try {
      const option = req.body.option;
      const from_date = req.body.from_date;
      const to_date = req.body.to_date;
      const transactionData = await this.transactionService.getLineGraphValue(
        req.headers.authData.verifiedAddress,
        option,
        from_date,
        to_date
      );
      const totalToken = await this.transactionService.getLineGraphTotalToken(
        req.headers.authData.verifiedAddress,
        from_date,
        to_date
      );
      if (transactionData) {
        return response.status(HttpStatus.OK).json({
          message: "get TotalAmount Amount Successfully",
          transactionData: transactionData,
          totalToken: totalToken,
        });
      } else {
        return response.status(HttpStatus.OK).json({
          message: "Something went wrong",
        });
      }
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json({
        message: "Something went wrong",
      });
    }
  }

  @Get("/getTransactionByOrderId/:orderId")
  async getTransactionByOrderId(
    @Req() req: any,
    @Res() response,
    @Param() param: { orderId: string }
  ) {
    try {
      const transactionData =
        await this.transactionService.getTransactionByOredrId(param.orderId);
      if (transactionData) {
        return response.status(HttpStatus.OK).json({
          message: "get TotalAmount Amount Successfully",
          transactionData: transactionData,
        });
      } else {
        return response.status(HttpStatus.OK).json({
          message: "Something went wrong",
        });
      }
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json({
        message: "Something went wrong",
      });
    }
  }

  @Get("/getTokenCount")
  async getTokenCount(@Req() req: any, @Res() response) {
    try {
      let currencyData = await this.transactionService.getTokenCount(
        req.headers.authData.verifiedAddress
      );
      currencyData = currencyData.map((obj) => {
        return { [obj._id]: obj.total };
      });
      currencyData = Object.assign({}, ...currencyData);
      const tokenData = {
        gbpCount: currencyData["GBP"] ? currencyData["GBP"].toFixed(2) : "0.00",
        audCount: currencyData["AUD"] ? currencyData["AUD"].toFixed(2) : "0.00",
        eurCount: currencyData["EUR"] ? currencyData["EUR"].toFixed(2) : "0.00",
      };
      if (tokenData) {
        return response.status(HttpStatus.OK).json({
          message: "get TotalAmount Amount Successfully",
          tokenData: tokenData,
        });
      } else {
        return response.status(HttpStatus.OK).json({
          message: "Something went wrong",
        });
      }
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json({
        message: "Something went wrong",
      });
    }
  }

  @Get("/getDashboardTransactionData")
  async getDashboardTransactionData(@Req() req: any, @Res() response) {
    try {
      const totalAmount =
        await this.transactionService.getTotalTransactionAmount();
      var today = moment.utc().format();
      var lastWeekStartDate = moment
        .utc()
        .subtract(1, "weeks")
        .startOf("week")
        .format();
      const sinceLastWeekSale =
        await this.transactionService.getTransactionCountBasedDate(
          lastWeekStartDate,
          today
        );
      return response.status(HttpStatus.OK).json({
        message: "get TotalAmount Amount Successfully",
        amountCollected: totalAmount,
        sinceLastWeekSale: sinceLastWeekSale,
      });
    } catch (err) {
      return response.status(HttpStatus.BAD_REQUEST).json({
        message: "Something went wrong",
      });
    }
  }
}
