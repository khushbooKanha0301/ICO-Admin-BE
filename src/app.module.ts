import { Module, MiddlewareConsumer } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { UsersController } from "./controller/user/users.controller";
import { AuthController } from "./controller/auth/auth.controller";
import { UserSchema } from "./schema/user.schema";
import { UserService } from "./service/user/users.service";
import { AuthenticateMiddleware } from "./middleware/authenticate.middleware";
import { ConfigModule } from "@nestjs/config";
import { TokenService } from "./service/token/token.service";
import { EmailService } from "./service/email/email.service";
import { TokenSchema } from "./schema/token.schema";
import { AdminService } from "./service/admin/admin.service";
import { AdminSchema } from "./schema/admin.schema";
import { PermissionSchema } from "./schema/permission.schema";
import { MailerModule } from "@nestjs-modules/mailer";
import { join } from "path";
import { HandlebarsAdapter } from "@nestjs-modules/mailer/dist/adapters/handlebars.adapter";
import { TransactionsController } from "./controller/transaction/transactions.controller";
import { TransactionsService } from "./service/transaction/transactions.service";
import { TransactionSchema } from "./schema/transaction.schema";
import { SalesSchema } from "./schema/sales.schema";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { CustomThrottleMiddleware } from "./middleware/custom-throttle.middleware";
import { ServeStaticModule } from '@nestjs/serve-static';
import configuration from "./config/configuration";

@Module({
  imports: [
    MongooseModule.forRoot("mongodb://127.0.0.1:27017/ico"),
    MongooseModule.forFeature([{ name: "user", schema: UserSchema }]),
    MongooseModule.forFeature([{ name: "token", schema: TokenSchema }]),
    MongooseModule.forFeature([{ name: "sales", schema: SalesSchema }]),
    MongooseModule.forFeature([{ name: "admin", schema: AdminSchema }]),
    MongooseModule.forFeature([{ name: "permission", schema: PermissionSchema }]),
    MongooseModule.forFeature([
      { name: "transaction", schema: TransactionSchema },
    ]),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
    }),
    MailerModule.forRoot({
      transport: {
        host: process.env.ICO_MAIL_HOST,
        port: process.env.ICO_MAIL_PORT,
        secure: false,
        auth: {
          user: process.env.ICO_MAIL_USER,
          pass: process.env.ICO_MAIL_PASSWORD,
        },
      },
      template: {
        dir: join(__dirname, "mails"),
        adapter: new HandlebarsAdapter(),
        options: {
          strict: true,
        },
      },
      defaults: {
        from: process.env.ICO_MAIL_FROM_MAIL,
      },
    }),
    ThrottlerModule.forRoot({
      ttl: 5,
      limit: 5,
    }),
  ],
  controllers: [
    AppController,
    UsersController,
    AuthController,
    TransactionsController,
  ],
  providers: [
    AppService,
    UserService,
    TokenService,
    AdminService,
    EmailService,
    TransactionsService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthenticateMiddleware).forRoutes("/users", "/transactions");
    consumer.apply(CustomThrottleMiddleware).forRoutes(
      "/users/updateAccountSettings/:address",
      "/users/acceptKyc/:id",
      "/users/rejectKyc/:id",
      "/users/suspendUser/:id",
      "/users/twoFADisableUser/:id",
      "/users/twoFASMSDisableUser/:id",
      "/users/activeUser/:id",
      "/users/deleteUser/:id",
      "/users/deleteKyc/:id",
      "/auth/adminlogin",
      "/auth/resetPassword",
      "/auth/forgotpassword",
      "/auth/checkOTP"
    );
  }
}
