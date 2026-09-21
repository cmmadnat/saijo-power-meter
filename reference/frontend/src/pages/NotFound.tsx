import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Home, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-accent/5 to-transparent blur-3xl" />
      <div className="text-center relative z-10 glass-effect p-12 rounded-2xl border border-border/50 max-w-md mx-4">
        <div className="mb-6 flex justify-center">
          <div className="p-4 rounded-full bg-destructive/10">
            <AlertTriangle className="w-16 h-16 text-destructive" />
          </div>
        </div>
        <h1 className="mb-4 text-6xl font-bold bg-gradient-to-r from-destructive to-warning bg-clip-text text-transparent">404</h1>
        <p className="mb-2 text-2xl font-semibold text-foreground">Oops! Page not found</p>
        <p className="mb-8 text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Button asChild className="gradient-primary shadow-lg">
          <Link to="/">
            <Home className="w-4 h-4 mr-2" />
            Return to Dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
