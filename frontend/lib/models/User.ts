import mongoose from "mongoose";

/** Fields from Steam GetPlayerSummaries (ISteamUser/GetPlayerSummaries/v2) */
export interface IUser {
  steamId: string;
  // Profile
  displayName?: string; // personaname
  profileUrl?: string;
  avatar?: string;
  avatarMedium?: string;
  avatarFull?: string;
  communityVisibilityState?: number; // 1=Private, 2=Friends only, 3=Public
  profileState?: number; // 1 = profile configured
  commentPermission?: number; // 1 = comments allowed
  // Status
  personaState?: number; // 0=Offline, 1=Online, 2=Busy, 3=Away, 4=Snooze, 5=Looking to trade, 6=Looking to play
  lastLogoff?: Date; // last time user was online
  // Optional / privacy-dependent
  realName?: string;
  primaryClanId?: string;
  timeCreated?: Date; // account creation
  locCountryCode?: string; // ISO country code
  locStateCode?: string;
  locCityId?: number;
  // In-game (when playing)
  gameId?: string; // current game app ID
  gameExtraInfo?: string; // current game name
  gameServerIp?: string;
  // App
  lastLoginAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new mongoose.Schema<IUser>(
  {
    steamId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    displayName: { type: String, trim: true },
    profileUrl: { type: String, trim: true },
    avatar: { type: String, trim: true },
    avatarMedium: { type: String, trim: true },
    avatarFull: { type: String, trim: true },
    communityVisibilityState: { type: Number },
    profileState: { type: Number },
    commentPermission: { type: Number },
    personaState: { type: Number },
    lastLogoff: { type: Date },
    realName: { type: String, trim: true },
    primaryClanId: { type: String, trim: true },
    timeCreated: { type: Date },
    locCountryCode: { type: String, trim: true },
    locStateCode: { type: String, trim: true },
    locCityId: { type: Number },
    gameId: { type: String, trim: true },
    gameExtraInfo: { type: String, trim: true },
    gameServerIp: { type: String, trim: true },
    lastLoginAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

export const User =
  mongoose.models.User ?? mongoose.model<IUser>("User", userSchema);
