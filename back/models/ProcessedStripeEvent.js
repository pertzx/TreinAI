// models/ProcessedStripeEvent.js
import mongoose from 'mongoose';

const ProcessedStripeEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true, index: true },
  createdAt: { type: Date, default: Date.now },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} }
});

export default mongoose.model('ProcessedStripeEvent', ProcessedStripeEventSchema);