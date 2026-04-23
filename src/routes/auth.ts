import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { supabase } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";

const RegisterBody = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  username: z.string().min(2).max(30),
  full_name: z.string().min(2).max(100),
});

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string(),
});

const UpdateProfileBody = z.object({
  username: z.string().min(2).max(30).optional(),
  full_name: z.string().min(2).max(100).optional(),
  about: z.string().max(500).optional(),
  location: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  display_name_pref: z.enum(["username", "full_name"]).optional(),
  push_token: z.string().optional(),
});

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/register
  app.post("/auth/register", async (request, reply) => {
    const body = RegisterBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Invalid request body", details: body.error.flatten() });
    }

    const { email, password, username, full_name } = body.data;

    // Check username uniqueness
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (existing) {
      return reply.status(409).send({ error: "Username already taken" });
    }

    // Create Supabase auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      return reply.status(400).send({ error: authError?.message ?? "Failed to create user" });
    }

    // Create profile row — retry up to 5 times with backoff to handle FK propagation delay
    let profileError: any = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 300 * attempt));
      const { error } = await supabase.from("profiles").insert({
        id: authData.user.id,
        username,
        full_name,
        display_name_pref: "username",
        wallet_balance: 0,
        joined_date: new Date().toISOString().split("T")[0],
      });
      profileError = error;
      if (!error) break;
      // Only retry on FK violation (23503) — other errors fail immediately
      if (error.code !== "23503") break;
    }

    if (profileError) {
      // Rollback auth user if profile creation fails
      await supabase.auth.admin.deleteUser(authData.user.id);
      return reply.status(500).send({ error: `Failed to create profile: ${profileError.message}` });
    }

    // Sign in to get session tokens
    const { data: session, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !session.session) {
      return reply.status(500).send({ error: "Account created but sign-in failed" });
    }

    return reply.status(201).send({
      access_token: session.session.access_token,
      refresh_token: session.session.refresh_token,
      user: {
        id: authData.user.id,
        email,
        username,
        full_name,
      },
    });
  });

  // POST /auth/login
  app.post("/auth/login", async (request, reply) => {
    const body = LoginBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }

    const { email, password } = body.data;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      return reply.status(401).send({ error: "Invalid email or password" });
    }

    // Fetch profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .single();

    return reply.send({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        ...profile,
      },
    });
  });

  // POST /auth/refresh
  app.post("/auth/refresh", async (request, reply) => {
    const { refresh_token } = request.body as { refresh_token?: string };
    if (!refresh_token) {
      return reply.status(400).send({ error: "refresh_token required" });
    }

    const { data, error } = await supabase.auth.refreshSession({ refresh_token });
    if (error || !data.session) {
      return reply.status(401).send({ error: "Invalid or expired refresh token" });
    }

    return reply.send({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  });

  // GET /auth/me — returns current user profile
  app.get("/auth/me", { preHandler: requireAuth }, async (request, reply) => {
    const userId = (request as typeof request & { userId: string }).userId;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error || !profile) {
      return reply.status(404).send({ error: "Profile not found" });
    }

    return reply.send(profile);
  });

  // PATCH /auth/me — update profile
  app.patch("/auth/me", { preHandler: requireAuth }, async (request, reply) => {
    const userId = (request as typeof request & { userId: string }).userId;
    const body = UpdateProfileBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Invalid request body", details: body.error.flatten() });
    }

    const { error, data } = await supabase
      .from("profiles")
      .update({ ...body.data, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select()
      .single();

    if (error) {
      return reply.status(500).send({ error: "Failed to update profile" });
    }

    return reply.send(data);
  });
}
