"use client";

import * as React from "react";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = "", ...props }, ref) => (
    <textarea
      ref={ref}
      className={`w-full px-3 py-2 rounded-lg border border-ink-200/80 bg-white text-[13px] text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-300 transition-all resize-y disabled:opacity-50 disabled:cursor-not-allowed min-h-[120px] leading-relaxed ${className}`}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
