export type Session = {
  socket: WebSocket;
  playerId: string | null;
};

export type SessionAttachment = {
  playerId: string | null;
  sessionId: string;
  connectedAt: number;
};
