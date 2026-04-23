import type { FastifyInstance } from "fastify";
import { supabase } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";

type AuthRequest = Parameters<Parameters<FastifyInstance["get"]>[1]>[0] & { userId: string };

export async function notificationRoutes(app: FastifyInstance) {
  // GET /notifications
  app.get("/notifications", { preHandler: requireAuth }, async (request, reply) => {
    const userId = (request as AuthRequest).userId;
    const { unread_only, limit = "30" } = request.query as { unread_only?: string; limit?: string };

    let query = supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(Number(limit));

    if (unread_only === "true") query = query.eq("read", false);

    const { data, error } = await query;
    if (error) return reply.status(500).send({ error: "Failed to fetch notifications" });

    return reply.send(data);
  });

  // PATCH /notifications/:id/read
  app.patch("/notifications/:id/read", { preHandler: requireAuth }, async (request, reply) => {
    const userId = (request as AuthRequest).userId;
    const { id } = request.params as { id: string };

    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", id)
      .eq("user_id", userId);

    return reply.status(204).send();
  });

  // PATCH /notifications/read-all
  app.patch("/notifications/read-all", { preHandler: requireAuth }, async (request, reply) => {
    const userId = (request as AuthRequest).userId;

    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false);

    return reply.status(204).send();
  });
}
