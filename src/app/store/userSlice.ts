import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface User {
  firstName: string;
  lastName: string;
  email: string;
}

interface UserState {
  user: User;
}

const initialState: UserState = {
  user: {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
  },
};

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    updateUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
    },
  },
});

export const { updateUser } = userSlice.actions;

// Selector to get user initials
export const selectUserInitials = (state: { user: UserState }) => {
  const { firstName, lastName } = state.user.user;
  const firstInitial = firstName.charAt(0).toUpperCase();
  const lastInitial = lastName.charAt(0).toUpperCase();
  return `${firstInitial}${lastInitial}`;
};

export default userSlice.reducer;
