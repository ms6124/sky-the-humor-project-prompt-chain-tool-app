"use client";

import { useEffect, useMemo, useState } from "react";
import { type Session } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

type ThemeMode = "system" | "light" | "dark";

type Profile = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  is_superadmin: boolean;
  is_matrix_admin: boolean;
};

type HumorFlavor = {
  id: number;
  slug: string;
  description?: string | null;
  created_datetime_utc?: string | null;
};

type HumorFlavorStep = {
  id: number;
  humor_flavor_id: number;
  order_by: number;
  llm_temperature?: number | null;
  llm_input_type_id: number;
  llm_output_type_id: number;
  llm_model_id: number;
  humor_flavor_step_type_id: number;
  llm_system_prompt?: string | null;
  llm_user_prompt?: string | null;
  description?: string | null;
};

type Caption = {
  id: string;
  content?: string | null;
  created_datetime_utc?: string | null;
  image_id?: string | null;
  profile_id?: string | null;
};

type TestRun = {
  fileName: string;
  status: "idle" | "running" | "done" | "error";
  captions?: Caption[];
  error?: string;
};

const THEME_KEY = "humor-theme";

export default function Home() {
  const supabase = useMemo(() => createClient(), []);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [status, setStatus] = useState("Awaiting login.");

  const [flavors, setFlavors] = useState<HumorFlavor[]>([]);
  const [selectedFlavorId, setSelectedFlavorId] = useState<number | null>(null);
  const [steps, setSteps] = useState<HumorFlavorStep[]>([]);
  const [captions, setCaptions] = useState<Caption[]>([]);

  const [newFlavor, setNewFlavor] = useState({ slug: "", description: "" });
  const [editingFlavor, setEditingFlavor] = useState({ slug: "", description: "" });
  const [showNewFlavor, setShowNewFlavor] = useState(false);

  const [stepDraft, setStepDraft] = useState({
    order_by: "",
    llm_input_type_id: "",
    llm_output_type_id: "",
    llm_model_id: "",
    humor_flavor_step_type_id: "",
    llm_temperature: "",
    llm_system_prompt: "",
    llm_user_prompt: "",
    description: "",
  });
  const [editingStepId, setEditingStepId] = useState<number | null>(null);

  const [testFiles, setTestFiles] = useState<File[]>([]);
  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [fileWarning, setFileWarning] = useState("");

  const isAdmin = Boolean(profile?.is_superadmin || profile?.is_matrix_admin);

  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_KEY) as ThemeMode | null;
    if (savedTheme) setTheme(savedTheme);
  }, []);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    if (theme === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, [theme]);

  useEffect(() => {
    let active = true;

    const initSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setSession(data.session ?? null);
    };

    initSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, sessionState) => {
      if (!active) return;
      setSession(sessionState ?? null);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    const loadProfile = async () => {
      if (!session?.user) {
        setProfile(null);
        setStatus("Sign in to continue.");
        return;
      }

      setStatus("Checking admin access…");
      const { data, error } = await supabase
        .from("profiles")
        .select("id,first_name,last_name,email,is_superadmin,is_matrix_admin")
        .eq("id", session.user.id)
        .maybeSingle();

      if (error) {
        setProfile(null);
        setStatus(error.message);
        return;
      }

      setProfile(data ?? null);
      if (!data) {
        setStatus("Profile not found for this user.");
        return;
      }
      setStatus(
        data.is_superadmin || data.is_matrix_admin
          ? "Access granted."
          : "Access denied: admin role required."
      );
    };

    loadProfile();
  }, [session, supabase]);

  const signInWithGoogle = async () => {
    if (!supabaseUrl) {
      setStatus("Missing NEXT_PUBLIC_SUPABASE_URL.");
      return;
    }

    setStatus("Redirecting to Google…");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus(error.message);
    }
  };

  const signOut = async () => {
    setStatus("Signing out…");
    await supabase.auth.signOut();
    setProfile(null);
    setFlavors([]);
    setSteps([]);
    setCaptions([]);
    setSelectedFlavorId(null);
    setStatus("Signed out.");
  };

  const loadFlavors = async () => {
    if (!isAdmin) return;
    setStatus("Loading humor flavors…");
    const { data, error } = await supabase
      .from("humor_flavors")
      .select("*")
      .order("created_datetime_utc", { ascending: false });

    if (error) {
      setStatus(error.message);
      return;
    }

    setFlavors(data ?? []);
    if (data?.length && !selectedFlavorId) {
      setSelectedFlavorId(data[0].id);
      setEditingFlavor({
        slug: data[0].slug ?? "",
        description: data[0].description ?? "",
      });
    }
    setStatus("Humor flavors loaded.");
  };

  const createFlavor = async () => {
    if (!isAdmin) return;
    setStatus("Creating humor flavor…");
    const payload = {
      slug: newFlavor.slug.trim(),
      description: newFlavor.description.trim() || null,
    };
    const { data, error } = await supabase
      .from("humor_flavors")
      .insert(payload)
      .select("*");

    if (error) {
      setStatus(error.message);
      return;
    }

    const created = data?.[0];
    if (!created) return;
    setFlavors((prev) => [created, ...prev]);
    setNewFlavor({ slug: "", description: "" });
    setSelectedFlavorId(created.id);
    setEditingFlavor({ slug: created.slug, description: created.description ?? "" });
    setStatus("Humor flavor created.");
  };

  const updateFlavor = async () => {
    if (!selectedFlavorId || !isAdmin) return;
    setStatus("Updating humor flavor…");
    const { error } = await supabase
      .from("humor_flavors")
      .update({
        slug: editingFlavor.slug.trim(),
        description: editingFlavor.description.trim() || null,
      })
      .eq("id", selectedFlavorId);

    if (error) {
      setStatus(error.message);
      return;
    }

    setFlavors((prev) =>
      prev.map((item) =>
        item.id === selectedFlavorId
          ? {
              ...item,
              slug: editingFlavor.slug.trim(),
              description: editingFlavor.description.trim() || null,
            }
          : item
      )
    );
    setStatus("Humor flavor updated.");
  };

  const deleteFlavor = async () => {
    if (!selectedFlavorId || !isAdmin) return;
    if (!confirm("Delete this humor flavor and its steps?")) return;
    setStatus("Deleting humor flavor…");
    const { error } = await supabase
      .from("humor_flavors")
      .delete()
      .eq("id", selectedFlavorId);

    if (error) {
      setStatus(error.message);
      return;
    }

    setFlavors((prev) => prev.filter((item) => item.id !== selectedFlavorId));
    setSelectedFlavorId(null);
    setSteps([]);
    setCaptions([]);
    setStatus("Humor flavor deleted.");
  };

  const loadSteps = async (flavorId = selectedFlavorId) => {
    if (!flavorId || !isAdmin) return;
    setStatus("Loading flavor steps…");
    const { data, error } = await supabase
      .from("humor_flavor_steps")
      .select("*")
      .eq("humor_flavor_id", flavorId)
      .order("order_by", { ascending: true });

    if (error) {
      setStatus(error.message);
      return;
    }

    setSteps(data ?? []);
    setStatus("Flavor steps loaded.");
  };

  const resetStepDraft = () => {
    setStepDraft({
      order_by: "",
      llm_input_type_id: "",
      llm_output_type_id: "",
      llm_model_id: "",
      humor_flavor_step_type_id: "",
      llm_temperature: "",
      llm_system_prompt: "",
      llm_user_prompt: "",
      description: "",
    });
    setEditingStepId(null);
  };

  const upsertStep = async () => {
    if (!selectedFlavorId || !isAdmin) return;

    const orderBy = Number(stepDraft.order_by);
    const payload = {
      humor_flavor_id: selectedFlavorId,
      order_by: Number.isNaN(orderBy) || orderBy === 0 ? steps.length + 1 : orderBy,
      llm_input_type_id: Number(stepDraft.llm_input_type_id),
      llm_output_type_id: Number(stepDraft.llm_output_type_id),
      llm_model_id: Number(stepDraft.llm_model_id),
      humor_flavor_step_type_id: Number(stepDraft.humor_flavor_step_type_id),
      llm_temperature: stepDraft.llm_temperature
        ? Number(stepDraft.llm_temperature)
        : null,
      llm_system_prompt: stepDraft.llm_system_prompt.trim() || null,
      llm_user_prompt: stepDraft.llm_user_prompt.trim() || null,
      description: stepDraft.description.trim() || null,
    };

    setStatus(editingStepId ? "Updating step…" : "Creating step…");
    const query = editingStepId
      ? supabase.from("humor_flavor_steps").update(payload).eq("id", editingStepId)
      : supabase.from("humor_flavor_steps").insert(payload);

    const { error } = await query;
    if (error) {
      setStatus(error.message);
      return;
    }

    resetStepDraft();
    await loadSteps(selectedFlavorId);
    setStatus("Step saved.");
  };

  const editStep = (step: HumorFlavorStep) => {
    setEditingStepId(step.id);
    setStepDraft({
      order_by: String(step.order_by ?? ""),
      llm_input_type_id: String(step.llm_input_type_id ?? ""),
      llm_output_type_id: String(step.llm_output_type_id ?? ""),
      llm_model_id: String(step.llm_model_id ?? ""),
      humor_flavor_step_type_id: String(step.humor_flavor_step_type_id ?? ""),
      llm_temperature: step.llm_temperature ? String(step.llm_temperature) : "",
      llm_system_prompt: step.llm_system_prompt ?? "",
      llm_user_prompt: step.llm_user_prompt ?? "",
      description: step.description ?? "",
    });
  };

  const deleteStep = async (stepId: number) => {
    if (!isAdmin) return;
    if (!confirm("Delete this step?")) return;
    setStatus("Deleting step…");
    const { error } = await supabase
      .from("humor_flavor_steps")
      .delete()
      .eq("id", stepId);

    if (error) {
      setStatus(error.message);
      return;
    }

    await loadSteps(selectedFlavorId ?? undefined);
    setStatus("Step deleted.");
  };

  const moveStep = async (stepId: number, direction: "up" | "down") => {
    if (!isAdmin) return;
    const index = steps.findIndex((step) => step.id === stepId);
    if (index < 0) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    const step = steps[index];
    const swap = steps[targetIndex];
    if (!swap) return;

    setStatus("Reordering step…");
    const updateFirst = supabase
      .from("humor_flavor_steps")
      .update({ order_by: swap.order_by })
      .eq("id", step.id);
    const updateSecond = supabase
      .from("humor_flavor_steps")
      .update({ order_by: step.order_by })
      .eq("id", swap.id);

    const [first, second] = await Promise.all([updateFirst, updateSecond]);
    if (first.error || second.error) {
      setStatus(first.error?.message || second.error?.message || "Reorder failed.");
      return;
    }

    await loadSteps(selectedFlavorId ?? undefined);
    setStatus("Step order updated.");
  };

  const loadCaptions = async () => {
    if (!selectedFlavorId || !isAdmin) return;
    setStatus("Loading captions…");
    const { data, error } = await supabase
      .from("captions")
      .select("id,content,created_datetime_utc,image_id,profile_id")
      .eq("humor_flavor_id", selectedFlavorId)
      .order("created_datetime_utc", { ascending: false })
      .limit(50);

    if (error) {
      setStatus(error.message);
      return;
    }

    setCaptions(data ?? []);
    setStatus("Captions loaded.");
  };

  const runCaptionPipeline = async (file: File) => {
    if (!selectedFlavorId) throw new Error("Select a humor flavor first.");
    if (!session?.access_token) throw new Error("JWT token required for pipeline API.");

    const presignRes = await fetch(
      "https://api.almostcrackd.ai/pipeline/generate-presigned-url",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ contentType: file.type }),
      }
    );
    if (!presignRes.ok) {
      throw new Error(await presignRes.text());
    }
    const presignData = (await presignRes.json()) as {
      presignedUrl: string;
      cdnUrl: string;
    };

    const uploadRes = await fetch(presignData.presignedUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!uploadRes.ok) {
      throw new Error("Upload to presigned URL failed.");
    }

    const registerRes = await fetch(
      "https://api.almostcrackd.ai/pipeline/upload-image-from-url",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageUrl: presignData.cdnUrl,
          isCommonUse: false,
        }),
      }
    );
    if (!registerRes.ok) {
      throw new Error(await registerRes.text());
    }
    const registerData = (await registerRes.json()) as { imageId: string };

    const captionRes = await fetch(
      "https://api.almostcrackd.ai/pipeline/generate-captions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageId: registerData.imageId,
          humorFlavorId: selectedFlavorId,
        }),
      }
    );
    const captionText = await captionRes.text();
    if (!captionRes.ok) {
      throw new Error(captionText || "Caption generation failed.");
    }
    try {
      return JSON.parse(captionText) as Caption[];
    } catch {
      throw new Error(captionText || "Caption generation returned non-JSON.");
    }
  };

  const runTestSet = async () => {
    if (!testFiles.length) return;
    const initialRuns = testFiles.map((file) => ({
      fileName: file.name,
      status: "running" as const,
    }));
    setTestRuns(initialRuns);
    for (const [index, file] of testFiles.entries()) {
      try {
        const captionsResponse = await runCaptionPipeline(file);
        setTestRuns((prev) =>
          prev.map((run, runIndex) =>
            runIndex === index
              ? {
                  ...run,
                  status: "done",
                  captions: captionsResponse,
                }
              : run
          )
        );
      } catch (error) {
        setTestRuns((prev) =>
          prev.map((run, runIndex) =>
            runIndex === index
              ? {
                  ...run,
                  status: "error",
                  error: error instanceof Error ? error.message : "Pipeline failed.",
                }
              : run
          )
        );
      }
    }
  };

  useEffect(() => {
    if (selectedFlavorId && isAdmin) {
      loadSteps(selectedFlavorId);
      loadCaptions();
      const selected = flavors.find((item) => item.id === selectedFlavorId);
      if (selected) {
        setEditingFlavor({
          slug: selected.slug ?? "",
          description: selected.description ?? "",
        });
      }
    }
  }, [selectedFlavorId, flavors.length, isAdmin]);

  return (
    <div className="min-h-screen px-4 py-10 text-[15px] md:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="rounded-3xl border border-[var(--stroke)] bg-[var(--surface)] px-6 py-7 shadow-[var(--shadow)]">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                Prompt Chain Control Room
              </p>
              <h1 className="display text-3xl font-semibold md:text-4xl">
                Humor Flavor Studio
              </h1>
              <p className="max-w-2xl text-sm text-[var(--muted)]">
                Craft, sequence, and test multi-step humor flavors for the
                caption pipeline. Access is restricted to matrix or super admins.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-full border border-[var(--stroke)] bg-[var(--surface-2)] px-4 py-2 text-xs text-[var(--muted)]">
                {status}
              </div>
              <div className="flex items-center gap-2 rounded-full border border-[var(--stroke)] bg-[var(--surface-2)] px-3 py-2">
                <span className="text-xs text-[var(--muted)]">Theme</span>
                <select
                  value={theme}
                  onChange={(event) => setTheme(event.target.value as ThemeMode)}
                  className="rounded-full border border-transparent bg-transparent text-xs uppercase tracking-[0.18em] text-[var(--ink)]"
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.9fr]">
          <div className="flex flex-col gap-6">
            <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]">
              <h2 className="text-lg font-semibold">Access + Settings</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Sign in with Google. The tool unlocks only for profiles flagged
                as admins.
              </p>
              <div className="mt-5 flex flex-col gap-4">
                <div className="flex flex-wrap gap-3">
                  {!session ? (
                    <button
                      onClick={signInWithGoogle}
                      className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-[var(--accent-strong)]"
                    >
                      Sign In With Google
                    </button>
                  ) : (
                    <button
                      onClick={signOut}
                      className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ink)] transition hover:bg-[var(--surface-2)]"
                    >
                      Sign Out
                    </button>
                  )}
                  <button
                    onClick={loadFlavors}
                    disabled={!isAdmin}
                    className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ink)] transition hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:text-[var(--muted)]"
                  >
                    Load Flavors
                  </button>
                </div>
              </div>
              <div className="mt-6 rounded-2xl border border-dashed border-[var(--stroke)] bg-[var(--surface-2)] p-4 text-sm text-[var(--muted)]">
                {profile ? (
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.2em]">
                      Active Profile
                    </p>
                    <p className="text-base text-[var(--ink)]">
                      {profile.first_name || profile.last_name
                        ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`
                        : profile.email || profile.id}
                    </p>
                    <p className="text-xs">
                      Admin status: {isAdmin ? "Granted" : "Denied"}
                    </p>
                  </div>
                ) : (
                  <p>Connect a profile to unlock the admin tool.</p>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Humor Flavors</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowNewFlavor((prev) => !prev)}
                    disabled={!isAdmin}
                    className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {showNewFlavor ? "Close" : "Add"}
                  </button>
                  <button
                    onClick={loadFlavors}
                    disabled={!isAdmin}
                    className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs uppercase tracking-[0.2em] text-[var(--muted)] hover:bg-[var(--surface-2)] disabled:cursor-not-allowed"
                  >
                    Refresh
                  </button>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {showNewFlavor && (
                  <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface-2)] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                    New Flavor
                  </p>
                  <div className="mt-3 flex flex-col gap-3">
                    <input
                      value={newFlavor.slug}
                      onChange={(event) =>
                        setNewFlavor((prev) => ({
                          ...prev,
                          slug: event.target.value,
                        }))
                      }
                      placeholder="flavor slug"
                      className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface-2)] px-3 py-2 text-sm"
                    />
                    <textarea
                      value={newFlavor.description}
                      onChange={(event) =>
                        setNewFlavor((prev) => ({
                          ...prev,
                          description: event.target.value,
                        }))
                      }
                      placeholder="Short description"
                      className="min-h-[90px] rounded-2xl border border-[var(--stroke)] bg-[var(--surface-2)] px-3 py-2 text-sm"
                    />
                    <button
                      onClick={createFlavor}
                      disabled={!isAdmin || !newFlavor.slug.trim()}
                      className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Create Flavor
                    </button>
                  </div>
                </div>
                )}
                {flavors.map((flavor) => (
                  <button
                    key={flavor.id}
                    onClick={() => setSelectedFlavorId(flavor.id)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      flavor.id === selectedFlavorId
                        ? "border-[var(--accent)] bg-[var(--surface-2)]"
                        : "border-[var(--stroke)] hover:bg-[var(--surface-2)]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{flavor.slug}</span>
                      <span className="text-xs text-[var(--muted)]">#{flavor.id}</span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {flavor.description || "No description yet."}
                    </p>
                  </button>
                ))}
                {!flavors.length && !showNewFlavor && (
                  <p className="rounded-2xl border border-dashed border-[var(--stroke)] px-4 py-6 text-sm text-[var(--muted)]">
                    No flavors yet. Create one above.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">1) Flavor details</h2>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => selectedFlavorId && loadSteps(selectedFlavorId)}
                    disabled={!isAdmin || !selectedFlavorId}
                    className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs uppercase tracking-[0.2em] text-[var(--muted)] hover:bg-[var(--surface-2)] disabled:cursor-not-allowed"
                  >
                    Refresh Steps
                  </button>
                  <button
                    onClick={deleteFlavor}
                    disabled={!isAdmin || !selectedFlavorId}
                    className="rounded-full border border-red-500/40 px-3 py-1 text-xs uppercase tracking-[0.2em] text-red-500 hover:bg-red-500/10 disabled:cursor-not-allowed"
                  >
                    Delete Flavor
                  </button>
                </div>
              </div>
              {!selectedFlavorId ? (
                <p className="mt-4 text-sm text-[var(--muted)]">
                  Select a humor flavor to edit its chain.
                </p>
              ) : (
                <div className="mt-4 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
                  <div className="space-y-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                      Flavor Metadata
                    </p>
                    <input
                      value={editingFlavor.slug}
                      onChange={(event) =>
                        setEditingFlavor((prev) => ({
                          ...prev,
                          slug: event.target.value,
                        }))
                      }
                      className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface-2)] px-3 py-2 text-sm"
                    />
                    <textarea
                      value={editingFlavor.description}
                      onChange={(event) =>
                        setEditingFlavor((prev) => ({
                          ...prev,
                          description: event.target.value,
                        }))
                      }
                      className="min-h-[90px] rounded-2xl border border-[var(--stroke)] bg-[var(--surface-2)] px-3 py-2 text-sm"
                    />
                    <button
                      onClick={updateFlavor}
                      disabled={!isAdmin}
                      className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Update Flavor
                    </button>
                  </div>
                  <div className="rounded-2xl border border-dashed border-[var(--stroke)] bg-[var(--surface-2)] p-4 text-sm text-[var(--muted)]">
                    <p className="text-xs uppercase tracking-[0.2em]">Flavor Notes</p>
                    <p className="mt-2">
                      Steps run in order. Use the chain editor below to define
                      each transformation (description → joke → captions).
                    </p>
                    <p className="mt-3">
                      Keep prompts modular; each step receives the previous
                      output as input.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">2) Chain steps</h2>
                <button
                  onClick={resetStepDraft}
                  className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs uppercase tracking-[0.2em] text-[var(--muted)] hover:bg-[var(--surface-2)]"
                >
                  New Draft
                </button>
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                <div className="space-y-3">
                  {steps.map((step, index) => (
                    <div
                      key={step.id}
                      className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface-2)] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                            Step {step.order_by}
                          </p>
                          <p className="mt-1 font-semibold">
                            {step.description || "Untitled step"}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => moveStep(step.id, "up")}
                            disabled={index === 0}
                            className="rounded-full border border-[var(--stroke)] px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--surface-3)] disabled:cursor-not-allowed"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveStep(step.id, "down")}
                            disabled={index === steps.length - 1}
                            className="rounded-full border border-[var(--stroke)] px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--surface-3)] disabled:cursor-not-allowed"
                          >
                            ↓
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-[var(--muted)]">
                        <p>Model: {step.llm_model_id}</p>
                        <p>
                          IO: {step.llm_input_type_id} → {step.llm_output_type_id}
                        </p>
                        <p>Type: {step.humor_flavor_step_type_id}</p>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          onClick={() => editStep(step)}
                          className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs uppercase tracking-[0.2em] text-[var(--muted)] hover:bg-[var(--surface-3)]"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteStep(step.id)}
                          className="rounded-full border border-red-500/40 px-3 py-1 text-xs uppercase tracking-[0.2em] text-red-500 hover:bg-red-500/10"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                  {!steps.length && (
                    <p className="rounded-2xl border border-dashed border-[var(--stroke)] px-4 py-6 text-sm text-[var(--muted)]">
                      No steps yet. Build the chain on the right.
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface-2)] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                    {editingStepId ? "Edit Step" : "Create Step"}
                  </p>
                  <div className="mt-3 grid gap-3 text-sm">
                    <input
                      value={stepDraft.description}
                      onChange={(event) =>
                        setStepDraft((prev) => ({
                          ...prev,
                          description: event.target.value,
                        }))
                      }
                      placeholder="Step description"
                      className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={stepDraft.order_by}
                        onChange={(event) =>
                          setStepDraft((prev) => ({
                            ...prev,
                            order_by: event.target.value,
                          }))
                        }
                        placeholder="Order"
                        className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2"
                      />
                      <input
                        value={stepDraft.llm_temperature}
                        onChange={(event) =>
                          setStepDraft((prev) => ({
                            ...prev,
                            llm_temperature: event.target.value,
                          }))
                        }
                        placeholder="Temperature"
                        className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={stepDraft.llm_input_type_id}
                        onChange={(event) =>
                          setStepDraft((prev) => ({
                            ...prev,
                            llm_input_type_id: event.target.value,
                          }))
                        }
                        placeholder="Input type id"
                        className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2"
                      />
                      <input
                        value={stepDraft.llm_output_type_id}
                        onChange={(event) =>
                          setStepDraft((prev) => ({
                            ...prev,
                            llm_output_type_id: event.target.value,
                          }))
                        }
                        placeholder="Output type id"
                        className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={stepDraft.llm_model_id}
                        onChange={(event) =>
                          setStepDraft((prev) => ({
                            ...prev,
                            llm_model_id: event.target.value,
                          }))
                        }
                        placeholder="Model id"
                        className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2"
                      />
                      <input
                        value={stepDraft.humor_flavor_step_type_id}
                        onChange={(event) =>
                          setStepDraft((prev) => ({
                            ...prev,
                            humor_flavor_step_type_id: event.target.value,
                          }))
                        }
                        placeholder="Step type id"
                        className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2"
                      />
                    </div>
                    <textarea
                      value={stepDraft.llm_system_prompt}
                      onChange={(event) =>
                        setStepDraft((prev) => ({
                          ...prev,
                          llm_system_prompt: event.target.value,
                        }))
                      }
                      placeholder="System prompt"
                      className="min-h-[90px] rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2"
                    />
                    <textarea
                      value={stepDraft.llm_user_prompt}
                      onChange={(event) =>
                        setStepDraft((prev) => ({
                          ...prev,
                          llm_user_prompt: event.target.value,
                        }))
                      }
                      placeholder="User prompt"
                      className="min-h-[90px] rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2"
                    />
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={upsertStep}
                        disabled={!isAdmin || !selectedFlavorId}
                        className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {editingStepId ? "Update Step" : "Add Step"}
                      </button>
                      {editingStepId && (
                        <button
                          onClick={resetStepDraft}
                          className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)] hover:bg-[var(--surface-3)]"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]">
              <h2 className="text-lg font-semibold">3) Test &amp; Results</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Run the pipeline on a test set and review stored captions side by side.
              </p>
              <div className="mt-5 grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">Captions</h2>
                  <button
                    onClick={loadCaptions}
                    disabled={!isAdmin || !selectedFlavorId}
                    className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs uppercase tracking-[0.2em] text-[var(--muted)] hover:bg-[var(--surface-2)] disabled:cursor-not-allowed"
                  >
                    Refresh
                  </button>
                </div>
                <div className="mt-4 space-y-3">
                  {captions.map((caption) => (
                    <div
                      key={caption.id}
                      className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface-2)] p-4"
                    >
                      <p className="text-sm">{caption.content}</p>
                      <p className="mt-2 text-xs text-[var(--muted)]">
                        {caption.created_datetime_utc || ""} · Image {caption.image_id}
                      </p>
                    </div>
                  ))}
                  {!captions.length && (
                    <p className="rounded-2xl border border-dashed border-[var(--stroke)] px-4 py-6 text-sm text-[var(--muted)]">
                      No captions loaded yet.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">Test a Flavor</h2>
                  <button
                    onClick={runTestSet}
                    disabled={!isAdmin || !selectedFlavorId || !testFiles.length}
                    className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Run Test Set
                  </button>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Upload an image test set to run through the caption pipeline with
                  the selected humor flavor.
                </p>
                <div className="mt-4 flex flex-col gap-4">
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                  onChange={(event) =>
                    (() => {
                      const files = event.target.files
                        ? Array.from(event.target.files)
                        : [];
                      const rejected = files.filter(
                        (file) => file.type === "image/heic" || file.name.endsWith(".heic")
                      );
                      const accepted = files.filter(
                        (file) => file.type !== "image/heic" && !file.name.endsWith(".heic")
                      );
                      if (rejected.length) {
                        setFileWarning(
                          "HEIC files are not supported yet. Please convert to JPEG/PNG/WebP."
                        );
                      } else {
                        setFileWarning("");
                      }
                      setTestFiles(accepted);
                    })()
                  }
                  className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface-2)] px-3 py-2 text-sm"
                />
                {fileWarning && (
                  <p className="text-xs text-amber-600">{fileWarning}</p>
                )}
                  <div className="grid gap-3">
                    {testRuns.map((run) => (
                      <div
                        key={run.fileName}
                        className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface-2)] p-4"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{run.fileName}</span>
                          <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                            {run.status}
                          </span>
                        </div>
                        {run.error && (
                          <p className="mt-2 text-xs text-red-500">{run.error}</p>
                        )}
                        {run.captions && (
                          <div className="mt-3 space-y-2 text-sm">
                            {run.captions.map((caption) => (
                              <p key={caption.id}>• {caption.content}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {!testRuns.length && (
                      <p className="rounded-2xl border border-dashed border-[var(--stroke)] px-4 py-6 text-sm text-[var(--muted)]">
                        No test runs yet. Select files to generate captions.
                      </p>
                    )}
                  </div>
                </div>
              </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
