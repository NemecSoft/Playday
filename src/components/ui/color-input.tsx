// 颜色输入组件（shadcn 风格，shadcn 无官方 color 组件，这里封装一个标准组件）：
// 把"取色器 + hex 文本输入"合成一个控件，业务组件直接用，不再手写原生 color input。
// 供卡片文字样式编辑器等地方复用，避免各处重复实现。
import * as React from "react";
import { cn } from "../../lib/utils";
import { Input } from "./input";

interface ColorInputProps {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

export function ColorInput({ value, onChange, className }: ColorInputProps) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {/* 原生 color 取色器（浏览器自带取色面板，最合适） */}
      <input
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent p-0.5"
        aria-label="选择颜色"
      />
      {/* hex 文本输入（可手填精确色值） */}
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-[76px] px-1.5 font-mono text-[11px]"
        aria-label="颜色值"
      />
    </div>
  );
}
