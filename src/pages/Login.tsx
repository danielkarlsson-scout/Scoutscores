import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TreePine, Loader2, Mail, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Login() {
  const navigate = useNavigate();
  const { signIn } = useAuth(); // ✅ signUp tas bort här
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [signupSuccess, setSignupSuccess] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await signIn(loginEmail, loginPassword);

    if (error) {
      toast({
        title: 'Inloggning misslyckades',
        description:
          error.message === 'Email not confirmed'
            ? 'Din e-post är inte verifierad. Kolla din inkorg för verifieringslänken.'
            : error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Välkommen!',
        description: 'Du är nu inloggad.',
      });
      navigate('/');
    }

    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (signupPassword !== signupConfirmPassword) {
      toast({
        title: 'Lösenorden matchar inte',
        description: 'Kontrollera att lösenorden är identiska.',
        variant: 'destructive',
      });
      return;
    }

    if (signupPassword.length < 6) {
      toast({
        title: 'Lösenord för kort',
        description: 'Lösenordet måste vara minst 6 tecken.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    // ✅ VIKTIGT: emailRedirectTo för att inte få localhost-länk i mail
    const redirectTo =
      import.meta.env.PROD
        ? 'https://scoutscores.vercel.app/verify-email'
        : 'http://localhost:5173/verify-email';

    const { error } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPassword,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      toast({
        title: 'Registrering misslyckades',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setSignupSuccess(true);
    }

    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const redirectTo =
      import.meta.env.PROD
        ? 'https://scoutscores.vercel.app/reset-password'
        : 'http://localhost:5173/reset-password';

    const { error } = await supabase.auth.resetPasswordForEmail(forgotPasswordEmail, {
      redirectTo,
    });

    if (error) {
      toast({
        title: 'Kunde inte skicka återställningslänk',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setResetEmailSent(true);
    }

    setLoading(false);
  };

  // Show forgot password form
  if (showForgotPassword) {
    if (resetEmailSent) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <Mail className="h-12 w-12 text-primary" />
              </div>
              <CardTitle className="text-2xl">Kolla din e-post</CardTitle>
              <CardDescription>
                Vi har skickat en återställningslänk till <strong>{forgotPasswordEmail}</strong>.
                Klicka på länken i e-postmeddelandet för att välja ett nytt lösenord.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setShowForgotPassword(false);
                  setResetEmailSent(false);
                  setForgotPasswordEmail('');
                }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Tillbaka till inloggning
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
              <TreePine className="h-12 w-12 text-primary" />
            </div>
            <CardTitle className="text-2xl">Glömt lösenord?</CardTitle>
            <CardDescription>
              Ange din e-postadress så skickar vi en återställningslänk.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">E-post</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  value={forgotPasswordEmail}
                  onChange={(e) => setForgotPasswordEmail(e.target.value)}
                  required
                  disabled={loading}
                  placeholder="din@epost.se"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Skicka återställningslänk
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setShowForgotPassword(false)}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Tillbaka till inloggning
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show signup success message
  if (signupSuccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Mail className="h-12 w-12 text-primary" />
            </div>
            <CardTitle className="text-2xl">Bekräfta din e-post</CardTitle>
            <CardDescription>
              Vi har skickat ett verifieringsmeddelande till <strong>{signupEmail}</strong>.
              Klicka på länken i e-postmeddelandet för att aktivera ditt konto.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Hittar du inte e-posten? Kolla din skräppost.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setSignupSuccess(false);
                setSignupEmail('');
                setSignupPassword('');
                setSignupConfirmPassword('');
              }}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Tillbaka till inloggning
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
            <TreePine className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl">ScoutScore</CardTitle>
          <CardDescription>Logga in för att hantera tävlingen</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Logga in</TabsTrigger>
              <TabsTrigger value="signup">Registrera</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">E-post</Label>
                  <Input
                    id="login-email"
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password">Lösenord</Label>
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="text-sm text-primary hover:underline"
                    >
                      Glömt lösenord?
                    </button>
                  </div>
                  <Input
                    id="login-password"
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Logga in
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-email">E-post</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Lösenord</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-confirm">Bekräfta lösenord</Label>
                  <Input
                    id="signup-confirm"
                    type="password"
                    value={signupConfirmPassword}
                    onChange={(e) => setSignupConfirmPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Registrera
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Du kommer att få ett e-postmeddelande för att verifiera din adress.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
