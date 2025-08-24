import { Router } from "express";
import { parseIntent } from "@shared/chatbot";

export const chatbotRouter = Router();

chatbotRouter.post("/api/chatbot", (req, res) => {
  const { message } = req.body ?? {};
  const intent = parseIntent(message ?? "");
  res.json(intent);
});
