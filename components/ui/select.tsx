"use client";

import * as React from "react";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  children: React.ReactNode;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = "", children, ...props }, ref) => (
    <select
      ref={ref}
      className={`w-full px-3 py-2 rounded-lg border border-ink-200/80 bg-white text-[13px] text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-300 transition-all appearance-none disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";
