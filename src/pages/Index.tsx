import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Vault, ShieldCheck, ArrowRight, GraduationCap, Coins, Lock, BarChart3, Users, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import MetallumXLogo from '@/assets/MetallumXLogo.png';
import type { TrainingCourse } from '@/types/training';

const Index = () => {
  const { user } = useAuth();

  const { data: publicCourses = [] } = useQuery({
    queryKey: ['public-courses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('training_courses')
        .select('*')
        .eq('is_published', true)
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(3);
      
      if (error) throw error;
      return data as TrainingCourse[];
    },
  });

  // Redirect authenticated users without blocking render
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const features = [
    {
      icon: Lock,
      title: 'Secure Tokenization',
      description: 'Convert physical precious metals into blockchain-based digital tokens with military-grade security.',
    },
    {
      icon: ShieldCheck,
      title: 'Proof of Reserve',
      description: 'Every token is backed by verified physical assets with transparent attestation records.',
    },
    {
      icon: BarChart3,
      title: 'Real-Time Tracking',
      description: 'Monitor your holdings, track value changes, and manage your portfolio in real-time.',
    },
    {
      icon: Users,
      title: 'Governance',
      description: 'Participate in platform decisions through our decentralized governance system.',
    },
    {
      icon: Coins,
      title: 'MXG Rewards',
      description: 'Earn MXG tokens through platform activities, training completion, and referrals.',
    },
    {
      icon: Globe,
      title: 'Global Access',
      description: 'Trade and transfer tokenized assets instantly, anywhere in the world.',
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 sticky top-0 bg-background/95 backdrop-blur z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={MetallumXLogo} alt="MetallumX" className="h-16 w-auto object-contain" />
            <span className="text-xl font-bold gold-text">MetallumX Vault</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/reserves">
              <Button variant="ghost" size="sm" className="gap-2">
                <ShieldCheck className="h-4 w-4" />
                Verify Reserves
              </Button>
            </Link>
            <Link to="/auth">
              <Button size="sm" className="gap-2">
                Sign In
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="px-6 py-16 md:py-24">
          <div className="max-w-4xl mx-auto text-center">
            <img src={MetallumXLogo} alt="MetallumX" className="h-48 md:h-64 w-auto object-contain mx-auto mb-8" />
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Precious Metal <span className="gold-text">Tokenization</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Securely tokenize and verify real-world precious metal assets on the blockchain. 
              Transform physical gold, silver, and platinum into tradeable digital assets.
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Link to="/auth">
                <Button size="lg" className="gap-2">
                  Get Started
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
              <Link to="/reserves">
                <Button variant="outline" size="lg" className="gap-2">
                  <ShieldCheck className="h-5 w-5" />
                  Verify Reserves
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="px-6 py-16 bg-muted/30">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">Why MetallumX Vault?</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                A comprehensive platform for tokenizing, managing, and trading precious metal assets with complete transparency.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature) => (
                <Card key={feature.title} className="bg-card/50 border-border/50 hover:border-primary/30 transition-colors">
                  <CardHeader>
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                      <feature.icon className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-sm">{feature.description}</CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Public Courses Section */}
        {publicCourses.length > 0 && (
          <section className="px-6 py-16">
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-12">
                <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full mb-4">
                  <GraduationCap className="h-4 w-4" />
                  <span className="text-sm font-medium">Free Training</span>
                </div>
                <h2 className="text-3xl font-bold mb-4">Learn & Earn MXG</h2>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                  Complete training courses to understand precious metal tokenization and earn MXG rewards.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {publicCourses.map((course) => (
                  <Card key={course.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                    {course.thumbnail_url && (
                      <div className="aspect-video bg-muted">
                        <img
                          src={course.thumbnail_url}
                          alt={course.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <CardHeader>
                      <div className="flex items-center gap-2 mb-2">
                        {course.difficulty_level && (
                          <Badge variant="secondary" className="text-xs">
                            {course.difficulty_level}
                          </Badge>
                        )}
                        {course.mxg_reward_amount > 0 && (
                          <Badge className="text-xs bg-primary/10 text-primary hover:bg-primary/20">
                            +{course.mxg_reward_amount} MXG
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-lg">{course.title}</CardTitle>
                      <CardDescription className="line-clamp-2">
                        {course.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Link to={`/training/${course.id}`}>
                        <Button variant="outline" className="w-full gap-2">
                          <GraduationCap className="h-4 w-4" />
                          Start Learning
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="text-center mt-8">
                <Link to="/training">
                  <Button variant="ghost" className="gap-2">
                    View All Courses
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* CTA Section */}
        <section className="px-6 py-16 bg-primary/5">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
            <p className="text-muted-foreground mb-8">
              Join MetallumX Vault today and start tokenizing your precious metal assets with confidence.
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Link to="/auth">
                <Button size="lg" className="gap-2">
                  Create Account
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
              <Link to="/reserves">
                <Button variant="outline" size="lg" className="gap-2">
                  <ShieldCheck className="h-5 w-5" />
                  View Proof of Reserve
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>
<button
  onClick={runStripeTestCharge}
  style={{
    marginTop: "2rem",
    padding: "12px 18px",
    backgroundColor: "#635bff",
    color: "#fff",
    borderRadius: "6px",
    fontWeight: "600"
  }}
>
  🔒 Stripe $1 Test Charge
</button>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src={MetallumXLogo} alt="MetallumX" className="h-10 w-auto object-contain" />
              <span className="text-sm text-muted-foreground">© 2024 MetallumX Vault. All rights reserved.</span>
            </div>
            <div className="flex items-center gap-6">
              <Link to="/reserves" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Verify Reserves
              </Link>
              <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
