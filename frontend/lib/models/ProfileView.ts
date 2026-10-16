import mongoose from "mongoose";

export interface IProfileView {
  steamId: string;
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const profileViewSchema = new mongoose.Schema<IProfileView>(
  {
    steamId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    viewCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

export const ProfileView =
  mongoose.models.ProfileView ??
  mongoose.model<IProfileView>("ProfileView", profileViewSchema);
