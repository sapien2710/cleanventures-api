import type { FastifyInstance } from "fastify";
import { supabase } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";

type AuthRequest = Parameters<Parameters<FastifyInstance["get"]>[1]>[0] & { userId: string };

export async function uploadRoutes(app: FastifyInstance) {
  // POST /upload/venture-image — upload a venture cover image
  // Accepts: multipart/form-data with field "file"
  // Returns: { url: string }
  app.post("/upload/venture-image", { preHandler: requireAuth }, async (request, reply) => {
    const userId = (request as AuthRequest).userId;

    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: "No file provided" });
    }

    const ext = data.filename.split(".").pop()?.toLowerCase() ?? "jpg";
    const allowedExts = ["jpg", "jpeg", "png", "webp", "gif"];
    if (!allowedExts.includes(ext)) {
      return reply.status(400).send({ error: "Invalid file type. Allowed: jpg, png, webp, gif" });
    }

    const path = `${userId}/${Date.now()}.${ext}`;
    const buffer = await data.toBuffer();

    const { error } = await supabase.storage
      .from("venture-images")
      .upload(path, buffer, {
        contentType: data.mimetype,
        upsert: false,
      });

    if (error) {
      app.log.error(error);
      return reply.status(500).send({ error: "Failed to upload image" });
    }

    const { data: publicUrlData } = supabase.storage
      .from("venture-images")
      .getPublicUrl(path);

    return reply.send({ url: publicUrlData.publicUrl });
  });

  // POST /upload/avatar — upload a profile avatar
  // Accepts: multipart/form-data with field "file"
  // Returns: { url: string }
  app.post("/upload/avatar", { preHandler: requireAuth }, async (request, reply) => {
    const userId = (request as AuthRequest).userId;

    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: "No file provided" });
    }

    const ext = data.filename.split(".").pop()?.toLowerCase() ?? "jpg";
    const allowedExts = ["jpg", "jpeg", "png", "webp"];
    if (!allowedExts.includes(ext)) {
      return reply.status(400).send({ error: "Invalid file type. Allowed: jpg, png, webp" });
    }

    // Always overwrite the same path so there's only one avatar per user
    const path = `${userId}/avatar.${ext}`;
    const buffer = await data.toBuffer();

    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, buffer, {
        contentType: data.mimetype,
        upsert: true, // overwrite existing avatar
      });

    if (error) {
      app.log.error(error);
      return reply.status(500).send({ error: "Failed to upload avatar" });
    }

    const { data: publicUrlData } = supabase.storage
      .from("avatars")
      .getPublicUrl(path);

    const url = publicUrlData.publicUrl;

    // Update the profile avatar_url
    await supabase
      .from("profiles")
      .update({ avatar_url: url, updated_at: new Date().toISOString() })
      .eq("id", userId);

    return reply.send({ url });
  });
}
