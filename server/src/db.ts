import mongoose from 'mongoose';
import type { Config } from './config.ts';

export async function connectDb(config: Config): Promise<void> {
  if (config.MONGODB_URI) {
    await mongoose.connect(config.MONGODB_URI);
    return;
  }

  if (config.NODE_ENV === 'production') {
    throw new Error('MONGODB_URI must be set in production');
  }

  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const memoryServer = await MongoMemoryServer.create();
  console.warn(
    'MONGODB_URI is not set: using an in-memory MongoDB. Data will not persist when the server stops.',
  );
  await mongoose.connect(memoryServer.getUri());
}
