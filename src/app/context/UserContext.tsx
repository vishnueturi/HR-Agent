import { createContext, useContext, useState, ReactNode } from 'react';

interface User {
  firstName: string;
  lastName: string;
  email: string;
}

interface UserContextType {
  user: User;
  updateUser: (user: User) => void;
  getInitials: () => string;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>({
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com'
  });

  const updateUser = (newUser: User) => {
    setUser(newUser);
  };

  const getInitials = () => {
    const firstInitial = user.firstName.charAt(0).toUpperCase();
    const lastInitial = user.lastName.charAt(0).toUpperCase();
    return `${firstInitial}${lastInitial}`;
  };

  return (
    <UserContext.Provider value={{ user, updateUser, getInitials }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
