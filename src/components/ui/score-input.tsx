import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Minus, Plus } from "lucide-react";

type ScoreInputProps = {
  value: number;
  maxScore: number;
  onChange: (score: number) => void;

  /** NEW */
  disabled?: boolean;

  /**
   * NEW: debounce på textinput så du slipper DB-write per tangenttryckning.
   * Default: 350ms
   */
  debounceMs?: number;

  /** NEW: om du vill visa +/- knappar (default true) */
  showButtons?: boolean;

  /** NEW: min score (default 0) */
  minScore?: number;

  className?: string;
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function ScoreInput({
  value,
  maxScore,
  onChange,
  disabled = false,
  debounceMs = 350,
  showButtons = true,
  minScore = 0,
  className,
}: ScoreInputProps) {
  // local input state så vi kan debounca typing
  const [draft, setDraft] = useState<string>(String(value ?? 0));

  // håll draft i sync om value ändras utifrån (t.ex. efter DB fetch)
  useEffect(() => {
    setDraft(String(value ?? 0));
  }, [value]);

  const min = useMemo(() => minScore, [minScore]);
  const max = useMemo(() => maxScore ?? 0, [maxScore]);

  const timerRef = useRef<number | null>(null);

  const commit = (raw: string) => {
    const parsed = Number(raw);
    const safe = Number.isFinite(parsed) ? parsed : min;
    const next = clamp(Math.round(safe), min, max);
    onChange(next);
  };

  // Debounce commit när man skriver manuellt
  useEffect(() => {
    if (disabled) return;

    // rensa tidigare timer
    if (timerRef.current) window.clearTimeout(timerRef.current);

    timerRef.current = window.setTimeout(() => {
      commit(draft);
    }, debounceMs);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, debounceMs, disabled]);

  const step = (delta: number) => {
    if (disabled) return;

    // när man klickar +/- vill vi committa direkt (inte debounce)
    if (timerRef.current) window.clearTimeout(timerRef.current);

    const current = Number(draft);
    const safe = Number.isFinite(current) ? current : (value ?? 0);
    const next = clamp(safe + delta, min, max);

    setDraft(String(next));
    onChange(next);
  };

  const onBlur = () => {
    // commit direkt på blur för att inte lämna "halv" value
    if (disabled) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    commit(draft);
  };

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      {showButtons && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => step(-1)}
          disabled={disabled || Number(draft) <= min}
          aria-label="Minska poäng"
        >
          <Minus className="h-4 w-4" />
        </Button>
      )}

      <Input
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft}
        onChange={(e) => {
          // Tillåt tomt medan man skriver, men håll det numeriskt
          const v = e.target.value;
          if (v === "") return setDraft("");
          if (/^\d+$/.test(v)) setDraft(v);
        }}
        onBlur={onBlur}
        disabled={disabled}
        className="w-20 text-center"
        aria-label="Poäng"
      />

      {showButtons && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => step(1)}
          disabled={disabled || Number(draft) >= max}
          aria-label="Öka poäng"
        >
          <Plus className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
