import type { FastifyRequest, FastifyReply } from "fastify";
import { supabase } from "../lib/supabase";

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Missing or invalid Authorization header" });
  }

  const token = authHeader.slice(7);

  // Verify the JWT issued by Supabase Auth
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return reply.status(401).send({ error: "Invalid or expired token" });
  }

  // Attach the authenticated user id to the request for downstream use
  (request as FastifyRequest & { userId: string }).userId = data.user.id;
}
