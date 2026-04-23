import { supabase } from "./supabase";

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function sendPushToUser(userId: string, title: string, body: string, data?: Record<string, unknown>) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("push_token")
    .eq("id", userId)
    .single();

  if (!profile?.push_token) return;

  const message: PushMessage = {
    to: profile.push_token,
    title,
    body,
    data,
  };

  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });
}

export async function sendPushToVentureMembers(
  ventureId: string,
  excludeUserId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  const { data: members } = await supabase
    .from("venture_members")
    .select("user_id")
    .eq("venture_id", ventureId)
    .neq("user_id", excludeUserId);

  if (!members) return;

  await Promise.all(
    members.map((m: { user_id: string }) => sendPushToUser(m.user_id, title, body, data))
  );
}
