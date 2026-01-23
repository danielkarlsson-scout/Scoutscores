import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TreePine, Loader2, CheckCircle2, XCircle } from 'lucide-react';

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'checking' | 'success' | 'error'>('checking');

  useEffect(() => {
    const handleVerification = async () => {
      // The hash fragment contains the access token from the email link
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const type = hashParams.get('type');

      if (type === 'signup' || type === 'email_change') {
        // Supabase handles the verification automatically when the link is clicked
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          setStatus('success');
        } else {
          setStatus('error');
        }
      } else {
        // Check if already verified
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setStatus('success');
        } else {
          setStatus('error');
        }
      }
    };

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          setStatus('success');
        }
      }
    );

    handleVerification();

    return () => subscription.unsubscribe();
  }, []);

  if (status === 'checking') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Verifierar din e-post...</p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle2 className="h-12 w-12 text-primary" />
            </div>
            <CardTitle className="text-2xl">E-post verifierad!</CardTitle>
            <CardDescription>
              Din e-postadress har verifierats. Du kan nu logga in och använda ScoutScore.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/')} className="w-full">
              Fortsätt till appen
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <XCircle className="h-12 w-12 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Verifiering misslyckades</CardTitle>
          <CardDescription>
            Länken kan ha gått ut eller redan använts. 
            Försök logga in eller registrera dig igen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => navigate('/login')} className="w-full">
            Tillbaka till inloggning
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
