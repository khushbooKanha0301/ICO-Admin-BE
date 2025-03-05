import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { ITransaction } from "src/interface/transactions.interface";
import { Model } from "mongoose";
import * as moment from "moment";
import { ISales } from "src/interface/sales.interface";

@Injectable()
export class TransactionsService {
  
  constructor(
    @InjectModel("transaction") private transactionModel: Model<ITransaction>,
    @InjectModel("sales") private salesModel: Model<ISales>
  ) {}

  async getTransaction(
    page?: number,
    pageSize?: number,
    querySearch?: any,
    statusFilter?: any,
    types?: any,
    status?: any
  ): Promise<any> {
    let transactionsQuery = this.transactionModel.find();
    if (querySearch !== "null" && querySearch !== null) {
      querySearch = querySearch.trim();
      if(querySearch !== "" && querySearch !== null)
      {
        const regexQuery = new RegExp(querySearch);
        transactionsQuery = transactionsQuery.where({
          $expr: {
            $regexMatch: {
              input: { $toString: "$transactionHash" },
              regex: regexQuery,
              options: "i",
            },
          },
        });
      }
    }

    if (statusFilter !== "All" && statusFilter !== null) {
      transactionsQuery = transactionsQuery.where({ status: statusFilter });
    }
    if (types && types.length > 0) {
      transactionsQuery = transactionsQuery.where({ source: { $in: types } });
    }
    if (status && status.length > 0) {
      transactionsQuery = transactionsQuery.where({ status: { $in: status } });
    }
    
    if (page && pageSize) {
      const skipCount = (page - 1) * pageSize;
      transactionsQuery = transactionsQuery.skip(skipCount).limit(pageSize);
    }

    const transactions = await transactionsQuery
    .sort({ created_at: "desc" })
    .exec();

    if (!transactions) {
      throw new NotFoundException(`Transactions not found`);
    }

    return transactions;
  }

  async getTransactionByWalletAdd(address?: string): Promise<any> {
    const caseInsensitiveAddress = new RegExp(`^${address}$`, 'i');

    let transactionsQuery = this.transactionModel.find({
      user_wallet_address: caseInsensitiveAddress
    });

    const transactions = await transactionsQuery.exec();

    if (!transactions) {
      throw new NotFoundException(`Address #${address} not found`);
    }
    return transactions;
  }

  async getTotalTransactionAmount() {
    const transactionResult = await this.transactionModel
      .aggregate([
        {
          $match: {
            status: "paid",
            is_sale: true,
            is_process : true
          },
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: { $toDouble: "$price_amount" },
            },
          },
        },
      ])
      .exec();
    return transactionResult && transactionResult[0]?.total
      ? transactionResult[0]?.total
      : 0;
  }

  async getTotalMid() {
    const midCountResult = await this.transactionModel.aggregate([
      {
        $match: {
          status: "paid",
          is_sale: true,
          is_process: true
        }
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: { $toDouble: "$token_cryptoAmount" }
          }
        }
      },
      {
        $project: {
          _id: 0,
          totalAmount: { $round: ["$total", 2] },
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $first: "$totalAmount" }
        }
      },
      {
        $project: {
          _id: 0,
          totalAmount: { $ifNull: ["$totalAmount", 0] }
        }
      }
    ]).exec();
  
    return (midCountResult && midCountResult[0]?.totalAmount)? midCountResult[0].totalAmount: 0;
  }

  async getTotalMidByAddress(address: string) {
    const caseInsensitiveAddress = new RegExp(`^${address}$`, 'i');
    const midCountResult = await this.transactionModel.aggregate([
      {
        $match: {
          status: "paid",
          is_sale: true,
          sale_type: "outside-website",
          is_process: false,
          user_wallet_address: caseInsensitiveAddress
        }
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: { $toDouble: "$token_cryptoAmount" }
          },

        }
      },
      {
        $project: {
          _id: 0,
          totalAmount: { $round: ["$total", 2] },
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $first: "$totalAmount" }
        }
      },
      {
        $project: {
          _id: 0,
          totalAmount: { $ifNull: ["$totalAmount", 0] }
        }
      }
    ]).exec();
  
    return (midCountResult && midCountResult[0]?.totalAmount)? midCountResult[0].totalAmount: 0;
  }

  async getTransactionCount(
    searchQuery: any,
    statusFilter: any,
    types: any,
    status: any
  ) {
    let transactionsQuery = this.transactionModel.find();

    if (searchQuery !== "null" && searchQuery !== null ) {
      searchQuery = searchQuery.trim();
      if(searchQuery !== "" && searchQuery !== null)
      {
        const regexQuery = new RegExp(searchQuery);
        transactionsQuery = transactionsQuery.where({
          $expr: {
            $regexMatch: {
              input: { $toString: "$transactionHash" },
              regex: regexQuery,
              options: "i",
            },
          },
        });
      }
    }

    if (statusFilter !== "All") {
      transactionsQuery = transactionsQuery.where({ status: statusFilter });
    }
    if (status && status.length > 0) {
      transactionsQuery = transactionsQuery.where({ status: { $in: status } });
    }
    if (types && types.length > 0) {
      transactionsQuery = transactionsQuery.where({ source: { $in: types } });
    }
    
    const count = await transactionsQuery.countDocuments();
    return count;
  }

  async getTransactionByOredrId(orderId: string): Promise<any> {
    const transaction = this.transactionModel
    .findOne({ transactionHash: orderId })
      .exec();
    return transaction;
  }

  async getSaleGraphValue(
    filterType: any,
    from_date: any,
    to_date: any
  ): Promise<any> {
    let woToken: {
      status: string;
      is_sale: boolean,
      is_process: boolean,
      created_at: { $gt: any; $lt: any };
    } = {
      status: "paid",
      is_sale: true,
      is_process: true,
      created_at: { $gt: from_date, $lt: to_date },
    };
   
    const transactions = await this.transactionModel
      .aggregate([
        {
          $match: woToken,
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format:
                  filterType === "thisWeekDate" ||
                  filterType === "thisMonthDate" ||
                  filterType === "lastWeek" ||
                  filterType === "lastMonth"
                    ? "%Y-%m-%d"
                    : "%Y-%m",
                date: { $toDate: "$created_at" },
              },
            },
            value: { $sum: 1 },
          },
        },
        {
          $addFields: {
            label: "$_id",
          },
        },
        {
          $sort: {
            label: 1,
          },
        },
      ])
      .exec();
    let mainDates = [];

    if (filterType == "thisWeekDate") {
      const thisWeekStart = moment().startOf("week");
      for (let i = 0; i < 7; i++) {
        const currentDate = thisWeekStart
          .clone()
          .add(i, "days")
          .format("YYYY-MM-DD");
        mainDates.push(currentDate);
      }
    }
    if (filterType == "lastWeek") {
      const previousWeekStart = moment().subtract(1, "weeks").startOf("week");
      for (let i = 0; i < 7; i++) {
        const currentDate = previousWeekStart
          .clone()
          .add(i, "days")
          .format("YYYY-MM-DD");
        mainDates.push(currentDate);
      }
    }
    if (filterType == "lastMonth") {
      const startDate = moment().subtract(1, "month").startOf("month");
      const endDate = moment().subtract(1, "month").endOf("month");
      let currentDatePointer = startDate.clone();

      while (currentDatePointer.isSameOrBefore(endDate, "day")) {
        mainDates.push(currentDatePointer.format("YYYY-MM-DD"));
        currentDatePointer.add(1, "day");
      }
    }
    if (filterType == "last3Months") {
      const currentMonth = moment();
      for (let i = 0; i < 3; i++) {
        const previousMonth = currentMonth.clone().subtract(i + 1, "months");
        const formattedMonth = previousMonth.format("YYYY-MM");
        mainDates.push(formattedMonth);
      }
      mainDates = mainDates.reverse();
    }
    if (filterType == "last6Months") {
      const currentMonth = moment();
      for (let i = 0; i < 6; i++) {
        const previousMonth = currentMonth.clone().subtract(i + 1, "months");
        const formattedMonth = previousMonth.format("YYYY-MM");
        mainDates.push(formattedMonth);
      }
      mainDates = mainDates.reverse();
    }
    if (filterType == "lastYear") {
      const currentYear = moment().year();
      for (let i = 0; i < 12; i++) {
        const previousMonth = moment()
          .year(currentYear - 1)
          .month(i);
        const formattedMonth = previousMonth.format("YYYY-MM");
        mainDates.push(formattedMonth);
      }
    }
    if (filterType === "thisMonthDate") {
      // Calculate dates for the current month
      const thisMonthStart = moment().startOf("month");
      const thisMonthEnd = moment().endOf("month");

      let currentDatePointer = thisMonthStart.clone();
      while (currentDatePointer.isSameOrBefore(thisMonthEnd, "day")) {
        mainDates.push(currentDatePointer.format("YYYY-MM-DD"));
        currentDatePointer.add(1, "day");
      }
    } 
    if (filterType === "thisYearDate") {
      const currentYear = moment().year()
      for (let i = 0; i < 12; i++) {
        const thisMonth = moment().year(currentYear).month(i)
        const formattedMonth = thisMonth.format('YYYY-MM')
        mainDates.push(formattedMonth)
      }
    }

    let data = transactions?.map((trans) => {
      let key = trans.label;
      return { [key]: trans.value };
    });
    data = { ...Object.assign({}, ...data) };

    const result = mainDates?.map((d) => {
      if (data[d]) {
        return { label: d, value: data[d] };
      } else {
        return { label: d, value: 0 };
      }
    });
    return result;
  }

  async getLineGraphTotalToken(
    from_date: any,
    to_date: any
  ): Promise<any> {
    let woToken: {
      status: string;
      is_sale: boolean,
      is_process: boolean,
      created_at: { $gt: any; $lt: any };
    } = {
      status: "paid",
      is_sale: true,
      is_process: true,
      created_at: { $gt: from_date, $lt: to_date },
    };

    let totalToken = await this.transactionModel
      .aggregate([
        {
          $match: woToken,
        },
        {
          $group: {
            _id: null,
            totalToken: { $sum: 1 },
          },
        },
      ])
      .exec();
    totalToken =
      totalToken.length && totalToken[0] ? totalToken[0].totalToken : 0;
    return totalToken;
  }

  async getLineGraphValue(
    filterType: any,
    from_date: any,
    to_date: any
  ): Promise<any> {
    let woToken: {
      status: string;
      is_sale: boolean,
      is_process: boolean,
      created_at: { $gt: any; $lt: any };
    } = {
      status: "paid",
      is_sale: true,
      is_process: true,
      created_at: { $gt: from_date, $lt: to_date },
    };
    const transactions = await this.transactionModel
      .aggregate([
        {
          $match: woToken,
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format:
                  filterType === "thisWeekDate" ||
                  filterType === "thisMonthDate" ||
                  filterType === "lastWeek" ||
                  filterType === "lastMonth"
                    ? "%Y-%m-%d"
                    : "%Y-%m",
                date: { $toDate: "$created_at" },
              },
            },
            value: { $sum: 1 },
          },
        },
        {
          $addFields: {
            label: "$_id",
          },
        },
        {
          $sort: {
            label: 1,
          },
        },
      ])
      .exec();
    const mainDates = [];

    if (filterType == "thisWeekDate") {
      const thisWeekStart = moment().subtract(1, "weeks").startOf("week");
      for (let i = 0; i < 7; i++) {
        const currentDate = thisWeekStart
          .clone()
          .add(i, "days")
          .format("YYYY-MM-DD");
        mainDates.push(currentDate);
      }
    }
    if (filterType == "lastWeek") {
      const previousWeekStart = moment().subtract(2, "weeks").startOf("week");
      for (let i = 0; i < 7; i++) {
        const currentDate = previousWeekStart
          .clone()
          .add(i, "days")
          .format("YYYY-MM-DD");
        mainDates.push(currentDate);
      }
    }
    if (filterType == "lastMonth") {
      const startDate = moment().subtract(2, "month").startOf("month");
      const endDate = moment().subtract(2, "month").endOf("month");
      let currentDatePointer = startDate.clone();

      while (currentDatePointer.isSameOrBefore(endDate, "day")) {
        mainDates.push(currentDatePointer.format("YYYY-MM-DD"));
        currentDatePointer.add(1, "day");
      }
    }
    if (filterType == "last3Months") {
      const currentMonth = moment();
      for (let i = 3; i < 6; i++) {
        const previousMonth = currentMonth.clone().subtract(i + 1, "months");
        const formattedMonth = previousMonth.format("YYYY-MM");
        mainDates.push(formattedMonth);
      }
    }
    if (filterType == "last6Months") {
      const currentMonth = moment();
      for (let i = 6; i < 12; i++) {
        const previousMonth = currentMonth.clone().subtract(i + 1, "months");
        const formattedMonth = previousMonth.format("YYYY-MM");
        mainDates.push(formattedMonth);
      }
    }
    if (filterType == "lastYear") {
      const currentYear = moment().year();
      for (let i = 0; i < 12; i++) {
        const previousMonth = moment()
          .year(currentYear - 2)
          .month(i);
        const formattedMonth = previousMonth.format("YYYY-MM");
        mainDates.push(formattedMonth);
      }
    }
    if (filterType === "thisMonthDate") {
      // Calculate dates for the current month
      const thisMonthStart = moment().startOf("month");
      const thisMonthEnd = moment().endOf("month");

      let currentDatePointer = thisMonthStart.clone();
      while (currentDatePointer.isSameOrBefore(thisMonthEnd, "day")) {
        mainDates.push(currentDatePointer.format("YYYY-MM-DD"));
        currentDatePointer.add(1, "day");
      }
    } 
    if (filterType === "thisYearDate") {
      const currentYear = moment().year()
      for (let i = 0; i < 12; i++) {
        const thisMonth = moment().year(currentYear).month(i)
        const formattedMonth = thisMonth.format('YYYY-MM')
        mainDates.push(formattedMonth)
      }
    }

    let data = transactions?.map((trans) => {
      let key = trans.label;
      return { [key]: trans.value };
    });
    data = { ...Object.assign({}, ...data) };

    const result = mainDates?.map((d) => {
      if (data[d]) {
        return { label: d, value: data[d] };
      } else {
        return { label: d, value: 0 };
      }
    });
    return result;
  }

  async getSaleGraphTotalToken(
    from_date: any,
    to_date: any
  ): Promise<any> {
    let woToken: {
      status: string,
      is_sale: boolean,
      is_process: boolean,
      created_at: { $gt: any; $lt: any };
    } = {
      status: "paid",
      is_sale: true,
      is_process: true,
      created_at: { $gt: from_date, $lt: to_date },
    };

    let totalToken = await this.transactionModel
      .aggregate([
        {
          $match: woToken,
        },
        {
          $group: {
            _id: null,
            totalToken: { $sum: 1 },
          },
        },
      ])
      .exec();
    totalToken =
      totalToken.length && totalToken[0] ? totalToken[0].totalToken : 0;
    return totalToken;
  }

  async getTokenCount() {
    let whereQuery: {
      status: any;
      is_sale: boolean;
      is_process: boolean,
    } = {
      status: "paid",
      is_sale: true,
      is_process: true
    };

    const tokenCountResult = await this.transactionModel.aggregate([
      {
        $match:whereQuery
      },
      {
        $group: {
          _id: '$price_currency',
          total: {
            $sum: { $toDouble: "$token_cryptoAmount" }
          }
        }
      },
    ]).exec();
    return tokenCountResult;
  }

  async getUsdtCount() {
    let whereQuery: {
      status: any;
      is_sale: boolean;
      is_process: boolean,
    } = {
      status: "paid",
      is_sale: true,
      is_process: true
    };
   
    const tokenCountResult = await this.transactionModel.aggregate([
      {
        $match:whereQuery
      },
      {
        $group: {
          _id: '$price_currency',
          total: {
            $sum: { $toDouble: "$price_amount" }
          }
        }
      },
    ]).exec();
    return tokenCountResult;
  }

  async getTransactionCountBasedDate(startDate, endDate) {
    let transactionCount = this.transactionModel.countDocuments({
      created_at: {
        $gte: startDate,
        $lt: endDate,
      },
    });
    return transactionCount ? transactionCount : 0;
  }

  async getSales(){
    return await this.salesModel.aggregate([
      {
        $group: {
          _id: null,
          total: {
            $sum: { $toDouble: "$total_token" }
          }
        }
      },
    ]).exec();
  }

  async getCurrentSales() {
    const currentDate = moment.utc().format();
    return await this.salesModel
      .findOne({
        $and: [
          { start_sale: { $lte: currentDate } },
          { end_sale: { $gte: currentDate } },
        ],
      })
    .exec();
  }
}
