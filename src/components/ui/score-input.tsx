import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface ScoreInputProps {
  value: number;
  maxScore: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
}

export function ScoreInput({ value, maxScore, onChange, disabled, className }: ScoreInputProps) {
  const [localValue, setLocalValue] = useState(value.toString());

  // Sync local state when prop changes (e.g., switching stations)
  useEffect(() => {
    setLocalValue(value.toString());
  }, [value]);
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setLocalValue(inputValue);
    
    const numValue = parseInt(inputValue, 10);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= maxScore) {
      onChange(numValue);
    }
  };

  const handleBlur = () => {
    const numValue = parseInt(localValue, 10);
    if (isNaN(numValue) || numValue < 0) {
      setLocalValue('0');
      onChange(0);
    } else if (numValue > maxScore) {
      setLocalValue(maxScore.toString());
      onChange(maxScore);
    } else {
      setLocalValue(numValue.toString());
    }
  };

  const percentage = (value / maxScore) * 100;

  return (
    <div className={cn('relative', className)}>
      <Input
        type="number"
        min={0}
        max={maxScore}
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={disabled}
        className="w-20 text-center pr-8"
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        /{maxScore}
      </span>
      <div 
        className="absolute bottom-0 left-0 h-1 bg-primary rounded-b-md transition-all"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}
