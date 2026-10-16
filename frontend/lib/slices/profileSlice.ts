import { createSlice } from "@reduxjs/toolkit";

export interface ProfileState {
  steamId: string | null;
  displayName: string | null;
  profileUrl: string | null;
  avatar: string | null;
  avatarMedium: string | null;
  avatarFull: string | null;
  realName: string | null;
  locCountryCode: string | null;
  timeCreated: string | null;
  lastLoginAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  loading: boolean;
  loaded: boolean;
}

const initialState: ProfileState = {
  steamId: null,
  displayName: null,
  profileUrl: null,
  avatar: null,
  avatarMedium: null,
  avatarFull: null,
  realName: null,
  locCountryCode: null,
  timeCreated: null,
  lastLoginAt: null,
  createdAt: null,
  updatedAt: null,
  loading: false,
  loaded: false,
};

const profileSlice = createSlice({
  name: "profile",
  initialState,
  reducers: {
    setProfile: (
      state,
      action: {
        payload: Partial<Omit<ProfileState, "loading" | "loaded">>;
      }
    ) => {
      const p = action.payload;
      if (p.steamId !== undefined) state.steamId = p.steamId;
      if (p.displayName !== undefined) state.displayName = p.displayName;
      if (p.profileUrl !== undefined) state.profileUrl = p.profileUrl;
      if (p.avatar !== undefined) state.avatar = p.avatar;
      if (p.avatarMedium !== undefined) state.avatarMedium = p.avatarMedium;
      if (p.avatarFull !== undefined) state.avatarFull = p.avatarFull;
      if (p.realName !== undefined) state.realName = p.realName;
      if (p.locCountryCode !== undefined) state.locCountryCode = p.locCountryCode;
      if (p.timeCreated !== undefined) state.timeCreated = p.timeCreated;
      if (p.lastLoginAt !== undefined) state.lastLoginAt = p.lastLoginAt;
      if (p.createdAt !== undefined) state.createdAt = p.createdAt;
      if (p.updatedAt !== undefined) state.updatedAt = p.updatedAt;
      state.loaded = true;
    },
    clearProfile: (state) => {
      state.steamId = null;
      state.displayName = null;
      state.profileUrl = null;
      state.avatar = null;
      state.avatarMedium = null;
      state.avatarFull = null;
      state.realName = null;
      state.locCountryCode = null;
      state.timeCreated = null;
      state.lastLoginAt = null;
      state.createdAt = null;
      state.updatedAt = null;
      state.loaded = false;
    },
    setProfileLoading: (state, action: { payload: boolean }) => {
      state.loading = action.payload;
    },
  },
});

export const { setProfile, clearProfile, setProfileLoading } = profileSlice.actions;
export default profileSlice.reducer;
