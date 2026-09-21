import { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface DashboardSummaryCardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  loading?: boolean;
  variant?: 'primary' | 'success' | 'warning' | 'accent';
}

export function DashboardSummaryCard({
  title,
  value,
  icon,
  loading = false,
  variant = 'primary'
}: DashboardSummaryCardProps) {
  const colorClasses = {
    primary: 'text-primary',
    success: 'text-[hsl(var(--success))]',
    warning: 'text-[hsl(var(--warning))]',
    accent: 'text-[hsl(var(--accent))]'
  };

  return (
    <Card className="card-hover glass-effect border-l-4 border-l-primary overflow-hidden relative group">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <CardContent className="pt-6 relative z-10">
        {icon && (
          <div className={cn("mb-3 p-2 rounded-lg bg-primary/10 w-fit group-hover:scale-110 transition-transform duration-300", colorClasses[variant])}>
            {icon}
          </div>
        )}
        <p className="text-sm text-muted-foreground mb-2">{title}</p>
        {loading ? (
          <Skeleton className="h-10 w-3/5" />
        ) : (
          <h3 className={cn("font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent", colorClasses[variant])}>
            {value}
          </h3>
        )}
      </CardContent>
    </Card>
  );
}
