import mongoose, { Schema } from 'mongoose';

interface CounterDoc {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<CounterDoc>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { versionKey: false },
);

export const Counter = mongoose.model<CounterDoc>('Counter', counterSchema, 'counters');

/**
 * Atomically increments and returns the named sequence, starting at 1.
 * Two concurrent calls never get the same value.
 */
export async function nextSequence(name: string): Promise<number> {
  const counter = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  ).lean();
  return counter.seq;
}
