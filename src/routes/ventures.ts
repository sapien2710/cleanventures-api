import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { supabase } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";

type AuthRequest = Parameters<Parameters<FastifyInstance["get"]>[1]>[0] & { userId: string };

const CreateVentureBody = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(2000),
  location: z.string().max(300),
  lat: z.number().optional(),
  lng: z.number().optional(),
  max_members: z.number().int().min(2).max(500).default(20),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  budget: z.number().min(0).default(0),
  cover_image_url: z.string().url().optional(),
});

const UpdateVentureBody = CreateVentureBody.partial().extend({
  status: z.enum(["proposed", "ongoing", "finished", "cancelled"]).optional(),
  spent: z.number().min(0).optional(),
});

export async function ventureRoutes(app: FastifyInstance) {
  // GET /ventures — list all (discover) or filter by membership
  app.get("/ventures", { preHandler: requireAuth }, async (request, reply) => {
    const userId = (request as AuthRequest).userId;
    const { mine, status, search } = request.query as {
      mine?: string;
      status?: string;
      search?: string;
    };

    if (mine === "true") {
      // Ventures the user is a member of
      const { data, error } = await supabase
        .from("venture_members")
        .select("venture_id, role, ventures(*)")
        .eq("user_id", userId);

      if (error) return reply.status(500).send({ error: "Failed to fetch ventures" });

      const ventures = data.map((row: any) => ({ ...row.ventures, my_role: row.role }));
      return reply.send(ventures);
    }

    // Discover — all public ventures
    let query = supabase.from("ventures").select("*, profiles!ventures_owner_id_fkey(username, full_name, avatar_url)");

    if (status) query = query.eq("status", status);
    if (search) query = query.ilike("title", `%${search}%`);

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) return reply.status(500).send({ error: "Failed to fetch ventures" });

    return reply.send(data);
  });

  // GET /ventures/:id
  app.get("/ventures/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const { data, error } = await supabase
      .from("ventures")
      .select("*, profiles!ventures_owner_id_fkey(username, full_name, avatar_url)")
      .eq("id", id)
      .single();

    if (error || !data) return reply.status(404).send({ error: "Venture not found" });

    // Fetch members
    const { data: members } = await supabase
      .from("venture_members")
      .select("role, joined_at, profiles(id, username, full_name, avatar_url)")
      .eq("venture_id", id);

    return reply.send({ ...data, members: members ?? [] });
  });

  // POST /ventures — create
  app.post("/ventures", { preHandler: requireAuth }, async (request, reply) => {
    const userId = (request as AuthRequest).userId;
    const body = CreateVentureBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Invalid request body", details: body.error.flatten() });
    }

    const { data: venture, error } = await supabase
      .from("ventures")
      .insert({ ...body.data, owner_id: userId, status: "proposed" })
      .select()
      .single();

    if (error || !venture) return reply.status(500).send({ error: "Failed to create venture" });

    // Auto-add owner as member
    await supabase.from("venture_members").insert({
      venture_id: venture.id,
      user_id: userId,
      role: "owner",
    });

    // Log activity
    await supabase.from("activity_events").insert({
      venture_id: venture.id,
      user_id: userId,
      type: "venture_created",
      payload: { title: venture.title },
    });

    return reply.status(201).send(venture);
  });

  // PATCH /ventures/:id — update (owner or co-organiser only)
  app.patch("/ventures/:id", { preHandler: requireAuth }, async (request, reply) => {
    const userId = (request as AuthRequest).userId;
    const { id } = request.params as { id: string };

    // Check permission
    const { data: membership } = await supabase
      .from("venture_members")
      .select("role")
      .eq("venture_id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership || !["owner", "co-organiser"].includes(membership.role)) {
      return reply.status(403).send({ error: "Only the owner or co-organiser can update this venture" });
    }

    const body = UpdateVentureBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Invalid request body", details: body.error.flatten() });
    }

    const { data, error } = await supabase
      .from("ventures")
      .update({ ...body.data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) return reply.status(500).send({ error: "Failed to update venture" });

    // Log activity
    await supabase.from("activity_events").insert({
      venture_id: id,
      user_id: userId,
      type: "venture_updated",
      payload: body.data as Record<string, unknown>,
    });

    return reply.send(data);
  });

  // DELETE /ventures/:id — owner only
  app.delete("/ventures/:id", { preHandler: requireAuth }, async (request, reply) => {
    const userId = (request as AuthRequest).userId;
    const { id } = request.params as { id: string };

    const { data: venture } = await supabase
      .from("ventures")
      .select("owner_id")
      .eq("id", id)
      .single();

    if (!venture || venture.owner_id !== userId) {
      return reply.status(403).send({ error: "Only the owner can delete this venture" });
    }

    await supabase.from("ventures").delete().eq("id", id);
    return reply.status(204).send();
  });

  // POST /ventures/:id/join
  app.post("/ventures/:id/join", { preHandler: requireAuth }, async (request, reply) => {
    const userId = (request as AuthRequest).userId;
    const { id } = request.params as { id: string };

    // Check not already a member
    const { data: existing } = await supabase
      .from("venture_members")
      .select("user_id")
      .eq("venture_id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) return reply.status(409).send({ error: "Already a member" });

    // Check capacity
    const { data: venture } = await supabase
      .from("ventures")
      .select("max_members")
      .eq("id", id)
      .single();

    const { count } = await supabase
      .from("venture_members")
      .select("*", { count: "exact", head: true })
      .eq("venture_id", id);

    if (venture && count !== null && count >= venture.max_members) {
      return reply.status(409).send({ error: "Venture is full" });
    }

    await supabase.from("venture_members").insert({
      venture_id: id,
      user_id: userId,
      role: "volunteer",
    });

    await supabase.from("activity_events").insert({
      venture_id: id,
      user_id: userId,
      type: "member_joined",
      payload: {},
    });

    return reply.status(201).send({ message: "Joined successfully" });
  });

  // DELETE /ventures/:id/leave
  app.delete("/ventures/:id/leave", { preHandler: requireAuth }, async (request, reply) => {
    const userId = (request as AuthRequest).userId;
    const { id } = request.params as { id: string };

    // Owner cannot leave — must transfer or delete
    const { data: venture } = await supabase
      .from("ventures")
      .select("owner_id")
      .eq("id", id)
      .single();

    if (venture?.owner_id === userId) {
      return reply.status(400).send({ error: "Owner cannot leave. Transfer ownership or delete the venture." });
    }

    await supabase
      .from("venture_members")
      .delete()
      .eq("venture_id", id)
      .eq("user_id", userId);

    return reply.status(204).send();
  });

  // GET /ventures/:id/activity
  app.get("/ventures/:id/activity", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { limit = "20", offset = "0" } = request.query as { limit?: string; offset?: string };

    const { data, error } = await supabase
      .from("activity_events")
      .select("*, profiles(username, avatar_url)")
      .eq("venture_id", id)
      .order("created_at", { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (error) return reply.status(500).send({ error: "Failed to fetch activity" });
    return reply.send(data);
  });
}
