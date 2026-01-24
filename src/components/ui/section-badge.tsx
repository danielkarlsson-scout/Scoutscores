import { ScoutSection, SCOUT_SECTIONS } from '@/types/competition';
import { cn } from '@/lib/utils';

interface SectionBadgeProps {
  section: ScoutSection;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sectionColors: Record<ScoutSection, string> = {
  sparare: 'bg-[hsl(109, 60%, 41%))] text-white',
  upptackare: 'bg-[hsl(195, 100%, 44%)] text-white',
  aventyrare: 'bg-[hsl(21, 85%, 49%)] text-white',
  utmanare: 'bg-[hsl(334, 100%, 43%)] text-white',
};

const sizeClasses = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
  lg: 'px-4 py-1.5 text-base',
};

export function SectionBadge({ section, className, size = 'md' }: SectionBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full font-medium',
      sectionColors[section],
      sizeClasses[size],
      className
    )}>
      {SCOUT_SECTIONS[section].name}
    </span>
  );
}
