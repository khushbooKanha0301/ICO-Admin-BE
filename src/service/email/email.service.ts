import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import * as fs from 'fs';
import * as handlebars from 'handlebars';
import { join } from 'path';

@Injectable()
export class EmailService {
  constructor(
    private readonly mailerService: MailerService,
  ) {}

  private compileTemplate(templateName: string, context: any): string {
    const templatePath = join(__dirname, '..', '../mails', `${templateName}.hbs`);
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    const template = handlebars.compile(templateContent);
    return template(context);
  }

  async sendVerificationEmail(updateData: any,globalContext:any,mailSubject: string) {
    // Compile both HTML and plain text versions
    const htmlContent = this.compileTemplate('confirm-email', globalContext);
    const plainTextContent = this.compileTemplate('confirm-email-text', globalContext);
    try {
      await this.mailerService.sendMail({
        to: updateData?.email,
        subject: mailSubject,
        text: plainTextContent, // Plain text content
        html: htmlContent,       // HTML content
      });
      return true;
    } catch (error) {
      return false;
    }
  }
}
