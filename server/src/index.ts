import 'dotenv/config';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { connectDb } from './db.ts';

const config = loadConfig();
await connectDb(config);

createApp().listen(config.PORT, () => {
  console.log(`API listening on http://localhost:${config.PORT}`);
});
