import { configureStore } from "@reduxjs/toolkit";
import sessionReducer from "./slices/sessionSlice";
import profileReducer from "./slices/profileSlice";

export const makeStore = () => {
  return configureStore({
    reducer: {
      session: sessionReducer,
      profile: profileReducer,
    },
  });
};

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
