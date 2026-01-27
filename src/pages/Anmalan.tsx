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

type Section = "sparare" | "upptackare" | "aventyrare" | "utmanare" | "rover";

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
  const [section, setSection] = useState<Section>("sparare");
  const [memberCount, setMemberCount] = useState<string>(""); // optional
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
        console.error(error);
        setCompetitions([]);
        setMessage("Kunde inte hämta aktiva tävlingar.");
        setLoading(false);
        return;
      }

      const list = (data ?? []) as Competition[];
      setCompetitions(list);

      // Auto-select
      if (list.length === 1) {
        setSelectedCompetitionId(list[0].id);
      } else if (list.length > 1) {
        setSelectedCompetitionId((prev) => prev || list[0].id);
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
      setSelectedScoutGroupId("");

      if (!selectedCompetitionId) return;

      const { data, error } = await supabase
        .from("scout_groups")
        .select("id,name,competition_id")
        .eq("competition_id", selectedCompetitionId)
        .order("name", { ascending: true });

      if (error) {
        console.error(error);
        setMessage("Kunde inte hämta kårer för vald tävling.");
        return;
      }

      const groups = (data ?? []) as ScoutGroup[];
      setScoutGroups(groups);

      if (groups.length === 1) {
        setSelectedScoutGroupId(groups[0].id);
      }
    })();
  }, [selectedCompetitionId]);

  const selectedScoutGroup = useMemo(() => {
    return scoutGroups.find((g) => g.id === selectedScoutGroupId) ?? null;
  }, [scoutGroups, selectedScoutGroupId]);

  const disabled = useMemo(() => {
    return (
      submitting ||
      !selectedCompetitionId ||
      !patrolName.trim() ||
      !selectedScoutGroupId ||
      !contactEmail.trim()
    );
  }, [submitting, selectedCompetitionId, patrolName, selectedScoutGroupId, contactEmail]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!selectedCompetitionId) {
      setMessage("Välj en tävling.");
      return;
    }

    if (!selectedScoutGroup) {
      setMessage("Välj en kår.");
      return;
    }

    // member_count: optional (om tomt -> null)
    const parsedMemberCount =
      memberCount.trim() === "" ? null : Number(memberCount);

    if (parsedMemberCount !== null && (!Number.isFinite(parsedMemberCount) || parsedMemberCount < 0)) {
      setMessage("Antal medlemmar måste vara ett giltigt tal (0 eller mer).");
      return;
    }

    setSubmitting(true);

    // ✅ Matchar exakt public.patrol_registrations-kolumnerna
    const payload = {
      competition_id: selectedCompetitionId,
      patrol_name: patrolName.trim(),
      scout_group_name: selectedScoutGroup.name, // <- viktigt: DB vill ha NAME (text)
      section, // <- viktigt: matcha enum värden
      member_count: parsedMemberCount,
      contact_email: contactEmail.trim(),
      status: "pending",
    };

    const { error } = await supabase.from("patrol_registrations").insert(payload);

    if (error) {
      console.error(error);
      setMessage(`Något gick fel när anmälan skulle skickas. (${error.message})`);
      setSubmitting(false);
      return;
    }

    setMessage("✅ Tack! Anmälan är inskickad och väntar på godkännande.");
    setPatrolName("");
    setContactEmail("");
    setSection("sparare");
    setMemberCount("");
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
          Anmäl patrull till: <span className="font-medium">{selectedCompetition?.name}</span>
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
            <option value="" disabled>
              {selectedCompetitionId
                ? scoutGroups.length > 0
                  ? "Välj kår"
                  : "Inga kårer kopplade till tävlingen"
                : "Välj tävling först"}
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
            onChange={(e) => setSection(e.target.value as Section)}
          >
            <option value="sparare">Spårare</option>
            <option value="upptackare">Upptäckare</option>
            <option value="aventyrare">Äventyrare</option>
            <option value="utmanare">Utmanare</option>
          </select>
        </div>

        <div className="space-y-1">
          <Label>Antal medlemmar</Label>
          <Input
            inputMode="numeric"
            placeholder="Valfritt"
            value={memberCount}
            onChange={(e) => setMemberCount(e.target.value)}
          />
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
