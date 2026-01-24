import { ScoutSection, SCOUT_SECTIONS } from '@/types/competition';
import { cn } from '@/lib/utils';

interface SectionBadgeProps {
  section: ScoutSection;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sectionColors: Record<ScoutSection, string> = {
  sparare: 'bg-[hsl(150,60%,40%)] text-white',
  upptackare: 'bg-[hsl(200,70%,50%)] text-white',
  aventyrare: 'bg-[hsl(35,70%,50%)] text-white',
  utmanare: 'bg-[hsl(280,50%,45%)] text-white',
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
