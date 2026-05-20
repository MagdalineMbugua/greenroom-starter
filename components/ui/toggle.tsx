"use client";

import * as React from "react";

interface ToggleOption<T extends string> {
  value: T;
  label: string;
}

interface ToggleProps<T extends string> {
  options: [ToggleOption<T>, ToggleOption<T>];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function Toggle<T extends string>({ options, value, onChange, className = "" }: ToggleProps<T>) {
  return (
    <div
      role="radiogroup"
      className={`inline-flex rounded-lg ring-1 ring-ink-200/80 overflow-hidden bg-white ${className}`}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          role="radio"
          aria-checked={value === opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-[13px] font-medium transition-colors ${
            value === opt.value
              ? "bg-brand-700 text-white"
              : "text-ink-600 hover:bg-canvas-soft"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

interface SegmentedControlProps<T extends string> {
  options: ToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function SegmentedControl<T extends string>({ options, value, onChange, className = "" }: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      className={`inline-flex rounded-lg ring-1 ring-ink-200/80 overflow-hidden bg-white ${className}`}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          role="radio"
          aria-checked={value === opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-[13px] font-medium transition-colors whitespace-nowrap ${
            value === opt.value
              ? "bg-brand-700 text-white"
              : "text-ink-600 hover:bg-canvas-soft"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
