"use client";

import * as React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  prefix?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", prefix, ...props }, ref) => {
    if (prefix) {
      return (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-400 pointer-events-none select-none">
            {prefix}
          </span>
          <input
            ref={ref}
            className={`w-full pl-6 pr-3 py-2 rounded-lg border border-ink-200/80 bg-white text-[13px] text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
            {...props}
          />
        </div>
      );
    }
    return (
      <input
        ref={ref}
        className={`w-full px-3 py-2 rounded-lg border border-ink-200/80 bg-white text-[13px] text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
