import mongoose from "mongoose";

const subscriptionPaymentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    email: { type: String, required: true },
    plan: { type: String, enum: ["bronze", "silver", "gold"], required: true },
    orderId: { type: String, required: true, unique: true },
    paymentId: { type: String, unique: true, sparse: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    status: { type: String, enum: ["created", "paid"], default: "created", required: true },
    paidAt: { type: Date },
    expiresAt: { type: Date },
    invoiceNumber: { type: String },
    invoiceSentAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model("subscriptionpayment", subscriptionPaymentSchema);