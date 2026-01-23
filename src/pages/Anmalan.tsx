import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Competition = {
  id: string;
  name: string;
  date: string | null;
  is_active: boolean;
};

type ScoutGroup = {
  id: string;
  name: string;
  competition_id: string;
};

function formatSupabaseError(error: any) {
  if (!error) return null;
  const msg = error.message ? String(error.message) : "Okänt fel";
  const details = error.details ? String(error.details) : "";
  const hint = error.hint ? String(error.hint) : "";
  const code = error.code ? String(error.code) : "";
  const extra = [details, hint, code ? `code: ${code}` : ""].filter(Boolean).join(" — ");
  return extra ? `${msg} — ${extra}` : msg;
}

export default function Anmalan() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string>("");

  const [scoutGroups, setScoutGroups] = useState<ScoutGroup[]>([]);
  const [selectedScoutGroupId, setSelectedScoutGroupId] = useState<string>("");

  const [message, setMessage] = useState<string | null>(null);

  // Form state
  const [patrolName, setPatrolName] = useState("");
  const [section, setSection] = useState<"sparare" | "upptackare" | "aventyrare" | "utmanare">(
    "sparare"
  );
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  // Load active competitions
  useEffect(() => {
    (async () => {
      setLoading(true);
      setMessage(null);

      const { data, error } = await supabase
        .from("competitions")
        .select("id,name,date,is_active")
        .eq("is_active", true)
        .order("date", { ascending: true });

      if (error) {
        console.error("Fetch competitions error:", error);
        setCompetitions([]);
        setMessage(`Kunde inte hämta aktiva tävlingar. (${formatSupabaseError(error)})`);
        setLoading(false);
        return;
      }

      const list = (data ?? []) as Competition[];
      setCompetitions(list);

      // Auto-select if only one, annars defaulta till första om inget valt
      if (list.length === 1) {
        setSelectedCompetitionId(list[0].id);
      } else if (list.length > 1) {
        setSelectedCompetitionId((prev) => (prev ? prev : list[0].id));
      } else {
        setSelectedCompetitionId("");
      }

      setLoading(false);
    })();
  }, []);

  const selectedCompetition = useMemo(() => {
    return competitions.find((c) => c.id === selectedCompetitionId) ?? null;
  }, [competitions, selectedCompetitionId]);

  // Load scout groups for selected competition
  useEffect(() => {
    (async () => {
      setMessage(null);
      setScoutGroups([]);

      if (!selectedCompetitionId) {
        setSelectedScoutGroupId("");
        return;
      }

      const { data, error } = await supabase
        .from("scout_groups")
        .select("id,name,competition_id")
        .eq("competition_id", selectedCompetitionId)
        .order("name", { ascending: true });

      if (error) {
        console.error("Fetch scout_groups error:", error);
        setSelectedScoutGroupId("");
        setMessage(`Kunde inte hämta kårer för vald tävling. (${formatSupabaseError(error)})`);
        return;
      }

      const groups = (data ?? []) as ScoutGroup[];
      setScoutGroups(groups);

      // Behåll tidigare vald kår om den finns i nya listan
      setSelectedScoutGroupId((prev) => {
        if (prev && groups.some((g) => g.id === prev)) return prev;
        if (groups.length === 1) return groups[0].id; // auto-välj om exakt 1
        return ""; // annars tvinga användaren välja
      });
    })();
  }, [selectedCompetitionId]);

  const disabled = useMemo(() => {
    return (
      submitting ||
      !selectedCompetitionId ||
      !patrolName.trim() ||
      !selectedScoutGroupId ||
      !contactName.trim() ||
      !contactEmail.trim()
    );
  }, [submitting, selectedCompetitionId, patrolName, selectedScoutGroupId, contactName, contactEmail]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!selectedCompetitionId) {
      setMessage("Välj en tävling.");
      return;
    }
    if (!selectedScoutGroupId) {
      setMessage("Välj en kår.");
      return;
    }

    setSubmitting(true);

    // OBS: Justera kolumnnamn här om din tabell skiljer sig.
    const payload = {
      competition_id: selectedCompetitionId,
      scout_group_id: selectedScoutGroupId,
      patrol_name: patrolName.trim(),
      scout_section: section,
      contact_name: contactName.trim(),
      contact_email: contactEmail.trim(),
      status: "pending",
    };

    const { data, error } = await supabase
      .from("patrol_registrations")
      .insert(payload)
      .select("id"); // select => bra för att se om RLS stoppar

    if (error) {
      console.error("Insert patrol_registrations error:", error, { payload });
      setMessage(`Något gick fel när anmälan skulle skickas. (${formatSupabaseError(error)})`);
      setSubmitting(false);
      return;
    }

    // Extra säkerhet om insert inte returnerade något
    if (!data || data.length === 0) {
      setMessage(
        "Anmälan skickades inte (ingen rad returnerades). Kontrollera RLS-policy på patrol_registrations."
      );
      setSubmitting(false);
      return;
    }

    setMessage("✅ Tack! Anmälan är inskickad och väntar på godkännande.");
    setPatrolName("");
    setContactName("");
    setContactEmail("");
    setSection("sparare");
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-semibold">Patrullanmälan</h1>
        <p className="mt-2">Laddar…</p>
      </div>
    );
  }

  if (competitions.length === 0) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-semibold">Patrullanmälan</h1>
        <p className="mt-2">Det finns ingen aktiv tävling att anmäla sig till just nu.</p>
        {message && <p className="mt-3 text-sm">{message}</p>}
      </div>
    );
  }

  const showCompetitionSelect = competitions.length > 1;

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold">Patrullanmälan</h1>

      {showCompetitionSelect ? (
        <div className="mt-4 space-y-1">
          <Label>Tävling *</Label>
          <select
            className="w-full rounded-md border bg-background px-3 py-2"
            value={selectedCompetitionId}
            onChange={(e) => setSelectedCompetitionId(e.target.value)}
          >
            {competitions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="mt-2">
          Anmäl patrull till:{" "}
          <span className="font-medium">{selectedCompetition?.name}</span>
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="space-y-1">
          <Label>Patrullnamn *</Label>
          <Input value={patrolName} onChange={(e) => setPatrolName(e.target.value)} />
        </div>

        <div className="space-y-1">
          <Label>Kår *</Label>
          <select
            className="w-full rounded-md border bg-background px-3 py-2"
            value={selectedScoutGroupId}
            onChange={(e) => setSelectedScoutGroupId(e.target.value)}
            disabled={!selectedCompetitionId || scoutGroups.length === 0}
          >
            <option value="">
              {!selectedCompetitionId
                ? "Välj tävling först"
                : scoutGroups.length > 0
                  ? "Välj kår"
                  : "Inga kårer kopplade till tävlingen"}
            </option>

            {scoutGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label>Gren *</Label>
          <select
            className="w-full rounded-md border bg-background px-3 py-2"
            value={section}
            onChange={(e) => setSection(e.target.value as any)}
          >
            <option value="sparare">Spårare</option>
            <option value="upptackare">Upptäckare</option>
            <option value="aventyrare">Äventyrare</option>
            <option value="utmanare">Utmanare</option>
          </select>
        </div>

        <div className="space-y-1">
          <Label>Kontaktperson *</Label>
          <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </div>

        <div className="space-y-1">
          <Label>E-post *</Label>
          <Input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />
        </div>

        <Button type="submit" disabled={disabled}>
          {submitting ? "Skickar…" : "Skicka anmälan"}
        </Button>

        {message && <p className="text-sm mt-2">{message}</p>}
      </form>
    </div>
  );
}
