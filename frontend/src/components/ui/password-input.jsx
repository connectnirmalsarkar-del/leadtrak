import React, { useState, forwardRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * PasswordInput — drop-in replacement for `<Input type="password" />` that
 * adds a show/hide toggle (eye icon) on the right edge.
 *
 * Accepts all standard <Input> props (value, onChange, placeholder, required,
 * minLength, autoComplete, data-testid, etc.). The toggle button gets a
 * derived test id of `${testId}-toggle` when a `data-testid` is provided.
 */
export const PasswordInput = forwardRef(function PasswordInput(
  { className, 'data-testid': testId, ...props },
  ref
) {
  const [show, setShow] = useState(false);
  const toggleTestId = testId ? `${testId}-toggle` : 'password-toggle';
  return (
    <div className="relative">
      <Input
        {...props}
        ref={ref}
        type={show ? 'text' : 'password'}
        className={cn('pr-10', className)}
        data-testid={testId}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        tabIndex={-1}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-700 transition-colors"
        data-testid={toggleTestId}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
});
