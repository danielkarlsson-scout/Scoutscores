import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, MailCheck, AlertTriangle } from "lucide-react";

type Status = "loading" | "success" | "error";

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Supabase skickar hit en URL med ?code=... (OAuth/PKCE-flöde)
        const url = window.location.href;
        const hasCode = new URL(url).searchParams.get("code");

        if (!hasCode) {
          // Om någon råkar gå hit manuellt utan code
          if (!cancelled) {
            setStatus("error");
            setErrorMessage("Saknar verifieringskod. Öppna länken från e-postmeddelandet igen.");
          }
          return;
        }

        const { error } = await supabase.auth.exchangeCodeForSession(url);

        if (error) {
          if (!cancelled) {
            setStatus("error");
            setErrorMessage(error.message);
          }
          return;
        }

        if (!cancelled) {
          setStatus("success");
        }

        // Valfritt: skicka vidare automatiskt efter några sekunder
        setTimeout(() => {
          if (!cancelled) navigate("/");
        }, 1200);
      } catch (err: any) {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage(err?.message ?? "Okänt fel vid verifiering.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {status === "loading" && (
            <div className="flex justify-center mb-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
          )}

          {status === "success" && (
            <div className="flex justify-center mb-4">
              <MailCheck className="h-12 w-12 text-primary" />
            </div>
          )}

          {status === "error" && (
            <div className="flex justify-center mb-4">
              <AlertTriangle className="h-12 w-12 text-destructive" />
            </div>
          )}

          <CardTitle className="text-2xl">
            {status === "loading" && "Verifierar…"}
            {status === "success" && "E-post bekräftad!"}
            {status === "error" && "Kunde inte verifiera"}
          </CardTitle>

          <CardDescription>
            {status === "loading" && "Vänta medan vi bekräftar din e-postadress."}
            {status === "success" && "Klart! Du skickas vidare strax."}
            {status === "error" && (errorMessage ?? "Verifieringslänken kan vara felaktig eller utgången.")}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {status === "error" && (
            <div className="space-y-2">
              <Button className="w-full" onClick={() => navigate("/login")}>
                Till inloggning
              </Button>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => window.location.reload()}
              >
                Försök igen
              </Button>
            </div>
          )}

          {status === "success" && (
            <Button className="w-full" onClick={() => navigate("/")}>
              Gå till appen
            </Button>
          )}

          {status === "loading" && (
            <Button variant="outline" className="w-full" asChild>
              <Link to="/login">Tillbaka</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
