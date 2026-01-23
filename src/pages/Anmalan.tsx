import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Byt till era shadcn-komponenter om ni redan har dem
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Competition = {
  id: string;
  name: string;
  date: string | null;
  is_active: boolean;
};

export default function Anmalan() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeCompetition, setActiveCompetition] = useState<Competition | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Form state (håll det enkelt)
  const [patrolName, setPatrolName] = useState("");
  const [corpsName, setCorpsName] = useState("");
  const [section, setSection] = useState<"sparare" | "upptackare" | "aventyrare" | "utmanare">("sparare");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMessage(null);

      // Hämtar aktiv tävling (antar en kolumn is_active i competitions)
      const { data, error } = await supabase
        .from("competitions")
        .select("id,name,date,is_active")
        .eq("is_active", true)
        .order("date", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        setMessage("Kunde inte hämta aktiv tävling.");
        setActiveCompetition(null);
      } else {
        setActiveCompetition((data as Competition) ?? null);
      }

      setLoading(false);
    })();
  }, []);

  const disabled = useMemo(() => {
    return (
      !activeCompetition ||
      !patrolName.trim() ||
      !corpsName.trim() ||
      !contactName.trim() ||
      !contactEmail.trim()
    );
  }, [activeCompetition, patrolName, corpsName, contactName, contactEmail]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!activeCompetition) {
      setMessage("Det finns ingen aktiv tävling att anmäla sig till just nu.");
      return;
    }

    setSubmitting(true);

    // OBS: kolumnnamn kan behöva justeras beroende på er schema.
    // Här är ett rimligt upplägg som matchar "inkomna anmälningar"-flödet.
    const payload = {
      competition_id: activeCompetition.id,
      patrol_name: patrolName.trim(),
      corps_name: corpsName.trim(),
      scout_section: section, // eller "section" beroende på schema
      contact_name: contactName.trim(),
      contact_email: contactEmail.trim(),
      contact_phone: contactPhone.trim() || null,
      status: "pending", // om ni har status-kolumn
    };

    const { error } = await supabase.from("patrol_registrations").insert(payload);

    if (error) {
      console.error(error);
      setMessage("Något gick fel när anmälan skulle skickas. Kontrollera fält och försök igen.");
      setSubmitting(false);
      return;
    }

    setMessage("✅ Tack! Anmälan är inskickad och väntar på godkännande.");
    setPatrolName("");
    setCorpsName("");
    setContactName("");
    setContactEmail("");
    setContactPhone("");
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

  if (!activeCompetition) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-semibold">Patrullanmälan</h1>
        <p className="mt-2">Det finns ingen aktiv tävling att anmäla sig till just nu.</p>
        {message && <p className="mt-3 text-sm">{message}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold">Patrullanmälan</h1>
      <p className="mt-2">
        Anmäl patrull till: <span className="font-medium">{activeCompetition.name}</span>
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="space-y-1">
          <Label>Patrullnamn *</Label>
          <Input value={patrolName} onChange={(e) => setPatrolName(e.target.value)} />
        </div>

        <div className="space-y-1">
          <Label>Kår *</Label>
          <Input value={corpsName} onChange={(e) => setCorpsName(e.target.value)} />
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
          <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </div>

        <div className="space-y-1">
          <Label>Telefon</Label>
          <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        </div>

        <Button type="submit" disabled={disabled || submitting}>
          {submitting ? "Skickar…" : "Skicka anmälan"}
        </Button>

        {message && <p className="text-sm mt-2">{message}</p>}
      </form>
    </div>
  );
}
