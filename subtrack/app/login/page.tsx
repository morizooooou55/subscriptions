"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signUp() {
    setLoading(true);
    setMsg(null);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) return setMsg(error.message);
    setMsg("登録OK（メール確認が必要ならメールを確認して）");
  }

  async function signIn() {
    setLoading(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setMsg(error.message);
    router.push("/subscriptions");
  }

  return (
    <main style={{ padding: 16, maxWidth: 420, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>ログイン</h1>

      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <label>
          メール
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            style={{ width: "100%", padding: 12, marginTop: 6 }}
          />
        </label>

        <label>
          パスワード
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            style={{ width: "100%", padding: 12, marginTop: 6 }}
          />
        </label>

        <button onClick={signIn} disabled={loading} style={{ padding: 12 }}>
          ログイン
        </button>
        <button onClick={signUp} disabled={loading} style={{ padding: 12 }}>
          新規登録
        </button>

        {msg && <p style={{ color: "crimson" }}>{msg}</p>}
      </div>
    </main>
  );
}