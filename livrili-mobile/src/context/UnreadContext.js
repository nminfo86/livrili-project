// src/context/UnreadContext.js
import { createContext } from 'react';

export const UnreadContext = createContext({
  unread: 0,
  refreshUnread: () => {},
});
