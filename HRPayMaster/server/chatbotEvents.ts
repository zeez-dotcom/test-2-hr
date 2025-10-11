import { EventEmitter } from "events";

export interface ChatbotNotificationEvent {
  type: "notification-created" | "notification-updated";
  payload: {
    id: string;
    employeeId?: string | null;
    title: string;
    message: string;
    priority?: string | null;
    documentUrl?: string | null;
  };
}

export const chatbotEvents = new EventEmitter();

export const emitChatbotNotification = (event: ChatbotNotificationEvent) => {
  chatbotEvents.emit(event.type, event);
};

export const CHATBOT_EVENT_TYPES = {
  notificationCreated: "notification-created" as const,
  notificationUpdated: "notification-updated" as const,
};

export type ChatbotEventType = typeof CHATBOT_EVENT_TYPES[keyof typeof CHATBOT_EVENT_TYPES];
