import { createSlice } from "@reduxjs/toolkit";

export interface SessionState {
  steamId: string | null;
  displayName: string | null;
  avatar: string | null;
  loading: boolean;
}

const initialState: SessionState = {
  steamId: null,
  displayName: null,
  avatar: null,
  loading: true,
};

const sessionSlice = createSlice({
  name: "session",
  initialState,
  reducers: {
    setSession: (
      state,
      action: {
        payload: {
          steamId?: string | null;
          displayName?: string | null;
          avatar?: string | null;
        };
      }
    ) => {
      if (action.payload.steamId !== undefined) state.steamId = action.payload.steamId;
      if (action.payload.displayName !== undefined) state.displayName = action.payload.displayName;
      if (action.payload.avatar !== undefined) state.avatar = action.payload.avatar;
    },
    clearSession: (state) => {
      state.steamId = null;
      state.displayName = null;
      state.avatar = null;
    },
    setSessionLoading: (state, action: { payload: boolean }) => {
      state.loading = action.payload;
    },
  },
});

export const { setSession, clearSession, setSessionLoading } = sessionSlice.actions;
export default sessionSlice.reducer;
