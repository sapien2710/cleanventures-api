import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";

import { authRoutes } from "./routes/auth";
import { ventureRoutes } from "./routes/ventures";
import { taskRoutes } from "./routes/tasks";
import { notificationRoutes } from "./routes/notifications";
import { chatRoutes } from "./routes/chat";

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === "production" ? "warn" : "info",
    transport:
      process.env.NODE_ENV !== "production"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
  },
});

// CORS — allow requests from Expo Go and production app
app.register(cors, {
  origin: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

// Health check
app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

// Routes
app.register(authRoutes);
app.register(ventureRoutes);
app.register(taskRoutes);
app.register(notificationRoutes);
app.register(chatRoutes);

// Start server
const PORT = Number(process.env.PORT ?? 3000);
const HOST = "0.0.0.0";

app.listen({ port: PORT, host: HOST }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`CleanVentures API running at ${address}`);
});
