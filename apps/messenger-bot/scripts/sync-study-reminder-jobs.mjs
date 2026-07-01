import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { StudyReminderWorkerService } from '../dist/study-reminder/study-reminder-worker.service.js';

const dispatchOnly = process.argv.includes('--dispatch-only');
const syncOnly = process.argv.includes('--sync-only');

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error', 'warn', 'log'],
});

try {
  const worker = app.get(StudyReminderWorkerService);

  if (dispatchOnly) {
    const dispatch = await worker.runDispatch();
    console.log(JSON.stringify({ dispatch }, null, 2));
  } else if (syncOnly) {
    const sync = await worker.runSync();
    console.log(JSON.stringify({ sync }, null, 2));
  } else {
    const result = await worker.runSyncAndDispatch();
    console.log(JSON.stringify(result, null, 2));
  }
} finally {
  await app.close();
}
