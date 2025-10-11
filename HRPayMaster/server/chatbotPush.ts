import type { IncomingMessage } from "http";
import { ServerResponse } from "http";
import type { Server } from "http";
import type { RequestHandler } from "express";
import { WebSocketServer, type WebSocket } from "ws";
import { chatbotEvents, CHATBOT_EVENT_TYPES } from "./chatbotEvents";
import { log } from "./vite";
import { storage } from "./storage";

interface AuthenticatedRequest extends IncomingMessage {
  session?: any;
}

interface ChatbotSocket extends WebSocket {
  userId?: string;
}

const socketsByUser = new Map<string, Set<ChatbotSocket>>();

const addSocket = (userId: string, ws: ChatbotSocket) => {
  const existing = socketsByUser.get(userId);
  if (existing) {
    existing.add(ws);
  } else {
    socketsByUser.set(userId, new Set([ws]));
  }
  ws.userId = userId;
};

const removeSocket = (ws: ChatbotSocket) => {
  const userId = ws.userId;
  if (!userId) return;
  const group = socketsByUser.get(userId);
  if (!group) return;
  group.delete(ws);
  if (group.size === 0) {
    socketsByUser.delete(userId);
  }
};

const broadcast = (payload: unknown, userId?: string) => {
  if (userId) {
    const group = socketsByUser.get(userId);
    if (!group) return;
    for (const socket of group) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
      }
    }
    return;
  }

  for (const group of socketsByUser.values()) {
    for (const socket of group) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
      }
    }
  }
};

export const setupChatbotPush = (
  server: Server,
  sessionMiddleware: RequestHandler,
) => {
  const wss = new WebSocketServer({ noServer: true });

  const applySession = (request: IncomingMessage): Promise<void> => {
    return new Promise((resolve, reject) => {
      const response = new ServerResponse(request);
      sessionMiddleware(request as any, response as any, (err: unknown) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  };

  server.on("upgrade", async (request, socket, head) => {
    if (!request.url || !request.url.startsWith("/ws/chatbot")) {
      return;
    }

    try {
      await applySession(request);
    } catch (error) {
      log(`chatbot ws: failed to parse session - ${String(error)}`);
      socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
      socket.destroy();
      return;
    }

    const authReq = request as AuthenticatedRequest;
    const sessionUserId = authReq.session?.passport?.user;
    if (!sessionUserId) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, authReq, sessionUserId);
    });
  });

  wss.on("connection", async (socket: ChatbotSocket, _req: AuthenticatedRequest, userId: string) => {
    addSocket(userId, socket);
    socket.send(JSON.stringify({ type: "connected" }));

    socket.on("close", () => {
      removeSocket(socket);
    });

    socket.on("error", (err) => {
      log(`chatbot ws: error ${String(err)}`);
    });

    try {
      const user = await storage.getUserById(userId);
      if (user?.employeeId) {
        socket.send(
          JSON.stringify({
            type: "context",
            payload: {
              employeeId: user.employeeId,
            },
          }),
        );
      }
    } catch (error) {
      log(`chatbot ws: failed to hydrate user ${userId} - ${String(error)}`);
    }
  });

  chatbotEvents.on(CHATBOT_EVENT_TYPES.notificationCreated, async ({ payload }) => {
    const notificationPayload = {
      type: "notification",
      payload: {
        id: payload.id,
        title: payload.title,
        message: payload.message,
        priority: payload.priority,
        documentUrl: payload.documentUrl,
        action: {
          intent: "acknowledgeDocument",
          documentId: payload.id,
        },
      },
    };

    if (payload.employeeId) {
      broadcast(notificationPayload, payload.employeeId);
    } else {
      broadcast(notificationPayload);
    }
  });

  chatbotEvents.on(CHATBOT_EVENT_TYPES.notificationUpdated, ({ payload }) => {
    const notificationPayload = {
      type: "notification:update",
      payload,
    };

    if (payload.employeeId) {
      broadcast(notificationPayload, payload.employeeId);
    } else {
      broadcast(notificationPayload);
    }
  });

  return wss;
};
