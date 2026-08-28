import nodemailer from 'nodemailer';

import { environment } from '../config/environment.js';
import { AppError } from '../errors/app-error.js';

const requiredSmtpValue = (value: string | undefined, name: string) => {
  if (!value) {
    throw new AppError(503, 'SMTP_NOT_CONFIGURED', `${name} is required to send email.`);
  }
  return value;
};

export class EmailDeliveryService {
  public async send(input: { from: string; to: string; subject: string; body: string }) {
    const transporter = nodemailer.createTransport({
      host: requiredSmtpValue(environment.SMTP_HOST, 'SMTP_HOST'),
      port: environment.SMTP_PORT,
      secure: environment.SMTP_PORT === 465,
      auth: {
        user: requiredSmtpValue(environment.SMTP_USER, 'SMTP_USER'),
        pass: requiredSmtpValue(environment.SMTP_PASSWORD, 'SMTP_PASSWORD'),
      },
    });

    const result = await transporter.sendMail({
      from: input.from,
      to: input.to,
      subject: input.subject,
      text: input.body,
    });

    return {
      messageId: result.messageId,
      previewUrl: nodemailer.getTestMessageUrl(result) || undefined,
    };
  }
}
