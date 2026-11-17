import path from 'node:path';
import { buildApp } from './app';
import { consoleSms, webhookSms } from './sms';

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';
const dataDir = path.resolve(process.env.DATA_DIR ?? 'data');
const dev = process.env.BLS_DEV === '1';
const sms = process.env.SMS_WEBHOOK_URL ? webhookSms(process.env.SMS_WEBHOOK_URL, process.env.SMS_WEBHOOK_TOKEN) : consoleSms;

buildApp({ dataDir, dev, sms, logger: true })
  .then((app) => app.listen({ port, host }))
  .then((addr) => console.log(`Bluesight server on ${addr} (data: ${dataDir}${dev ? ', DEV codes on' : ''})`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
