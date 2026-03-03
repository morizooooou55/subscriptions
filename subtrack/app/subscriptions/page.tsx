"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type SubscriptionRow = {
  id: string;
  service_id: string | null;
  custom_name: string | null;
  status: "active" | "canceled";
  price: number | null;
  billing_cycle: "monthly" | "yearly" | null;
  cancel_url: string | null;
  canceled_at?: string | null;
  created_at?: string | null;
};

type CatalogRow = {
  id: string;
  name: string;
  icon_url: string | null;
  category: string | null;
  cancel_url: string | null;
  homepage_url: string | null;
};

type PlanRow = {
  id: string;
  service_id: string;
  plan_name: string | null;
  price: number;
  billing_cycle: "monthly" | "yearly";
  currency: string;
};

function yen(n: number) {
  return `¥${Math.round(n).toLocaleString()}`;
}

function fmtPrice(price: number | null, cycle: string | null) {
  if (price == null) return "料金未設定";
  return `${yen(price)} / ${cycle ?? "?"}`;
}

function badgeForCategory(category: string | null) {
  const c = (category ?? "").toLowerCase();
  // ざっくり分類（好きに増やしてOK）
  if (c.includes("動画") || c.includes("video")) return { bg: "#E0F2FE", fg: "#075985" }; // sky
  if (c.includes("音楽") || c.includes("music")) return { bg: "#FCE7F3", fg: "#9D174D" }; // pink
  if (c.includes("クラウド") || c.includes("cloud")) return { bg: "#ECFCCB", fg: "#3F6212" }; // lime
  if (c.includes("学習") || c.includes("education")) return { bg: "#EDE9FE", fg: "#5B21B6" }; // violet
  if (c.includes("仕事") || c.includes("work") || c.includes("開発")) return { bg: "#DCFCE7", fg: "#166534" }; // green
  return { bg: "#F3F4F6", fg: "#374151" }; // gray
}

export default function SubscriptionsPage() {
  const router = useRouter();

  const [tab, setTab] = useState<"active" | "canceled">("active");
  const [subs, setSubs] = useState<SubscriptionRow[]>([]);
  const [catalog, setCatalog] = useState<Record<string, CatalogRow>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // 追加モーダル
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<"template" | "manual">("template");

  // テンプレ追加用
  const [q, setQ] = useState("");
  const [catalogList, setCatalogList] = useState<CatalogRow[]>([]);
  const [selectedService, setSelectedService] = useState<CatalogRow | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");

  // 入力（テンプレでも手動でも）
  const [name, setName] = useState(""); // 手動 or テンプレ上書き
  const [price, setPrice] = useState<string>("");
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [cancelUrl, setCancelUrl] = useState<string>("");

  const list = useMemo(() => subs.filter((s) => s.status === tab), [subs, tab]);

  const activeTotals = useMemo(() => {
    const active = subs.filter((s) => s.status === "active");
    // 月額換算：monthlyはそのまま、yearlyは /12
    let monthly = 0;
    for (const s of active) {
      if (s.price == null || !s.billing_cycle) continue;
      monthly += s.billing_cycle === "monthly" ? s.price : s.price / 12;
    }
    const yearly = monthly * 12;
    return { monthly, yearly, count: active.length };
  }, [subs]);

  function displayName(s: SubscriptionRow) {
    if (s.custom_name) return s.custom_name;
    if (s.service_id && catalog[s.service_id]) return catalog[s.service_id].name;
    return "（名前未設定）";
  }

  function serviceMeta(s: SubscriptionRow) {
    const c = s.service_id ? catalog[s.service_id] : undefined;
    return {
      icon_url: c?.icon_url ?? null,
      category: c?.category ?? null,
      cancel_url: s.cancel_url ?? c?.cancel_url ?? null,
    };
  }

  async function loadAll() {
    setLoading(true);
    setErr(null);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push("/login");
      return;
    }

    const [subsRes, catRes] = await Promise.all([
      supabase
        .from("subscriptions")
        .select("id,service_id,custom_name,status,price,billing_cycle,cancel_url,canceled_at,created_at")
        .order("created_at", { ascending: false }),
      supabase.from("service_catalog").select("id,name,icon_url,category,cancel_url,homepage_url"),
    ]);

    if (subsRes.error) setErr(subsRes.error.message);
    if (catRes.error) setErr(catRes.error.message);

    setSubs((subsRes.data as any) ?? []);

    const m: Record<string, CatalogRow> = {};
    for (const c of (catRes.data as any) ?? []) m[c.id] = c;
    setCatalog(m);
    setCatalogList((catRes.data as any) ?? []);

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ★追加モーダルが開いている間、背景（body）のスクロールを止める
useEffect(() => {
  if (!addOpen) return;

  const prev = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  return () => {
    document.body.style.overflow = prev;
  };
}, [addOpen]);

  const filteredCatalog = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return catalogList;
    return catalogList.filter((c) => c.name.toLowerCase().includes(key));
  }, [q, catalogList]);

  useEffect(() => {
    (async () => {
      if (!selectedService) {
        setPlans([]);
        setSelectedPlanId("");
        return;
      }

      const res = await supabase
        .from("service_plans")
        .select("id,service_id,plan_name,price,billing_cycle,currency")
        .eq("service_id", selectedService.id)
        .order("price", { ascending: true });

      if (res.error) {
        setErr(res.error.message);
        setPlans([]);
        setSelectedPlanId("");
        return;
      }

      const data = (res.data as any) ?? [];
      setPlans(data);

      if (data.length > 0) {
        setSelectedPlanId(data[0].id);
        setPrice(String(data[0].price));
        setCycle(data[0].billing_cycle);
      } else {
        setSelectedPlanId("");
        setPrice("");
        setCycle("monthly");
      }

      setCancelUrl(selectedService.cancel_url ?? "");
      setName("");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedService?.id]);

  useEffect(() => {
    if (!selectedPlanId) return;
    const p = plans.find((x) => x.id === selectedPlanId);
    if (!p) return;
    setPrice(String(p.price));
    setCycle(p.billing_cycle);
  }, [selectedPlanId, plans]);

  function resetAddModal() {
    setAddMode("template");
    setQ("");
    setSelectedService(null);
    setPlans([]);
    setSelectedPlanId("");
    setName("");
    setPrice("");
    setCycle("monthly");
    setCancelUrl("");
  }

  async function markCanceled(id: string) {
    const { error } = await supabase
      .from("subscriptions")
      .update({ status: "canceled", canceled_at: new Date().toISOString().slice(0, 10) })
      .eq("id", id);

    if (!error) {
      setSubs((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, status: "canceled", canceled_at: new Date().toISOString().slice(0, 10) } : s
        )
      );
      setTab("canceled"); // ④：解約したら過去に移動して見える
    }
  }

  async function restoreActive(id: string) {
    const { error } = await supabase
      .from("subscriptions")
      .update({ status: "active", canceled_at: null })
      .eq("id", id);

    if (!error) {
      setSubs((prev) => prev.map((s) => (s.id === id ? { ...s, status: "active", canceled_at: null } : s)));
      setTab("active"); // ④：戻したら契約中へ
    }
  }

  async function createFromTemplate() {
    if (!selectedService) {
      setErr("テンプレを選んでください");
      return;
    }
    setErr(null);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push("/login");
      return;
    }

    const priceNum = price.trim() === "" ? null : Number(price);
    if (priceNum !== null && Number.isNaN(priceNum)) {
      setErr("価格が数字じゃない");
      return;
    }

    const payload = {
      user_id: session.user.id,
      service_id: selectedService.id,
      custom_name: name.trim() ? name.trim() : null,
      price: priceNum,
      billing_cycle: cycle ?? null,
      cancel_url: cancelUrl.trim() ? cancelUrl.trim() : null,
      status: "active" as const,
    };

    const res = await supabase.from("subscriptions").insert(payload).select().single();
    if (res.error) {
      setErr(res.error.message);
      return;
    }

    setSubs((prev) => [res.data as any, ...prev]);
    setAddOpen(false);
    resetAddModal();
    setTab("active");
  }

  async function createManual() {
    setErr(null);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push("/login");
      return;
    }

    if (!name.trim()) {
      setErr("サービス名は必須");
      return;
    }

    const priceNum = price.trim() === "" ? null : Number(price);
    if (priceNum !== null && Number.isNaN(priceNum)) {
      setErr("価格が数字じゃない");
      return;
    }

    const payload = {
      user_id: session.user.id,
      service_id: null,
      custom_name: name.trim(),
      price: priceNum,
      billing_cycle: cycle ?? null,
      cancel_url: cancelUrl.trim() ? cancelUrl.trim() : null,
      status: "active" as const,
    };

    const res = await supabase.from("subscriptions").insert(payload).select().single();
    if (res.error) {
      setErr(res.error.message);
      return;
    }

    setSubs((prev) => [res.data as any, ...prev]);
    setAddOpen(false);
    resetAddModal();
    setTab("active");
  }

  // スタイル（色）
  const styles = {
    page: {
      padding: 16,
      maxWidth: 620,
      margin: "0 auto",
      background: "linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 35%)",
      minHeight: "100vh",
    } as const,
    topCard: {
      marginTop: 12,
      borderRadius: 18,
      border: "1px solid #E5E7EB",
      background: "white",
      padding: 14,
      boxShadow: "0 1px 10px rgba(0,0,0,0.04)",
    } as const,
    pill: (active: boolean) =>
      ({
        padding: 10,
        flex: 1,
        borderRadius: 999,
        border: "1px solid #E5E7EB",
        background: active ? "linear-gradient(90deg, #0EA5E9 0%, #22C55E 100%)" : "white",
        color: active ? "white" : "#111827",
        fontWeight: active ? 800 : 600,
      }) as const,
    btn: (variant: "primary" | "ghost" | "danger" = "primary") =>
      ({
        padding: "10px 12px",
        borderRadius: 12,
        border: variant === "ghost" ? "1px solid #E5E7EB" : "1px solid transparent",
        background:
          variant === "primary"
            ? "linear-gradient(90deg, #0EA5E9 0%, #22C55E 100%)"
            : variant === "danger"
              ? "linear-gradient(90deg, #EF4444 0%, #F97316 100%)"
              : "white",
        color: variant === "ghost" ? "#111827" : "white",
        fontWeight: 800,
      }) as const,
    card: {
      border: "1px solid #E5E7EB",
      borderRadius: 18,
      padding: 14,
      background: "white",
      boxShadow: "0 1px 10px rgba(0,0,0,0.04)",
    } as const,
    linkBtn: {
      padding: "10px 12px",
      borderRadius: 12,
      border: "1px solid #E5E7EB",
      background: "white",
      fontWeight: 800,
      color: "#0F172A",
      textDecoration: "none",
    } as const,
  };

  return (
    <main style={styles.page}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: "#64748B", fontWeight: 700 }}>Subscription Dashboard</div>
          <h1 style={{ fontSize: 24, fontWeight: 900, marginTop: 2, color: "#0F172A" }}>サブスク管理</h1>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => {
              setAddOpen(true);
              setErr(null);
            }}
            style={styles.btn("primary")}
          >
            ＋追加
          </button>

          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.push("/login");
            }}
            style={styles.btn("ghost")}
          >
            ログアウト
          </button>
        </div>
      </header>

      {/* ② 合計表示 */}
      <section style={styles.topCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <div style={{ fontWeight: 900, color: "#0F172A" }}>契約中の合計</div>
          <div style={{ fontSize: 12, color: "#64748B", fontWeight: 700 }}>{activeTotals.count}件</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
          <div style={{ borderRadius: 14, padding: 12, background: "#ECFEFF", border: "1px solid #CFFAFE" }}>
            <div style={{ fontSize: 12, color: "#0E7490", fontWeight: 800 }}>月額換算</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#0F172A", marginTop: 2 }}>
              {yen(activeTotals.monthly)}
            </div>
          </div>

          <div style={{ borderRadius: 14, padding: 12, background: "#F0FDF4", border: "1px solid #DCFCE7" }}>
            <div style={{ fontSize: 12, color: "#166534", fontWeight: 800 }}>年額換算</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#0F172A", marginTop: 2 }}>
              {yen(activeTotals.yearly)}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button onClick={() => setTab("active")} style={styles.pill(tab === "active")}>
            契約中
          </button>
          <button onClick={() => setTab("canceled")} style={styles.pill(tab === "canceled")}>
            過去
          </button>
        </div>
      </section>

      {loading && <p style={{ marginTop: 14, color: "#64748B" }}>読み込み中…</p>}
      {err && <p style={{ marginTop: 14, color: "#DC2626", fontWeight: 800 }}>{err}</p>}

      {/* ③ カードUI強化 + ④ 過去タブに解約日/再契約 */}
      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        {list.map((s) => {
          const meta = serviceMeta(s);
          const cat = badgeForCategory(meta.category);
          const title = displayName(s);

          return (
            <section key={s.id} style={styles.card}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {/* アイコン */}
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    background: "#F1F5F9",
                    border: "1px solid #E2E8F0",
                    display: "grid",
                    placeItems: "center",
                    overflow: "hidden",
                    flex: "0 0 auto",
                  }}
                >
                  {meta.icon_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={meta.icon_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ fontWeight: 900, color: "#334155" }}>{title.slice(0, 1).toUpperCase()}</span>
                  )}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "#0F172A" }}>{title}</div>

                    {meta.category && (
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: 999,
                          background: cat.bg,
                          color: cat.fg,
                          fontSize: 12,
                          fontWeight: 900,
                          border: "1px solid rgba(0,0,0,0.04)",
                        }}
                      >
                        {meta.category}
                      </span>
                    )}

                    {s.status === "canceled" && (
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: 999,
                          background: "#FFF7ED",
                          color: "#9A3412",
                          fontSize: 12,
                          fontWeight: 900,
                          border: "1px solid #FED7AA",
                        }}
                      >
                        解約済み
                      </span>
                    )}
                  </div>

                  <div style={{ marginTop: 4, color: "#475569", fontWeight: 700 }}>
                    {fmtPrice(s.price, s.billing_cycle)}
                  </div>

                  {tab === "canceled" && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#64748B", fontWeight: 800 }}>
                      解約日: {s.canceled_at ?? "不明"}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {meta.cancel_url && (
                  <a href={meta.cancel_url} target="_blank" rel="noreferrer" style={styles.linkBtn}>
                    解約ページへ
                  </a>
                )}

                {s.status === "active" ? (
                  <button onClick={() => markCanceled(s.id)} style={styles.btn("danger")}>
                    解約済みにする
                  </button>
                ) : (
                  <button onClick={() => restoreActive(s.id)} style={styles.btn("primary")}>
                    再契約（契約中に戻す）
                  </button>
                )}
              </div>
            </section>
          );
        })}

        {!loading && list.length === 0 && (
          <section style={{ ...styles.card, background: "#F8FAFC" }}>
            <div style={{ fontWeight: 900, color: "#0F172A" }}>
              {tab === "active" ? "契約中はまだありません" : "過去はまだありません"}
            </div>
            <div style={{ marginTop: 6, color: "#64748B", fontWeight: 700 }}>
              右上の「＋追加」から登録できます
            </div>
          </section>
        )}
      </div>

      {/* 追加モーダル */}
      {addOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 50,
            overflowY: "auto",
WebkitOverflowScrolling: "touch",
          }}
          onClick={() => {
            setAddOpen(false);
            resetAddModal();
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 620,
              background: "white",
              borderRadius: 18,
              padding: 14,
              border: "1px solid #E5E7EB",
              boxShadow: "0 10px 40px rgba(0,0,0,0.18)",
              maxHeight: "calc(100vh - 32px)",
overflowY: "auto",
WebkitOverflowScrolling: "touch",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <h2 style={{ fontSize: 18, fontWeight: 900, color: "#0F172A" }}>追加</h2>
              <button
                onClick={() => {
                  setAddOpen(false);
                  resetAddModal();
                }}
                style={styles.btn("ghost")}
              >
                閉じる
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                onClick={() => {
                  setAddMode("template");
                  setErr(null);
                  setName("");
                }}
                style={styles.pill(addMode === "template")}
              >
                テンプレ
              </button>
              <button
                onClick={() => {
                  setAddMode("manual");
                  setErr(null);
                  setSelectedService(null);
                  setPlans([]);
                  setSelectedPlanId("");
                  setQ("");
                }}
                style={styles.pill(addMode === "manual")}
              >
                手動
              </button>
            </div>

            {addMode === "template" && (
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <label style={{ fontWeight: 800, color: "#0F172A" }}>
                  テンプレ検索
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    style={{ width: "100%", padding: 12, marginTop: 6, borderRadius: 12, border: "1px solid #E5E7EB" }}
                    placeholder="例: Netflix"
                  />
                </label>

                <div style={{ border: "1px solid #E5E7EB", borderRadius: 14, maxHeight: 240, overflow: "auto" }}>
                  {filteredCatalog.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedService(c)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: 12,
                        borderBottom: "1px solid #F1F5F9",
                        background: selectedService?.id === c.id ? "#F1F5F9" : "white",
                      }}
                    >
                      <div style={{ fontWeight: 900, color: "#0F172A" }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: "#64748B", fontWeight: 800 }}>
                        {c.category ?? ""}{c.cancel_url ? "・解約URLあり" : ""}
                      </div>
                    </button>
                  ))}
                  {filteredCatalog.length === 0 && <div style={{ padding: 12, color: "#64748B", fontWeight: 700 }}>見つからない</div>}
                </div>

                {selectedService && (
                  <>
                    {plans.length > 0 && (
                      <label style={{ fontWeight: 800, color: "#0F172A" }}>
                        プラン
                        <select
                          value={selectedPlanId}
                          onChange={(e) => setSelectedPlanId(e.target.value)}
                          style={{ width: "100%", padding: 12, marginTop: 6, borderRadius: 12, border: "1px solid #E5E7EB" }}
                        >
                          {plans.map((p) => (
                            <option key={p.id} value={p.id}>
                              {(p.plan_name ? `${p.plan_name} ` : "") + `${yen(p.price)} / ${p.billing_cycle}`}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    <label style={{ fontWeight: 800, color: "#0F172A" }}>
                      表示名（任意：空ならテンプレ名）
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        style={{ width: "100%", padding: 12, marginTop: 6, borderRadius: 12, border: "1px solid #E5E7EB" }}
                        placeholder={`例: ${selectedService.name}`}
                      />
                    </label>

                    <div style={{ display: "flex", gap: 8 }}>
                      <label style={{ flex: 1, fontWeight: 800, color: "#0F172A" }}>
                        価格（任意）
                        <input
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                          style={{ width: "100%", padding: 12, marginTop: 6, borderRadius: 12, border: "1px solid #E5E7EB" }}
                          inputMode="numeric"
                          placeholder="例: 980"
                        />
                      </label>

                      <label style={{ width: 160, fontWeight: 800, color: "#0F172A" }}>
                        周期
                        <select
                          value={cycle}
                          onChange={(e) => setCycle(e.target.value as any)}
                          style={{ width: "100%", padding: 12, marginTop: 6, borderRadius: 12, border: "1px solid #E5E7EB" }}
                        >
                          <option value="monthly">monthly</option>
                          <option value="yearly">yearly</option>
                        </select>
                      </label>
                    </div>

                    <label style={{ fontWeight: 800, color: "#0F172A" }}>
                      解約URL（任意）
                      <input
                        value={cancelUrl}
                        onChange={(e) => setCancelUrl(e.target.value)}
                        style={{ width: "100%", padding: 12, marginTop: 6, borderRadius: 12, border: "1px solid #E5E7EB" }}
                        placeholder="https://..."
                      />
                    </label>

                    <button onClick={createFromTemplate} style={styles.btn("primary")}>
                      保存
                    </button>
                  </>
                )}
              </div>
            )}

            {addMode === "manual" && (
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <label style={{ fontWeight: 800, color: "#0F172A" }}>
                  サービス名（必須）
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{ width: "100%", padding: 12, marginTop: 6, borderRadius: 12, border: "1px solid #E5E7EB" }}
                    placeholder="例: Netflix"
                  />
                </label>

                <div style={{ display: "flex", gap: 8 }}>
                  <label style={{ flex: 1, fontWeight: 800, color: "#0F172A" }}>
                    価格（任意）
                    <input
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      style={{ width: "100%", padding: 12, marginTop: 6, borderRadius: 12, border: "1px solid #E5E7EB" }}
                      inputMode="numeric"
                      placeholder="例: 980"
                    />
                  </label>

                  <label style={{ width: 160, fontWeight: 800, color: "#0F172A" }}>
                    周期
                    <select
                      value={cycle}
                      onChange={(e) => setCycle(e.target.value as any)}
                      style={{ width: "100%", padding: 12, marginTop: 6, borderRadius: 12, border: "1px solid #E5E7EB" }}
                    >
                      <option value="monthly">monthly</option>
                      <option value="yearly">yearly</option>
                    </select>
                  </label>
                </div>

                <label style={{ fontWeight: 800, color: "#0F172A" }}>
                  解約URL（任意）
                  <input
                    value={cancelUrl}
                    onChange={(e) => setCancelUrl(e.target.value)}
                    style={{ width: "100%", padding: 12, marginTop: 6, borderRadius: 12, border: "1px solid #E5E7EB" }}
                    placeholder="https://..."
                  />
                </label>

                <button onClick={createManual} style={styles.btn("primary")}>
                  保存
                </button>
              </div>
            )}

            <div style={{ marginTop: 10, fontSize: 12, color: "#64748B", fontWeight: 700 }}>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}