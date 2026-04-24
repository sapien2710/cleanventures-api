import type { FastifyInstance } from "fastify";
import { StreamChat } from "stream-chat";
import { z } from "zod";
import { supabase } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";

const streamClient = StreamChat.getInstance(
  process.env.STREAM_API_KEY!,
  process.env.STREAM_API_SECRET!
);

const CreateChannelBody = z.object({
  venture_id: z.string(),
  venture_name: z.string(),
});

export async function chatRoutes(app: FastifyInstance) {
  // GET /chat/token — generate a Stream user token for the authenticated user
  app.get("/chat/token", { preHandler: requireAuth }, async (request, reply) => {
    const userId = (request as any).userId as string;

    // Fetch profile to get username/display name
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url")
      .eq("id", userId)
      .single();

    if (error || !profile) {
      return reply.status(404).send({ error: "Profile not found" });
    }

    // Generate token immediately (synchronous, no API call needed)
    const token = streamClient.createToken(userId);

    // Upsert user in Stream in the background (fire-and-forget) to keep name/avatar in sync
    streamClient.upsertUser({
      id: userId,
      name: profile.full_name ?? profile.username,
      image: profile.avatar_url ?? undefined,
    }).catch((err: any) => app.log.warn('[Stream] upsertUser failed:', err?.message));

    return reply.send({
      token,
      user_id: userId,
      user_name: profile.full_name ?? profile.username,
      api_key: process.env.STREAM_API_KEY,
    });
  });

  // POST /chat/channel — create or get a channel for a venture
  app.post("/chat/channel", { preHandler: requireAuth }, async (request, reply) => {
    const userId = (request as any).userId as string;
    const body = CreateChannelBody.safeParse(request.body);

    if (!body.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }

    const { venture_id, venture_name } = body.data;
    const channelId = `venture-${venture_id}`;

    try {
      // Create or get the channel (idempotent)
      const channel = streamClient.channel("messaging", channelId, {
        name: venture_name,
        created_by_id: userId,
        members: [userId],
      });

      await channel.create();

      return reply.send({
        channel_id: channelId,
        channel_type: "messaging",
      });
    } catch (err: any) {
      app.log.error(err);
      return reply.status(500).send({ error: "Failed to create channel" });
    }
  });

  // POST /chat/channel/:channelId/members — add a user to a channel when they join a venture
  // Body: { target_user_id?: string } — if provided, adds that specific user (owner approving someone);
  // otherwise adds the caller (self-join after being approved).
  app.post("/chat/channel/:channelId/members", { preHandler: requireAuth }, async (request, reply) => {
    const callerId = (request as any).userId as string;
    const { channelId } = request.params as { channelId: string };
    const body = (request.body ?? {}) as { target_user_id?: string };

    // Allow owner to add a specific user (by their Supabase UUID) to the channel
    const userIdToAdd = body.target_user_id ?? callerId;

    try {
      // If adding a different user, ensure they exist in Stream first
      if (userIdToAdd !== callerId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url")
          .eq("id", userIdToAdd)
          .maybeSingle();

        if (profile) {
          await streamClient.upsertUser({
            id: profile.id,
            name: profile.full_name ?? profile.username,
            image: profile.avatar_url ?? undefined,
          });
        }
      }

      const channel = streamClient.channel("messaging", channelId);
      await channel.addMembers([userIdToAdd]);
      return reply.send({ success: true });
    } catch (err: any) {
      app.log.error(err);
      return reply.status(500).send({ error: "Failed to add member" });
    }
  });
}
