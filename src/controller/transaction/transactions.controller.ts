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
import { SkipThrottle } from "@nestjs/throttler";
const moment = require("moment");

@SkipThrottle()
@Controller("transactions")
export class TransactionsController {
  constructor(
    private readonly transactionService: TransactionsService,
  ) {}

  /**
   * This API endpoint that retrieves transactions based on various parameters
   * @param req
   * @param response
   * @returns
   */
  @Post("/getTransactions")
  async getTransactions(@Req() req, @Res() response) {
    try {
      const page = req.query.page ? req.query.page : 1;
      const pageSize = req.query.pageSize ? req.query.pageSize : 10;
      const searchQuery =
        req.query.query !== undefined ? req.query.query : null;
      const statusFilter = req.query.statusFilter
        ? req.query.statusFilter
        : null;
      const types = req.body.types ? req.body.types : null;
      const status = req.body.status ? req.body.status : null;

      const [transactions, transactionsCount] = await Promise.all([
        this.transactionService.getTransaction(
          page,
          pageSize,
          searchQuery,
          statusFilter,
          types,
          status
        ),
        this.transactionService.getTransactionCount(
          searchQuery,
          statusFilter,
          types,
          status
        ),
      ]);

      if (!transactions) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: "Something went wrong",
        });
      }

      return response.status(HttpStatus.OK).json({
        message: "Transactions retrieved successfully",
        transactions,
        totalTransactionsCount: transactionsCount,
      });
    } catch (error) {
      console.error("Error fetching transactions:", error);
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: "An error occurred while fetching transactions",
      });
    }
  }

  /**
   * Retrieves sale graph values based on the provided options and date range.
   * @param req
   * @param response
   * @returns
   */
  @Post("/getSaleGrapthValues")
  async getSaleGrapthValues(@Req() req: any, @Res() response) {
    try {
      const option = req.body.option;
      const from_date = req.body.from_date;
      const to_date = req.body.to_date;
      const transactionData = await this.transactionService.getSaleGraphValue(
        option,
        from_date,
        to_date
      );
      const totalToken = await this.transactionService.getSaleGraphTotalToken(
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

  /**
   * Retrieves line graph values based on the provided options and date range.
   * @param req
   * @param response
   * @returns
   */
  @Post("/getLineGrapthValues")
  async getLineGrapthValues(@Req() req: any, @Res() response) {
    try {
      const option = req.body.option;
      const from_date = req.body.from_date;
      const to_date = req.body.to_date;
      const transactionData = await this.transactionService.getLineGraphValue(
        option,
        from_date,
        to_date
      );
      const totalToken = await this.transactionService.getLineGraphTotalToken(
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

  /**
   * This API endpoint that retrieves transactions based on order id.
   * @param req
   * @param response
   * @param param
   * @returns
   */
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

  /**
   * This API endpoint retrieves the total token count for each supported currency (GBP, AUD, EUR)
   * @param req
   * @param response
   * @returns
   */
  @Get("/getTokenCount")
  async getTokenCount(@Req() req: any, @Res() response) {
    try {
      // Fetch token count data
      let currencyData = await this.transactionService.getTokenCount();
      currencyData = Object.assign(
        {},
        ...currencyData.map((obj) => ({ [obj._id]: obj.total }))
      );
      const totalUserCount = currencyData["USDT"]
        ? currencyData["USDT"].toFixed(2)
        : "0.00";

      // Fetch USDT count data
      let usdtData = await this.transactionService.getUsdtCount();
      usdtData = Object.assign(
        {},
        ...usdtData.map((obj) => ({ [obj._id]: obj.total }))
      );
      const totalUsdtCount = usdtData["USDT"]
        ? usdtData["USDT"].toFixed(2)
        : "0.00";

      const totalTokenCount = { totalUserCount, totalUsdtCount };

      // Return success response
      return response.status(HttpStatus.OK).json({
        message: "Total Amount fetched successfully",
        totalTokenCount,
      });
    } catch (err) {
      // Log error for debugging
      console.error(err);

      // Return error response
      return response.status(HttpStatus.BAD_REQUEST).json({
        message: "Something went wrong",
        error: err.message || "Unknown error",
      });
    }
  }

  /**
   * This API endpoint retrieves the transaction
   * @param req
   * @param response
   * @returns
   */
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

  /**
   *
   * @param req
   * @param response
   * @returns
   */
  @Get("/checkSale")
  async checkSale(@Req() req: any, @Res() response) {
    const sales = await this.transactionService.getSales();
    if (sales) {
      return response.status(HttpStatus.OK).json({
        message: "Sales get successfully",
        sales: sales[0],
      });
    } else {
      return response.status(HttpStatus.OK).json({
        message: "Sale Not Found",
        sales: null,
      });
    }
  }
}
