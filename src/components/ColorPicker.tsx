"use client";

import { useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";

export function ColorPicker({
  className,
  value,
  onChange,
  ...fieldProps
}: React.ComponentProps<"input">) {
  const [internalValue, setInternalValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const openColorPicker = () => {
    if (inputRef.current) {
      inputRef.current.click();
    }
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInternalValue(newValue);
    onChange?.(e); // Call external onChange if provided
  };

  return (
    <div className={cn("flex relative items-center justify-center", className)}>
      <Button
        type="button"
        variant="ghost"
        onClick={openColorPicker}
        className="absolute left-1 size-8 p-0 rounded transition-all"
      >
        <div
          className="size-4 rounded border pointer-events-none"
          style={{ backgroundColor: (value || internalValue) as string }}
        />
      </Button>

      <Input
        type="color"
        className="absolute left-1 w-8 h-full opacity-0"
        value={value || internalValue}
        onChange={handleColorChange}
        {...fieldProps}
        ref={inputRef}
      />

      <Input
        type="text"
        className="!px-9"
        value={value || internalValue}
        onChange={(e) => {
          const newValue = e.target.value;
          setInternalValue(newValue);
          onChange?.(e); // Call external onChange if provided
        }}
        {...fieldProps}
      />
    </div>
  );
}
