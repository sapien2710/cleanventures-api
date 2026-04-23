import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { supabase } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";

type AuthRequest = Parameters<Parameters<FastifyInstance["get"]>[1]>[0] & { userId: string };

const CreateTaskBody = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(1000).optional(),
  assigned_to: z.string().uuid().optional(),
  due_date: z.string().optional(),
});

const UpdateTaskBody = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(1000).optional(),
  status: z.enum(["open", "in_progress", "done"]).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  due_date: z.string().nullable().optional(),
});

async function isMember(ventureId: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("venture_members")
    .select("user_id")
    .eq("venture_id", ventureId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

async function isOrganizerOrOwner(ventureId: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("venture_members")
    .select("role")
    .eq("venture_id", ventureId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data && ["owner", "co-organiser"].includes(data.role);
}

export async function taskRoutes(app: FastifyInstance) {
  // GET /ventures/:id/tasks
  app.get("/ventures/:id/tasks", { preHandler: requireAuth }, async (request, reply) => {
    const userId = (request as AuthRequest).userId;
    const { id } = request.params as { id: string };

    if (!(await isMember(id, userId))) {
      return reply.status(403).send({ error: "You are not a member of this venture" });
    }

    const { data, error } = await supabase
      .from("tasks")
      .select("*, profiles!tasks_assigned_to_fkey(username, avatar_url), creator:profiles!tasks_created_by_fkey(username)")
      .eq("venture_id", id)
      .order("created_at", { ascending: false });

    if (error) return reply.status(500).send({ error: "Failed to fetch tasks" });
    return reply.send(data);
  });

  // POST /ventures/:id/tasks — organiser/owner only
  app.post("/ventures/:id/tasks", { preHandler: requireAuth }, async (request, reply) => {
    const userId = (request as AuthRequest).userId;
    const { id } = request.params as { id: string };

    if (!(await isOrganizerOrOwner(id, userId))) {
      return reply.status(403).send({ error: "Only organisers can create tasks" });
    }

    const body = CreateTaskBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Invalid request body", details: body.error.flatten() });
    }

    const { data, error } = await supabase
      .from("tasks")
      .insert({ ...body.data, venture_id: id, created_by: userId, status: "open" })
      .select()
      .single();

    if (error) return reply.status(500).send({ error: "Failed to create task" });

    await supabase.from("activity_events").insert({
      venture_id: id,
      user_id: userId,
      type: "task_created",
      payload: { task_id: data.id, title: data.title },
    });

    return reply.status(201).send(data);
  });

  // PATCH /ventures/:id/tasks/:taskId
  app.patch("/ventures/:id/tasks/:taskId", { preHandler: requireAuth }, async (request, reply) => {
    const userId = (request as AuthRequest).userId;
    const { id, taskId } = request.params as { id: string; taskId: string };

    if (!(await isMember(id, userId))) {
      return reply.status(403).send({ error: "You are not a member of this venture" });
    }

    const body = UpdateTaskBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Invalid request body", details: body.error.flatten() });
    }

    // Volunteers can only update status on tasks assigned to them
    const isOrg = await isOrganizerOrOwner(id, userId);
    if (!isOrg) {
      const { data: task } = await supabase
        .from("tasks")
        .select("assigned_to")
        .eq("id", taskId)
        .single();
      if (task?.assigned_to !== userId) {
        return reply.status(403).send({ error: "You can only update tasks assigned to you" });
      }
      // Volunteers can only change status
      const allowedKeys = new Set(["status"]);
      for (const key of Object.keys(body.data)) {
        if (!allowedKeys.has(key)) {
          return reply.status(403).send({ error: "Volunteers can only update task status" });
        }
      }
    }

    const { data, error } = await supabase
      .from("tasks")
      .update({ ...body.data, updated_at: new Date().toISOString() })
      .eq("id", taskId)
      .eq("venture_id", id)
      .select()
      .single();

    if (error) return reply.status(500).send({ error: "Failed to update task" });

    if (body.data.status === "done") {
      await supabase.from("activity_events").insert({
        venture_id: id,
        user_id: userId,
        type: "task_completed",
        payload: { task_id: taskId, title: data.title },
      });
    }

    return reply.send(data);
  });

  // DELETE /ventures/:id/tasks/:taskId — organiser/owner only
  app.delete("/ventures/:id/tasks/:taskId", { preHandler: requireAuth }, async (request, reply) => {
    const userId = (request as AuthRequest).userId;
    const { id, taskId } = request.params as { id: string; taskId: string };

    if (!(await isOrganizerOrOwner(id, userId))) {
      return reply.status(403).send({ error: "Only organisers can delete tasks" });
    }

    await supabase.from("tasks").delete().eq("id", taskId).eq("venture_id", id);
    return reply.status(204).send();
  });
}
