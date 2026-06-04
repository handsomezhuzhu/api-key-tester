import { useState, type ReactNode } from 'react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { cn } from '@/lib/cn';

interface DropdownProps {
  trigger: ReactNode | ((open: boolean) => ReactNode);
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'left' | 'right';
  panelClassName?: string;
  triggerClassName?: string;
  block?: boolean;
}

export function Dropdown({
  trigger,
  children,
  align = 'right',
  panelClassName,
  triggerClassName,
  block,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));

  const triggerNode = typeof trigger === 'function' ? trigger(open) : trigger;
  const panelNode =
    typeof children === 'function' ? children(() => setOpen(false)) : children;

  return (
    <div ref={ref} className={cn('relative', block ? 'block' : 'inline-block')}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center gap-1 cursor-pointer select-none',
          triggerClassName,
        )}
      >
        {triggerNode}
      </button>
      {open && (
        <div
          className={cn(
            'absolute z-[var(--z-dropdown)] mt-2 min-w-[150px] rounded-card border border-border bg-canvas shadow-popover',
            'overflow-hidden',
            align === 'right' ? 'right-0' : 'left-0',
            panelClassName,
          )}
        >
          {panelNode}
        </div>
      )}
    </div>
  );
}

interface DropdownItemProps {
  active?: boolean;
  icon?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  children: ReactNode;
}

export function DropdownItem({
  active,
  icon,
  trailing,
  onClick,
  children,
}: DropdownItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center justify-between gap-3 px-2 py-2 text-btn cursor-pointer transition-colors',
        active
          ? 'bg-primary-soft text-primary'
          : 'text-fg hover:bg-hover',
      )}
    >
      <span className="flex items-center gap-2">
        {icon}
        {children}
      </span>
      {trailing}
    </button>
  );
}
